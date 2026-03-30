/** Shared emoji configuration, validation, and utilities used by testEmojiMutation and testReactions. */

export const EMOJI_CONFIG: Record<string, { sentence: string; mood: string }> = {
	'😎': { sentence: 'The cat wore sunglasses to the job interview', mood: 'chill' },
	'💩': { sentence: 'Someone left a flaming bag on the porch again', mood: 'angry' },
	'🔥': { sentence: 'The server room is fine, everything is fine', mood: 'happy' },
};

export const VALID_EMOJIS = Object.keys(EMOJI_CONFIG);

/** Validate emoji is in EMOJI_CONFIG; throws descriptive error if not. Returns config entry. */
export function validateEmoji(emoji: string): { sentence: string; mood: string } {
	const config = EMOJI_CONFIG[emoji];
	if (!config) {
		throw new Error(`Invalid emoji: ${emoji}. Must be one of: ${VALID_EMOJIS.join(', ')}`);
	}
	return config;
}

/** Group entries by emoji and return sorted counts (descending, alphabetical tiebreak). */
export function countByEmoji(entries: Array<{ emoji: string }>): Array<{ emoji: string; count: number }> {
	const counts = new Map<string, number>();
	for (const { emoji } of entries) {
		counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.map(([emoji, count]) => ({ emoji, count }))
		.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}
