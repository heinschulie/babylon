import { join } from "path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import {
  type AgentPromptRequest,
  type AgentPromptResponse,
  type AgentTemplateRequest,
  type SlashCommand,
  type ModelSet,
  type RetryCode,
} from "./schemas";
import { exec, getProjectRoot, getSafeSubprocessEnv } from "./utils";
import { ADWState } from "./state";
import type { Logger } from "./logger";

/** Claude Code CLI path */
const CLAUDE_PATH = process.env.CLAUDE_CODE_PATH ?? "claude";

/** Model selection mapping: command → { base model, heavy model } */
export const SLASH_COMMAND_MODEL_MAP: Record<
  SlashCommand,
  Record<ModelSet, string>
> = {
  "/classify_issue": { base: "sonnet", heavy: "sonnet" },
  "/classify_adw": { base: "sonnet", heavy: "sonnet" },
  "/generate_branch_name": { base: "sonnet", heavy: "sonnet" },
  "/implement": { base: "sonnet", heavy: "opus" },
  "/test": { base: "sonnet", heavy: "sonnet" },
  "/resolve_failed_test": { base: "sonnet", heavy: "opus" },
  "/test_e2e": { base: "sonnet", heavy: "sonnet" },
  "/resolve_failed_e2e_test": { base: "sonnet", heavy: "opus" },
  "/review": { base: "sonnet", heavy: "sonnet" },
  "/document": { base: "sonnet", heavy: "opus" },
  "/commit": { base: "sonnet", heavy: "sonnet" },
  "/pull_request": { base: "sonnet", heavy: "sonnet" },
  "/chore": { base: "sonnet", heavy: "opus" },
  "/bug": { base: "sonnet", heavy: "opus" },
  "/feature": { base: "sonnet", heavy: "opus" },
  "/patch": { base: "sonnet", heavy: "opus" },
  "/install_worktree": { base: "sonnet", heavy: "sonnet" },
  "/track_agentic_kpis": { base: "sonnet", heavy: "sonnet" },
};

/** Get the appropriate model for a template request based on state's model_set. */
export function getModelForSlashCommand(
  request: AgentTemplateRequest,
  defaultModel: string = "sonnet"
): string {
  let modelSet: ModelSet = "base";
  const state = ADWState.load(request.adw_id);
  if (state) {
    modelSet = (state.get("model_set") as ModelSet) ?? "base";
  }

  const config = SLASH_COMMAND_MODEL_MAP[request.slash_command];
  if (config) {
    return config[modelSet] ?? config.base ?? defaultModel;
  }
  return defaultModel;
}

/** Truncate output for display, with special JSONL handling. */
function truncateOutput(
  output: string,
  maxLength: number = 500,
  suffix: string = "... (truncated)"
): string {
  if (output.startsWith('{"type":') && output.includes('\n{"type":')) {
    const lines = output.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const data = JSON.parse(lines[i]);
        if (data.type === "result" && data.result) {
          return truncateOutput(data.result, maxLength, suffix);
        }
        if (data.type === "assistant" && data.message?.content?.[0]?.text) {
          return truncateOutput(data.message.content[0].text, maxLength, suffix);
        }
      } catch {
        // skip
      }
    }
    return `[JSONL output with ${lines.length} messages]${suffix}`;
  }

  if (output.length <= maxLength) return output;
  const truncateAt = maxLength - suffix.length;
  return output.slice(0, truncateAt) + suffix;
}

/** Check if Claude Code CLI is installed. */
async function checkClaudeInstalled(): Promise<string | null> {
  try {
    const { exitCode } = await exec([CLAUDE_PATH, "--version"]);
    if (exitCode !== 0)
      return `Error: Claude Code CLI not functional at: ${CLAUDE_PATH}`;
  } catch {
    return `Error: Claude Code CLI not found at: ${CLAUDE_PATH}`;
  }
  return null;
}

/** Save a prompt to the logging directory. */
function savePrompt(prompt: string, adwId: string, agentName: string): void {
  const match = prompt.match(/^(\/\w+)/);
  if (!match) return;

  const commandName = match[1].slice(1);
  const promptDir = join(
    getProjectRoot(),
    "agents",
    adwId,
    agentName,
    "prompts"
  );
  mkdirSync(promptDir, { recursive: true });
  writeFileSync(join(promptDir, `${commandName}.txt`), prompt);
}

/** Parse JSONL output file and return all messages + result message. */
export function parseJsonlOutput(
  outputFile: string
): [Record<string, unknown>[], Record<string, unknown> | null] {
  try {
    const content = readFileSync(outputFile, "utf-8");
    const messages: Record<string, unknown>[] = [];

    // Parse each line individually to avoid partial JSON failures
    for (const line of content.split("\n")) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      try {
        const parsed = JSON.parse(trimmedLine);
        messages.push(parsed);
      } catch (parseError) {
        // Log individual line parsing errors but continue processing
        console.warn(`Failed to parse JSONL line: ${trimmedLine.slice(0, 100)}...`, parseError);
      }
    }

    let resultMessage: Record<string, unknown> | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === "result") {
        resultMessage = messages[i];
        break;
      }
    }

    return [messages, resultMessage];
  } catch (fileError) {
    console.warn(`Failed to read JSONL file ${outputFile}:`, fileError);
    return [[], null];
  }
}

/** Convert JSONL file to JSON array file. */
export function convertJsonlToJson(jsonlFile: string): string {
  const jsonFile = jsonlFile.replace(".jsonl", ".json");
  const [messages] = parseJsonlOutput(jsonlFile);
  writeFileSync(jsonFile, JSON.stringify(messages, null, 2));
  return jsonFile;
}

/** Execute Claude Code with retry logic. */
export async function promptClaudeCodeWithRetry(
  request: AgentPromptRequest,
  maxRetries: number = 3,
  retryDelays: number[] = [1000, 3000, 5000]
): Promise<AgentPromptResponse> {
  // Ensure enough delays
  while (retryDelays.length < maxRetries) {
    retryDelays.push(retryDelays[retryDelays.length - 1] + 2000);
  }

  let lastResponse: AgentPromptResponse | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await Bun.sleep(retryDelays[attempt - 1]);
    }

    const response = await promptClaudeCode(request);
    lastResponse = response;

    if (response.success || response.retry_code === "none") {
      return response;
    }

    // All retry codes are retryable
    if (attempt < maxRetries) continue;
  }

  return lastResponse!;
}

/** Execute Claude Code with the given prompt configuration. */
export async function promptClaudeCode(
  request: AgentPromptRequest
): Promise<AgentPromptResponse> {
  // Check installation
  const installError = await checkClaudeInstalled();
  if (installError) {
    return {
      output: installError,
      success: false,
      session_id: null,
      retry_code: "none",
    };
  }

  // Save prompt
  savePrompt(request.prompt, request.adw_id, request.agent_name);

  // Create output directory
  const outputDir = join(request.output_file, "..");
  mkdirSync(outputDir, { recursive: true });

  // Build command
  const cmd = [CLAUDE_PATH, "-p", request.prompt];
  cmd.push("--model", request.model);
  cmd.push("--output-format", "stream-json");
  cmd.push("--verbose");

  // Check for MCP config
  if (request.working_dir) {
    const mcpConfig = join(request.working_dir, ".mcp.json");
    if (existsSync(mcpConfig)) {
      cmd.push("--mcp-config", mcpConfig);
    }
  }

  if (request.dangerously_skip_permissions) {
    cmd.push("--dangerously-skip-permissions");
  }

  const env = getSafeSubprocessEnv();

  try {
    // Execute Claude Code, streaming stdout to file
    const proc = Bun.spawn(cmd, {
      cwd: request.working_dir,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Stream stdout to file
    const stdoutText = await new Response(proc.stdout).text();
    writeFileSync(request.output_file, stdoutText);

    const stderrText = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    // Small delay to ensure file is fully written before reading
    await Bun.sleep(100);

    if (exitCode === 0) {
      const [messages, resultMessage] = parseJsonlOutput(request.output_file);
      convertJsonlToJson(request.output_file);

      if (resultMessage) {
        const sessionId = resultMessage.session_id as string | undefined;
        const isError = resultMessage.is_error as boolean;
        const subtype = resultMessage.subtype as string;

        if (subtype === "error_during_execution") {
          return {
            output:
              "Error during execution: Agent encountered an error and did not return a result",
            success: false,
            session_id: sessionId ?? null,
            retry_code: "error_during_execution",
          };
        }

        let resultText = (resultMessage.result as string) ?? "";
        if (isError && resultText.length > 1000) {
          resultText = truncateOutput(resultText, 800);
        }

        return {
          output: resultText,
          success: !isError,
          session_id: sessionId ?? null,
          retry_code: "none",
        };
      } else {
        // No result message found, try to extract from parsed messages first
        let outputText = "No result message found in Claude Code output";
        let sessionId: string | null = null;

        // Try to extract from parsed messages first
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg.type === "assistant" && msg.message?.content?.[0]?.text) {
            outputText = msg.message.content[0].text as string;
            sessionId = msg.session_id as string | null;
            break;
          }
        }

        // Fallback: try to extract from raw stdout
        if (outputText === "No result message found in Claude Code output") {
          try {
            const lines = stdoutText.trim().split("\n").slice(-5);
            for (let i = lines.length - 1; i >= 0; i--) {
              const data = JSON.parse(lines[i]);
              if (data.type === "assistant" && data.message?.content?.[0]?.text) {
                outputText = `${data.message.content[0].text.slice(0, 500)}`;
                sessionId = data.session_id as string | null;
                break;
              }
            }
          } catch {
            // ignore parsing errors
          }
        }

        // For simple prompts that get responses, this should be considered success
        const isSimpleResponse = outputText && outputText !== "No result message found in Claude Code output";

        return {
          output: truncateOutput(outputText, 800),
          success: isSimpleResponse,
          session_id: sessionId,
          retry_code: "none",
        };
      }
    } else {
      // Non-zero exit code
      let errorMsg: string;

      // Try to parse JSONL for structured error
      const [, resultMessage] = parseJsonlOutput(request.output_file);
      if (resultMessage?.is_error) {
        errorMsg = `Claude Code error: ${resultMessage.result ?? "Unknown error"}`;
      } else if (stderrText) {
        errorMsg = `Claude Code error: ${stderrText}`;
      } else {
        errorMsg = `Claude Code error: Command failed with exit code ${exitCode}`;
      }

      return {
        output: truncateOutput(errorMsg, 800),
        success: false,
        session_id: null,
        retry_code: "claude_code_error",
      };
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("timeout")) {
      return {
        output: "Error: Claude Code command timed out",
        success: false,
        session_id: null,
        retry_code: "timeout_error",
      };
    }
    return {
      output: `Error executing Claude Code: ${e}`,
      success: false,
      session_id: null,
      retry_code: "execution_error",
    };
  }
}

/** Execute a Claude Code template with slash command and arguments. */
export async function executeTemplate(
  request: AgentTemplateRequest
): Promise<AgentPromptResponse> {
  // Get the appropriate model
  const mappedModel = getModelForSlashCommand(request);
  const updatedRequest = { ...request, model: mappedModel as "sonnet" | "opus" };

  // Construct prompt
  const prompt = `${updatedRequest.slash_command} ${updatedRequest.args.join(" ")}`;

  // Create output directory
  const outputDir = join(
    getProjectRoot(),
    "agents",
    updatedRequest.adw_id,
    updatedRequest.agent_name
  );
  mkdirSync(outputDir, { recursive: true });

  const outputFile = join(outputDir, "raw_output.jsonl");

  const promptRequest: AgentPromptRequest = {
    prompt,
    adw_id: updatedRequest.adw_id,
    agent_name: updatedRequest.agent_name,
    model: updatedRequest.model,
    dangerously_skip_permissions: true,
    output_file: outputFile,
    working_dir: updatedRequest.working_dir,
  };

  return promptClaudeCodeWithRetry(promptRequest);
}
