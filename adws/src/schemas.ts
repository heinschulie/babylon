import { z } from "zod";

// --- Enums ---

export const RetryCodeEnum = z.enum([
  "claude_code_error",
  "timeout_error",
  "execution_error",
  "error_during_execution",
  "none",
]);
export type RetryCode = z.infer<typeof RetryCodeEnum>;

export const IssueClassSlashCommandEnum = z.enum(["/chore", "/bug", "/feature"]);
export type IssueClassSlashCommand = z.infer<typeof IssueClassSlashCommandEnum>;

export const ModelSetEnum = z.enum(["base", "heavy"]);
export type ModelSet = z.infer<typeof ModelSetEnum>;

export const ADWWorkflowEnum = z.enum([
  "adw_plan_iso",
  "adw_patch_iso",
  "adw_build_iso",
  "adw_test_iso",
  "adw_review_iso",
  "adw_document_iso",
  "adw_ship_iso",
  "adw_sdlc_ZTE_iso",
  "adw_plan_build_iso",
  "adw_plan_build_test_iso",
  "adw_plan_build_test_review_iso",
  "adw_plan_build_document_iso",
  "adw_plan_build_review_iso",
  "adw_sdlc_iso",
]);
export type ADWWorkflow = z.infer<typeof ADWWorkflowEnum>;

export const SlashCommandEnum = z.enum([
  "/chore",
  "/bug",
  "/feature",
  "/classify_issue",
  "/classify_adw",
  "/generate_branch_name",
  "/commit",
  "/pull_request",
  "/implement",
  "/test",
  "/resolve_failed_test",
  "/test_e2e",
  "/resolve_failed_e2e_test",
  "/review",
  "/patch",
  "/document",
  "/track_agentic_kpis",
  "/install_worktree",
]);
export type SlashCommand = z.infer<typeof SlashCommandEnum>;

// --- GitHub Types ---

export const GitHubUserSchema = z.object({
  id: z.string().optional(),
  login: z.string(),
  name: z.string().nullable().optional(),
  is_bot: z.boolean().default(false),
});
export type GitHubUser = z.infer<typeof GitHubUserSchema>;

export const GitHubLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  description: z.string().nullable().optional(),
});
export type GitHubLabel = z.infer<typeof GitHubLabelSchema>;

export const GitHubMilestoneSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  state: z.string(),
});
export type GitHubMilestone = z.infer<typeof GitHubMilestoneSchema>;

export const GitHubCommentSchema = z.object({
  id: z.string(),
  author: GitHubUserSchema,
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
});
export type GitHubComment = z.infer<typeof GitHubCommentSchema>;

export const GitHubIssueListItemSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string(),
  labels: z.array(GitHubLabelSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GitHubIssueListItem = z.infer<typeof GitHubIssueListItemSchema>;

export const GitHubIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string(),
  state: z.string(),
  author: GitHubUserSchema,
  assignees: z.array(GitHubUserSchema).default([]),
  labels: z.array(GitHubLabelSchema).default([]),
  milestone: GitHubMilestoneSchema.nullable().optional(),
  comments: z.array(GitHubCommentSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable().optional(),
  url: z.string(),
});
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

// --- Agent Types ---

export const AgentPromptRequestSchema = z.object({
  prompt: z.string(),
  adw_id: z.string(),
  agent_name: z.string().default("ops"),
  model: z.enum(["sonnet", "opus"]).default("sonnet"),
  dangerously_skip_permissions: z.boolean().default(false),
  output_file: z.string(),
  working_dir: z.string().optional(),
});
export type AgentPromptRequest = z.infer<typeof AgentPromptRequestSchema>;

export const AgentPromptResponseSchema = z.object({
  output: z.string(),
  success: z.boolean(),
  session_id: z.string().nullable().optional(),
  retry_code: RetryCodeEnum.default("none"),
});
export type AgentPromptResponse = z.infer<typeof AgentPromptResponseSchema>;

export const AgentTemplateRequestSchema = z.object({
  agent_name: z.string(),
  slash_command: SlashCommandEnum,
  args: z.array(z.string()),
  adw_id: z.string(),
  model: z.enum(["sonnet", "opus"]).default("sonnet"),
  working_dir: z.string().optional(),
});
export type AgentTemplateRequest = z.infer<typeof AgentTemplateRequestSchema>;

export const ClaudeCodeResultMessageSchema = z.object({
  type: z.string(),
  subtype: z.string(),
  is_error: z.boolean(),
  duration_ms: z.number(),
  duration_api_ms: z.number(),
  num_turns: z.number(),
  result: z.string(),
  session_id: z.string(),
  total_cost_usd: z.number(),
});
export type ClaudeCodeResultMessage = z.infer<typeof ClaudeCodeResultMessageSchema>;

// --- Test/Review Types ---

export const TestResultSchema = z.object({
  test_name: z.string(),
  passed: z.boolean(),
  execution_command: z.string(),
  test_purpose: z.string(),
  error: z.string().optional(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

export const E2ETestResultSchema = z.object({
  test_name: z.string(),
  status: z.enum(["passed", "failed"]),
  test_path: z.string(),
  screenshots: z.array(z.string()).default([]),
  error: z.string().optional(),
});
export type E2ETestResult = z.infer<typeof E2ETestResultSchema>;

export const ReviewIssueSchema = z.object({
  review_issue_number: z.number(),
  screenshot_path: z.string(),
  screenshot_url: z.string().nullable().optional(),
  issue_description: z.string(),
  issue_resolution: z.string(),
  issue_severity: z.enum(["skippable", "tech_debt", "blocker"]),
});
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

export const ReviewResultSchema = z.object({
  success: z.boolean(),
  review_summary: z.string(),
  review_issues: z.array(ReviewIssueSchema).default([]),
  screenshots: z.array(z.string()).default([]),
  screenshot_urls: z.array(z.string()).default([]),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

export const DocumentationResultSchema = z.object({
  success: z.boolean(),
  documentation_created: z.boolean(),
  documentation_path: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
});
export type DocumentationResult = z.infer<typeof DocumentationResultSchema>;

// --- State ---

export const ADWStateDataSchema = z.object({
  adw_id: z.string(),
  issue_number: z.string().nullable().optional(),
  branch_name: z.string().nullable().optional(),
  plan_file: z.string().nullable().optional(),
  issue_class: IssueClassSlashCommandEnum.nullable().optional(),
  worktree_path: z.string().nullable().optional(),
  backend_port: z.number().nullable().optional(),
  frontend_port: z.number().nullable().optional(),
  model_set: ModelSetEnum.nullable().default("base"),
  all_adws: z.array(z.string()).default([]),
});
export type ADWStateData = z.infer<typeof ADWStateDataSchema>;

// --- Extraction ---

export const ADWExtractionResultSchema = z.object({
  workflow_command: z.string().nullable().optional(),
  adw_id: z.string().nullable().optional(),
  model_set: ModelSetEnum.default("base"),
});
export type ADWExtractionResult = z.infer<typeof ADWExtractionResultSchema>;
