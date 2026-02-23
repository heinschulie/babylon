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
				soundAccuracy: feedbackResult.soundAccuracy,
				rhythmIntonation: feedbackResult.rhythmIntonation,
				phraseAccuracy: feedbackResult.phraseAccuracy,
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

function clampScore(val: unknown): number | undefined {
	if (typeof val !== 'number') return undefined;
	return Math.max(1, Math.min(5, Math.round(val)));
}

async function generateFeedbackWithClaude(input: {
	englishPrompt: string;
	targetPhrase: string;
	transcript: string | null;
}): Promise<{
	feedbackText: string;
	soundAccuracy?: number;
	rhythmIntonation?: number;
	phraseAccuracy?: number;
	errorTags?: string[];
}> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		return { feedbackText: 'AI feedback is not configured yet.' };
	}

	const prompt = [
		'You are a Xhosa pronunciation coach grading an English speaker\'s isiXhosa attempt.',
		'',
		'A speech-to-text system transcribed the learner\'s audio. The transcript is the system\'s best guess at what the learner said while attempting the TARGET Xhosa phrase. Do NOT interpret it as a word in any other language. Always analyse it as an attempt at the target phrase.',
		'',
		'Grade the attempt on three dimensions (1-5 integer each):',
		'',
		'1. **Sound Accuracy** (soundAccuracy): How accurately the learner produces individual sounds — clicks (c, q, x), vowels, consonants. 5 = native-like sound production, 1 = most sounds unrecognisable.',
		'',
		'2. **Rhythm & Intonation** (rhythmIntonation): Natural flow, stress patterns, syllable timing, and tonal contour. 5 = natural isiXhosa prosody, 1 = flat/choppy/wrong stress throughout.',
		'',
		'3. **Phrase Accuracy** (phraseAccuracy): Overall correctness of the full phrase — right words in right order, no omissions or substitutions. 5 = complete and correct, 1 = mostly wrong or missing words.',
		'',
		'If the transcript is empty or garbled, score all dimensions as 1 and encourage re-recording.',
		'',
		'Also provide brief coaching feedback: one encouraging summary sentence, then a numbered list of specific corrections needed. Each item should name the word/sound, what was said vs target, and a tip. Spell out syllables e.g. "MA-si". Skip words that were fine. Be encouraging but honest.',
		'',
		'Respond with ONLY valid JSON in this exact format:',
		'{"soundAccuracy": <1-5>, "rhythmIntonation": <1-5>, "phraseAccuracy": <1-5>, "feedback": "<coaching text>"}'
	].join('\n');

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 500,
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
	const text = data?.content?.[0]?.text ?? '';
	try {
		const parsed = JSON.parse(text);
		return {
			soundAccuracy: clampScore(parsed.soundAccuracy),
			rhythmIntonation: clampScore(parsed.rhythmIntonation),
			phraseAccuracy: clampScore(parsed.phraseAccuracy),
			feedbackText: parsed.feedback ?? 'Feedback not available.'
		};
	} catch {
		return { feedbackText: text || 'Feedback not available.' };
	}
}
