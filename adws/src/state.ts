import { join } from "path";
import { mkdirSync, existsSync, readFileSync } from "fs";
import { ADWStateDataSchema, type ADWStateData } from "./schemas";
import { getProjectRoot } from "./utils";
import type { Logger } from "./logger";

const STATE_FILENAME = "adw_state.json";

const CORE_FIELDS = new Set([
  "adw_id",
  "issue_number",
  "branch_name",
  "plan_file",
  "issue_class",
  "worktree_path",
  "backend_port",
  "frontend_port",
  "model_set",
  "all_adws",
]);

export class ADWState {
  readonly adwId: string;
  private data: Record<string, unknown>;

  constructor(adwId: string) {
    if (!adwId) throw new Error("adw_id is required for ADWState");
    this.adwId = adwId;
    this.data = { adw_id: adwId };
  }

  update(fields: Partial<ADWStateData>): void {
    for (const [key, value] of Object.entries(fields)) {
      if (CORE_FIELDS.has(key)) {
        this.data[key] = value;
      }
    }
  }

  get<K extends keyof ADWStateData>(key: K): ADWStateData[K] | undefined;
  get(key: string, defaultValue?: unknown): unknown;
  get(key: string, defaultValue?: unknown): unknown {
    return this.data[key] ?? defaultValue;
  }

  appendAdwId(adwId: string): void {
    const allAdws = (this.data.all_adws as string[]) ?? [];
    if (!allAdws.includes(adwId)) {
      allAdws.push(adwId);
      this.data.all_adws = allAdws;
    }
  }

  getWorkingDirectory(): string {
    const worktreePath = this.data.worktree_path as string | undefined;
    if (worktreePath) return worktreePath;
    return getProjectRoot();
  }

  getStatePath(): string {
    return join(getProjectRoot(), "agents", this.adwId, STATE_FILENAME);
  }

  async save(_workflowStep?: string): Promise<void> {
    const statePath = this.getStatePath();
    mkdirSync(join(statePath, ".."), { recursive: true });

    // Validate with Zod before saving
    const stateData = ADWStateDataSchema.parse(this.data);
    await Bun.write(statePath, JSON.stringify(stateData, null, 2));
  }

  static load(adwId: string, logger?: Logger): ADWState | null {
    const statePath = join(
      getProjectRoot(),
      "agents",
      adwId,
      STATE_FILENAME
    );

    if (!existsSync(statePath)) return null;

    try {
      const raw = readFileSync(statePath, "utf-8");
      const data = JSON.parse(raw);
      const stateData = ADWStateDataSchema.parse(data);

      const state = new ADWState(stateData.adw_id);
      state.data = stateData as Record<string, unknown>;

      if (logger) {
        logger.info(`Found existing state from ${statePath}`);
        logger.debug(`State: ${JSON.stringify(stateData, null, 2)}`);
      }

      return state;
    } catch (e) {
      if (logger) logger.error(`Failed to load state from ${statePath}: ${e}`);
      return null;
    }
  }

  static fromStdin(): ADWState | null {
    // In Bun, check if stdin is a TTY
    if (process.stdin.isTTY) return null;
    try {
      // Synchronous stdin read isn't straightforward in Bun
      // This is rarely used — keep as no-op for now
      return null;
    } catch {
      return null;
    }
  }

  toStdout(): void {
    const outputData: Record<string, unknown> = {
      adw_id: this.data.adw_id,
      issue_number: this.data.issue_number,
      branch_name: this.data.branch_name,
      plan_file: this.data.plan_file,
      issue_class: this.data.issue_class,
      worktree_path: this.data.worktree_path,
      backend_port: this.data.backend_port,
      frontend_port: this.data.frontend_port,
      all_adws: this.data.all_adws ?? [],
    };
    console.log(JSON.stringify(outputData, null, 2));
  }
}
