/**
 * JSONL processing utilities for Claude Code output.
 */

/** JSONL message types */
export const JSONL_TYPE_RESULT = "result";
export const JSONL_TYPE_ASSISTANT = "assistant";

/** Check if output appears to be JSONL format. */
export function isJsonlOutput(output: string): boolean {
  return output.startsWith('{"type":') && output.includes('\n{"type":');
}

/** Truncate regular text output. */
function truncateRegularOutput(
  output: string,
  maxLength: number,
  suffix: string
): string {
  if (output.length <= maxLength) return output;
  const truncateAt = maxLength - suffix.length;
  return output.slice(0, truncateAt) + suffix;
}

/** JSONL content extraction utilities */
export class JsonlProcessor {
  /** Extract content from a JSONL message object. */
  static extractMessageContent(data: Record<string, any>): string | null {
    if (data.type === JSONL_TYPE_RESULT && data.result) {
      return data.result;
    }
    if (data.type === JSONL_TYPE_ASSISTANT && data.message?.content?.[0]?.text) {
      return data.message.content[0].text;
    }
    return null;
  }

  /** Process JSONL output by extracting the most relevant content. */
  static processOutput(output: string, maxLength: number, suffix: string): string {
    const lines = output.trim().split("\n");

    // Search backwards for extractable content
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const data = JSON.parse(lines[i]);
        const content = this.extractMessageContent(data);
        if (content) {
          return truncateOutput(content, maxLength, suffix);
        }
      } catch {
        // skip invalid JSON lines
      }
    }

    return `[JSONL output with ${lines.length} messages]${suffix}`;
  }
}

/** Truncate output for display, with special JSONL handling. */
export function truncateOutput(
  output: string,
  maxLength: number = 500,
  suffix: string = "... (truncated)"
): string {
  if (isJsonlOutput(output)) {
    return JsonlProcessor.processOutput(output, maxLength, suffix);
  }
  return truncateRegularOutput(output, maxLength, suffix);
}