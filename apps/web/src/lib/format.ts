/**
 * Format a timestamp as a relative time string (e.g., "now", "3 minutes ago").
 */
export function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffMinutes = Math.floor(diffMs / (1000 * 60));

	if (diffMinutes < 1) return 'now';
	if (diffMinutes === 1) return '1 minute ago';
	return `${diffMinutes} minutes ago`;
}
