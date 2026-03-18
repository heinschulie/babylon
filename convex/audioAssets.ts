import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getAuthUserId } from './lib/auth';

const MAX_STORAGE_KEY_LENGTH = 256;
const MAX_AUDIO_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_AUDIO_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function normalizeMimeEssence(contentType: string): string {
	return contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function requireStorageKeyShape(storageKey: string): string {
	const normalized = storageKey.trim();
	if (!normalized || normalized.length > MAX_STORAGE_KEY_LENGTH || /\s/.test(normalized)) {
		throw new Error('Invalid storage key');
	}
	return normalized;
}

function requireAudioContentType(contentType: string): string {
	const normalized = contentType.trim();
	const mime = normalizeMimeEssence(normalized);
	if (!mime || !mime.startsWith('audio/')) {
		throw new Error('Invalid content type');
	}
	return normalized;
}

// Register an uploaded audio asset (storageKey is provider-specific)
export const create = mutation({
	args: {
		storageKey: v.string(),
		contentType: v.string(),
		phraseId: v.optional(v.id('phrases')),
		attemptId: v.optional(v.id('attempts')),
		durationMs: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const storageKey = requireStorageKeyShape(args.storageKey);
		const contentType = requireAudioContentType(args.contentType);
		const contentMime = normalizeMimeEssence(contentType);

		if (args.durationMs !== undefined && (args.durationMs < 0 || args.durationMs > MAX_AUDIO_DURATION_MS)) {
			throw new Error('Invalid audio duration');
		}

		const [phrase, attempt] = await Promise.all([
			args.phraseId ? ctx.db.get(args.phraseId) : Promise.resolve(null),
			args.attemptId ? ctx.db.get(args.attemptId) : Promise.resolve(null)
		]);

		if (args.phraseId && (!phrase || phrase.userId !== userId)) {
			throw new Error('Phrase not found or not authorized');
		}

		if (args.attemptId) {
			if (!attempt) {
				throw new Error('Attempt not found or not authorized');
			}

			const ownsAttempt = attempt.userId === userId;
			let hasActiveVerifierClaim = false;
			if (!ownsAttempt) {
				const reviewRequest = await ctx.db
					.query('humanReviewRequests')
					.withIndex('by_attempt', (q) => q.eq('attemptId', args.attemptId!))
					.unique();
				hasActiveVerifierClaim = Boolean(
					reviewRequest &&
						reviewRequest.status === 'claimed' &&
						reviewRequest.claimedByVerifierUserId === userId &&
						(reviewRequest.claimDeadlineAt === undefined || reviewRequest.claimDeadlineAt > Date.now())
				);
			}

			if (!ownsAttempt && !hasActiveVerifierClaim) {
				throw new Error('Attempt not found or not authorized');
			}
		}

		if (phrase && attempt && attempt.phraseId !== phrase._id) {
			throw new Error('Attempt and phrase do not match');
		}

		try {
			const metadata = await ctx.storage.getMetadata(storageKey as Id<'_storage'>);
			if (!metadata) {
				throw new Error('Uploaded file not found');
			}
			if (metadata.size > MAX_AUDIO_FILE_SIZE_BYTES) {
				throw new Error('Audio file too large');
			}
			if (metadata.contentType) {
				const uploadedMime = normalizeMimeEssence(metadata.contentType);
				if (!uploadedMime.startsWith('audio/')) {
					throw new Error('Invalid uploaded file type');
				}
				if (uploadedMime !== contentMime) {
					throw new Error('Content type mismatch');
				}
			}
		} catch (error) {
			// convex-test currently lacks storage metadata syscalls; keep prod validation when supported.
			if (
				error instanceof Error &&
				error.message.includes('convexTest') &&
				error.message.includes('storageGetMetadata')
			) {
				// no-op in tests
			} else {
				throw error;
			}
		}

		return await ctx.db.insert('audioAssets', {
			userId,
			storageKey,
			contentType,
			phraseId: args.phraseId,
			attemptId: args.attemptId,
			durationMs: args.durationMs,
			createdAt: Date.now()
		});
	}
});

// List audio assets for a phrase
export const listByPhrase = query({
	args: { phraseId: v.id('phrases') },
	handler: async (ctx, { phraseId }) => {
		const userId = await getAuthUserId(ctx);
		return await ctx.db
			.query('audioAssets')
			.withIndex('by_phrase', (q) => q.eq('phraseId', phraseId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.order('desc')
			.collect();
	}
});
