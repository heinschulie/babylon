type LocalRateLimitBucket = {
	count: number
	resetAt: number
}

const localRateLimitBuckets = new Map<string, LocalRateLimitBucket>()

type LocalRateLimitArgs = {
	bucket: string
	subject: string
	limit: number
	windowMs: number
}

/**
 * Best-effort process-local limiter for expensive public-facing actions.
 * This reduces burst abuse even though it is not global across instances.
 */
export function enforceLocalRateLimit({ bucket, subject, limit, windowMs }: LocalRateLimitArgs) {
	const now = Date.now()
	const key = `${bucket}:${subject}`
	const current = localRateLimitBuckets.get(key)
	const state =
		!current || current.resetAt <= now
			? { count: 0, resetAt: now + windowMs }
			: current

	if (state.count >= limit) {
		throw new Error('Too many requests. Please try again shortly.')
	}

	state.count += 1
	localRateLimitBuckets.set(key, state)

	// Keep the in-memory map bounded during long-lived runtimes.
	if (localRateLimitBuckets.size > 5000) {
		for (const [bucketKey, bucketState] of localRateLimitBuckets.entries()) {
			if (bucketState.resetAt <= now) {
				localRateLimitBuckets.delete(bucketKey)
			}
		}
	}
}

export function requireNonEmptyTrimmed(value: string, field: string): string {
	const trimmed = value.trim()
	if (!trimmed) {
		throw new Error(`${field} is required`)
	}
	return trimmed
}

export function assertMaxLength(value: string, field: string, max: number) {
	if (value.length > max) {
		throw new Error(`${field} is too long`)
	}
}

