'use node';

import { v } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';
import { getAnthropicDraftingModel } from './lib/anthropicModel';
import { normalizeLanguage } from './lib/languages';
import { classifyExternalFetchError, fetchWithTimeout } from './lib/fetchWithTimeout';
import {
	classifyAppErrorCode,
	readSafeErrorBodySnippet,
	summarizeErrorForLog,
	toClientSafeError
} from './lib/safeErrors';

const DRAFTING_TIMEOUT_MS = 120_000;

type DraftedUnit = {
	title: string;
	introBody: string;
	newHandles: Array<{ key: string; label: string; gloss: string }>;
	prompts: Array<{
		english: string;
		translation: string;
		phonetic?: string;
		morphemeBreakdown: Array<{ morpheme: string; gloss: string; role: string }>;
		usesHandles: string[];
		primaryHandleKey: string;
	}>;
};

function buildDraftingSystemPrompt(languageName: string) {
	return [
		`You are a master ${languageName} curriculum designer using the Michel Thomas construction method.`,
		'',
		'METHOD RULES:',
		'- Each unit introduces 1-4 new "handles": small structural building blocks (subject concords, verb roots, tense/negation markers, question words, connectors).',
		'- Every prompt asks the learner to CONSTRUCT a sentence they have never seen, from handles they own. Never ask them to repeat or memorize.',
		'- Prompts must recombine handles from EARLIER units alongside the new ones — the unit silently revises everything that came before.',
		'- Sequence prompts from simplest (new handle alone) to richest (new + several old handles).',
		'- The intro is a short, warm, plain-text explanation of the new handles: what each piece means, how it sounds, one or two example constructions. No tables, no jargon. Write like a relaxed teacher in the room.',
		'',
		'OUTPUT: respond with ONLY valid JSON matching:',
		'{',
		'  "title": "<unit title, e.g. Saying what you want>",',
		'  "introBody": "<plain text intro, \\n for paragraphs>",',
		'  "newHandles": [{"key": "<snake_case stable key>", "label": "<the form, e.g. ndi- (I)>", "gloss": "<what it does>"}],',
		'  "prompts": [{',
		'    "english": "<English sentence to construct>",',
		'    "translation": "<correct target-language sentence>",',
		'    "phonetic": "<syllable guide, UPPERCASE stressed syllables, hyphens between syllables>",',
		'    "morphemeBreakdown": [{"morpheme": "<piece>", "gloss": "<meaning>", "role": "<grammatical role>"}],',
		'    "usesHandles": ["<handle keys this prompt exercises>"],',
		'    "primaryHandleKey": "<the single key this prompt mainly trains — must be in usesHandles>"',
		'  }]',
		'}',
		'',
		'CONSTRAINTS:',
		'- 10 to 16 prompts.',
		'- usesHandles may ONLY contain keys from the existing inventory plus your newHandles.',
		'- Translations must be natural, correct everyday speech. If unsure of a form, choose a simpler sentence you are sure of.',
		'- morphemeBreakdown must cover every morpheme in the translation, in order.'
	].join('\n');
}

/**
 * Admin action: draft the next unit of a course with AI, constrained to the
 * existing handle inventory. Writes a DRAFT unit + handles + prompts for
 * human review in the admin app — nothing is published automatically.
 */
export const draftNextUnit = action({
	args: {
		courseId: v.id('courses'),
		guidance: v.optional(v.string())
	},
	handler: async (ctx, args): Promise<{ unitId: string }> => {
		const userId = await getAuthUserId(ctx);
		await ctx.runQuery(internal.courseAuthoring.assertAdminForAction, { userId });

		const context = await ctx.runQuery(internal.courseAuthoring.getDraftingContext, {
			courseId: args.courseId
		});
		const languageName = normalizeLanguage(context.languageCode)?.displayName ?? 'Xhosa';

		const apiKey = process.env.CONVEX_ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new Error('CONVEX_ANTHROPIC_API_KEY is not configured');
		}

		const userMessage = [
			`Existing handle inventory (${context.handles.length}):`,
			context.handles.length === 0
				? '(none yet — this is unit 1; start from the most fundamental building blocks)'
				: JSON.stringify(context.handles, null, 1),
			'',
			`Units so far: ${context.units.length === 0 ? '(none)' : context.units.map((u) => `${u.index}. ${u.title} [${u.handleKeys.join(', ')}]`).join('; ')}`,
			'',
			`Draft unit ${context.nextUnitIndex}.`,
			args.guidance ? `Author guidance for this unit: ${args.guidance}` : ''
		]
			.filter(Boolean)
			.join('\n');

		let response: Response;
		try {
			response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify({
					model: getAnthropicDraftingModel(),
					max_tokens: 8000,
					system: buildDraftingSystemPrompt(languageName),
					messages: [{ role: 'user', content: userMessage }]
				}),
				timeoutMs: DRAFTING_TIMEOUT_MS,
				service: 'anthropic',
				operation: 'draft_course_unit',
				retries: 0
			});
		} catch (error) {
			console.error('Unit drafting request failed', {
				errorCode: classifyAppErrorCode(error),
				errorType: classifyExternalFetchError(error),
				...summarizeErrorForLog(error)
			});
			throw toClientSafeError(error, 'Could not draft the unit right now. Please try again.');
		}

		if (!response.ok) {
			const bodySnippet = await readSafeErrorBodySnippet(response);
			console.error('Unit drafting API error', {
				status: response.status,
				bodySnippet
			});
			throw new Error('Unit drafting failed. Please try again.');
		}

		const result = (await response.json()) as {
			content?: Array<{ type: string; text?: string }>;
		};
		const text = result.content?.find((block) => block.type === 'text')?.text ?? '';

		let drafted: DraftedUnit;
		try {
			const jsonStart = text.indexOf('{');
			const jsonEnd = text.lastIndexOf('}');
			drafted = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as DraftedUnit;
		} catch {
			console.error('Unit drafting returned unparseable JSON', { snippet: text.slice(0, 200) });
			throw new Error('The draft came back malformed. Please try again.');
		}

		if (!drafted.title || !drafted.introBody || !Array.isArray(drafted.prompts)) {
			throw new Error('The draft is missing required fields. Please try again.');
		}

		const unitId = await ctx.runMutation(internal.courseAuthoring.insertDraftUnit, {
			courseId: args.courseId,
			title: drafted.title,
			introBody: drafted.introBody,
			newHandles: drafted.newHandles ?? [],
			prompts: drafted.prompts.map((prompt) => ({
				english: prompt.english,
				translation: prompt.translation,
				phonetic: prompt.phonetic,
				morphemeBreakdown: prompt.morphemeBreakdown ?? [],
				usesHandles: prompt.usesHandles ?? [],
				primaryHandleKey: prompt.primaryHandleKey
			}))
		});

		return { unitId };
	}
});
