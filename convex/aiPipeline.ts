'use node';

import { v } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';

export const processAttempt = action({
	args: {
		attemptId: v.id('attempts'),
		phraseId: v.id('phrases'),
		englishPrompt: v.string(),
		targetPhrase: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await getActionUserId(ctx);
		const attempt = await ctx.runQuery(internal.aiPipelineData.getAttemptById, {
			attemptId: args.attemptId
		});
		if (!attempt || attempt.userId !== userId) {
			throw new Error('Attempt not found or not authorized');
		}

		try {
			const audioAsset = await ctx.runQuery(internal.aiPipelineData.getAudioAssetByAttempt, {
				attemptId: args.attemptId
			});

			if (!audioAsset) {
				throw new Error('Audio asset not found for attempt.');
			}

			const audioData = await ctx.storage.get(audioAsset.storageKey);
			if (!audioData) {
				throw new Error('Audio blob not available in storage.');
			}

			const audioBuffer = await toArrayBuffer(audioData);

			const transcriptResult = await transcribeWithWhisper({
				audioBuffer,
				contentType: audioAsset.contentType
			});

			const feedbackResult = await generateFeedbackWithClaude({
				englishPrompt: args.englishPrompt,
				targetPhrase: args.targetPhrase,
				transcript: transcriptResult.transcript
			});

			await ctx.runMutation(internal.aiPipelineData.insertAiFeedback, {
				attemptId: args.attemptId,
				transcript: transcriptResult.transcript ?? undefined,
				confidence: transcriptResult.confidence,
				errorTags: feedbackResult.errorTags,
				score: feedbackResult.score,
				feedbackText: feedbackResult.feedbackText
			});

			await ctx.runMutation(internal.aiPipelineData.patchAttemptStatus, {
				attemptId: args.attemptId,
				status: 'feedback_ready'
			});

			return { feedbackText: feedbackResult.feedbackText };
		} catch (error) {
			await ctx.runMutation(internal.aiPipelineData.patchAttemptStatus, {
				attemptId: args.attemptId,
				status: 'failed'
			});
			throw error;
		}
	}
});

async function transcribeWithWhisper(input: {
	audioBuffer: ArrayBuffer;
	contentType: string;
}): Promise<{ transcript: string | null; confidence?: number }> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		return { transcript: null, confidence: 0 };
	}

	const form = new FormData();
	const blob = new Blob([input.audioBuffer], { type: input.contentType });
	form.append('file', blob, 'audio.webm');
	form.append('model', 'whisper-1');
	// Whisper doesn't support all language codes via API; let it auto-detect.

	const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`
		},
		body: form
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Whisper API error: ${errorText}`);
	}

	const data = await response.json();
	return { transcript: data.text ?? null };
}

async function toArrayBuffer(data: ArrayBuffer | Blob): Promise<ArrayBuffer> {
	if (data instanceof ArrayBuffer) {
		return data;
	}
	return await data.arrayBuffer();
}

async function getActionUserId(ctx: { auth: { getUserIdentity: () => Promise<{ subject?: string } | null> } }): Promise<string> {
	const identity = await ctx.auth.getUserIdentity();
	if (identity?.subject) {
		return identity.subject;
	}
	throw new Error('Not authenticated');
}

async function generateFeedbackWithClaude(input: {
	englishPrompt: string;
	targetPhrase: string;
	transcript: string | null;
}): Promise<{ feedbackText: string; score?: number; errorTags?: string[] }> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		return { feedbackText: 'AI feedback is not configured yet.' };
	}

	const prompt = [
		'You are a Xhosa pronunciation coach for English speakers.',
		'Provide concise feedback (2-4 sentences) focused on intelligibility.',
		'Call out likely click errors or prefix issues if relevant.',
		'If transcript is empty, tell the user to try again clearly.'
	].join(' ');

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 200,
			system: prompt,
			messages: [
				{
					role: 'user',
					content: `English prompt: ${input.englishPrompt}\nTarget Xhosa: ${input.targetPhrase}\nUser transcript: ${input.transcript ?? 'N/A'}`
				}
			]
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Claude API error: ${errorText}`);
	}

	const data = await response.json();
	const text = data?.content?.[0]?.text ?? 'Feedback not available.';
	return { feedbackText: text };
}
