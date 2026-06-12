// claude-sonnet-4-20250514 (the previously hardcoded model) retires 2026-06-15.
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export function getAnthropicModel() {
	return process.env.CONVEX_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

// Curriculum drafting is low-volume and quality-critical — default to the most
// capable model rather than the per-attempt feedback model.
const DEFAULT_DRAFTING_MODEL = 'claude-opus-4-8';

export function getAnthropicDraftingModel() {
	return process.env.CONVEX_ANTHROPIC_DRAFTING_MODEL?.trim() || DEFAULT_DRAFTING_MODEL;
}
