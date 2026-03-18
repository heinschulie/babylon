'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { classifyExternalFetchError, fetchWithTimeout } from './lib/fetchWithTimeout';
import {
	classifyAppErrorCode,
	readSafeErrorBodySnippet,
	summarizeErrorForLog
} from './lib/safeErrors';

const TRANSLATE_PHRASE_TIMEOUT_MS = 20_000;

export const translateAndPhoneticize = internalAction({
	args: {
		phraseId: v.id('phrases'),
		english: v.string(),
		languageCode: v.string()
	},
	handler: async (ctx, args) => {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			await ctx.runMutation(internal.translatePhraseData.patchTranslation, {
				phraseId: args.phraseId,
				translation: args.english,
				phonetic: '',
				status: 'failed'
			});
			return;
		}

		const prompt = [
			'You are a language translation assistant specialising in isiXhosa.',
			'',
			'Given an English phrase, provide:',
			'1. The isiXhosa translation',
			'2. A phonetic pronunciation guide using simple syllable breakdown',
			'',
			'Phonetic rules:',
			'- Use UPPERCASE for stressed syllables',
			'- Separate syllables with hyphens within words',
			'- Separate words with spaces',
			'- Use English-approximation sounds (not IPA)',
			'- For clicks: c = dental click (like tsk), q = palatal click, x = lateral click',
			'',
			'Example: "Hello, how are you?" → { "translation": "Molo, unjani?", "phonetic": "MOH-loh, oon-JAH-nee" }',
			'',
			'Respond with ONLY valid JSON: {"translation": "...", "phonetic": "..."}'
		].join('\n');

		try {
			const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify({
					model: 'claude-sonnet-4-20250514',
					max_tokens: 300,
					system: prompt,
					messages: [{ role: 'user', content: `Translate to isiXhosa: "${args.english}"` }]
				}),
				timeoutMs: TRANSLATE_PHRASE_TIMEOUT_MS,
				service: 'anthropic',
				operation: 'translate_phrase',
				retries: 0
			});

			if (!response.ok) {
				const bodySnippet = await readSafeErrorBodySnippet(response);
				console.error('Translate phrase provider error', {
					errorCode: 'upstream_response',
					status: response.status,
					statusText: response.statusText,
					bodySnippet
				});
				throw new Error('Translation provider error');
			}

			const data = await response.json();
			const text = data?.content?.[0]?.text ?? '';
			const parsed = JSON.parse(text);

			await ctx.runMutation(internal.translatePhraseData.patchTranslation, {
				phraseId: args.phraseId,
				translation: parsed.translation ?? args.english,
				phonetic: parsed.phonetic ?? '',
				status: 'ready'
			});
		} catch (error) {
			console.error('Translation error', {
				errorCode: classifyAppErrorCode(error),
				errorType: classifyExternalFetchError(error),
				...summarizeErrorForLog(error)
			});
			await ctx.runMutation(internal.translatePhraseData.patchTranslation, {
				phraseId: args.phraseId,
				translation: args.english,
				phonetic: '',
				status: 'failed'
			});
		}
	}
});
