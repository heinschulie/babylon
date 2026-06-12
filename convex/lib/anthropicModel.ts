// claude-sonnet-4-20250514 (the previously hardcoded model) retires 2026-06-15.
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export function getAnthropicModel() {
	return process.env.CONVEX_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}
