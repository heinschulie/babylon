import type { ConvexClient } from 'convex/browser';
import { api, type Id } from '@babylon/convex';

export async function uploadWithRetry(uploadUrl: string, blob: Blob): Promise<string> {
	const maxAttempts = 3;
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await fetch(uploadUrl, {
				method: 'POST',
				headers: { 'Content-Type': blob.type || 'audio/webm' },
				body: blob
			});
			if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
			const result = (await response.json()) as { storageId?: string };
			if (!result.storageId) throw new Error('Upload response missing storageId');
			return result.storageId;
		} catch (err) {
			lastError = err;
			if (attempt < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
			}
		}
	}
	throw lastError instanceof Error ? lastError : new Error('Upload failed');
}

export type SubmitAttemptParams = {
	client: ConvexClient;
	phraseId: Id<'phrases'>;
	practiceSessionId?: Id<'practiceSessions'>;
	english: string;
	translation: string;
	blob: Blob;
	durationMs: number;
};

export type SubmitAttemptResult = {
	attemptId: Id<'attempts'>;
	/** Background AI processing; failures are logged and marked server-side. */
	aiProcessing: Promise<unknown>;
};

/**
 * The full attempt submission chain: create attempt → upload audio (retried) →
 * register asset → attach → kick off AI processing. On post-create failure the
 * attempt is marked failed so it can't linger as eternally "processing".
 */
export async function submitAttempt(params: SubmitAttemptParams): Promise<SubmitAttemptResult> {
	const { client, phraseId, practiceSessionId, english, translation, blob, durationMs } = params;

	let attemptId: Id<'attempts'> | null = null;
	try {
		attemptId = await client.mutation(api.attempts.create, {
			phraseId,
			practiceSessionId,
			durationMs
		});

		const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrl, {});
		const storageId = await uploadWithRetry(uploadUrl, blob);

		const audioAssetId = await client.mutation(api.audioAssets.create, {
			storageKey: storageId,
			contentType: blob.type || 'audio/webm',
			phraseId,
			attemptId,
			durationMs
		});

		await client.mutation(api.attempts.attachAudio, { attemptId, audioAssetId });

		const aiProcessing = client
			.action(api.aiPipeline.processAttempt, {
				attemptId,
				phraseId,
				englishPrompt: english,
				targetPhrase: translation
			})
			.catch((err) => {
				console.error('AI processing failed for attempt', attemptId, err);
			});

		return { attemptId, aiProcessing };
	} catch (err) {
		if (attemptId) {
			client.mutation(api.attempts.markFailed, { attemptId, reason: 'upload_failed' }).catch(() => {});
		}
		throw err;
	}
}
