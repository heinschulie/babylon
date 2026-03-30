export const MAX_TAGS = 5;

/** Validate tag count + trim + reject empties. Returns normalized array or throws. */
export function validateAndNormalizeTags(tags: string[]): string[] {
	if (tags.length > MAX_TAGS) {
		throw new Error(`Maximum ${MAX_TAGS} tags allowed`);
	}
	return tags.map(tag => {
		const trimmed = tag.trim();
		if (!trimmed) throw new Error('Tags must not be empty');
		return trimmed;
	});
}
