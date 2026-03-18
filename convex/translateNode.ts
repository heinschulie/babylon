'use node';

import { v } from 'convex/values';
import { action } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import { classifyExternalFetchError, fetchWithTimeout } from './lib/fetchWithTimeout';
import { normalizeLanguage } from './lib/languages';
import { classifyAppErrorCode, summarizeErrorForLog } from './lib/safeErrors';
import {
	assertMaxLength,
	enforceLocalRateLimit,
	requireNonEmptyTrimmed
} from './lib/publicActionGuards';

const MAX_ENGLISH_LENGTH = 500;
const MAX_USER_TRANSLATION_LENGTH = 500;
const MAX_TARGET_LANGUAGE_LENGTH = 64;
const GOOGLE_TRANSLATE_TIMEOUT_MS = 8_000;

/**
 * Verify translation spelling using Google Translate API.
 * Translates the English text to the target language and compares with user's translation.
 */
export const verifyTranslation = action({
	args: {
		english: v.string(),
		userTranslation: v.string(),
		targetLanguage: v.string()
	},
	handler: async (ctx, { english, userTranslation, targetLanguage }) => {
		const userId = await getAuthUserId(ctx);
		enforceLocalRateLimit({
			bucket: 'translate.verifyTranslation',
			subject: userId,
			limit: 30,
			windowMs: 60_000
		});

		const normalizedEnglish = requireNonEmptyTrimmed(english, 'english');
		const normalizedUserTranslation = requireNonEmptyTrimmed(userTranslation, 'userTranslation');
		const normalizedTargetLanguage = requireNonEmptyTrimmed(targetLanguage, 'targetLanguage');
		assertMaxLength(normalizedEnglish, 'english', MAX_ENGLISH_LENGTH);
		assertMaxLength(normalizedUserTranslation, 'userTranslation', MAX_USER_TRANSLATION_LENGTH);
		assertMaxLength(normalizedTargetLanguage, 'targetLanguage', MAX_TARGET_LANGUAGE_LENGTH);

		const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

		if (!apiKey) {
			// If no API key configured, return success without verification
			console.warn('GOOGLE_TRANSLATE_API_KEY not configured, skipping translation verification');
			return {
				verified: true,
				suggestedTranslation: null,
				message: 'Translation verification not available (API key not configured)'
			};
		}

		try {
			// Map common language names to Google Translate language codes
			const languageCode = getLanguageCode(normalizedTargetLanguage);

			// Call Google Translate API
			const response = await fetchWithTimeout(
				`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						q: normalizedEnglish,
						source: 'en',
						target: languageCode,
						format: 'text'
					}),
					timeoutMs: GOOGLE_TRANSLATE_TIMEOUT_MS,
					service: 'google_translate',
					operation: 'verify_translation',
					retries: 0
				}
			);

			if (!response.ok) {
				console.error('Google Translate API error', {
					errorCode: 'upstream_response',
					status: response.status,
					statusText: response.statusText
				});
				return {
					verified: true,
					suggestedTranslation: null,
					message: 'Could not verify translation (API error)'
				};
			}

			const data = await response.json();
			const googleTranslation = data.data.translations[0].translatedText;

			// Compare translations (normalize for comparison)
			const normalizedUser = normalizeForComparison(normalizedUserTranslation);
			const normalizedGoogle = normalizeForComparison(googleTranslation);

			// Calculate similarity
			const similarity = calculateSimilarity(normalizedUser, normalizedGoogle);
			const isAcceptable = similarity >= 0.7; // 70% similarity threshold

			return {
				verified: isAcceptable,
				suggestedTranslation: googleTranslation,
				userTranslation: normalizedUserTranslation,
				similarity: Math.round(similarity * 100),
				message: isAcceptable
					? 'Translation looks correct!'
					: `Your translation may have spelling differences. Google suggests: "${googleTranslation}"`
			};
		} catch (error) {
			console.error('Translation verification error', {
				errorCode: classifyAppErrorCode(error),
				errorType: classifyExternalFetchError(error),
				...summarizeErrorForLog(error)
			});
			return {
				verified: true,
				suggestedTranslation: null,
				message: 'Could not verify translation'
			};
		}
	}
});

/**
 * Get Google Translate suggestion for a phrase.
 */
export const getSuggestion = action({
	args: {
		english: v.string(),
		targetLanguage: v.string()
	},
	handler: async (ctx, { english, targetLanguage }) => {
		const userId = await getAuthUserId(ctx);
		enforceLocalRateLimit({
			bucket: 'translate.getSuggestion',
			subject: userId,
			limit: 20,
			windowMs: 60_000
		});

		const normalizedEnglish = requireNonEmptyTrimmed(english, 'english');
		const normalizedTargetLanguage = requireNonEmptyTrimmed(targetLanguage, 'targetLanguage');
		assertMaxLength(normalizedEnglish, 'english', MAX_ENGLISH_LENGTH);
		assertMaxLength(normalizedTargetLanguage, 'targetLanguage', MAX_TARGET_LANGUAGE_LENGTH);

		const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

		if (!apiKey) {
			return {
				success: false,
				suggestion: null,
				message: 'Translation service not configured'
			};
		}

		try {
			const languageCode = getLanguageCode(normalizedTargetLanguage);

			const response = await fetchWithTimeout(
				`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						q: normalizedEnglish,
						source: 'en',
						target: languageCode,
						format: 'text'
					}),
					timeoutMs: GOOGLE_TRANSLATE_TIMEOUT_MS,
					service: 'google_translate',
					operation: 'get_suggestion',
					retries: 0
				}
			);

			if (!response.ok) {
				console.error('Google Translate suggestion API error', {
					errorCode: 'upstream_response',
					status: response.status,
					statusText: response.statusText
				});
				return {
					success: false,
					suggestion: null,
					message: 'Translation service error'
				};
			}

			const data = await response.json();
			const suggestion = data.data.translations[0].translatedText;

			return {
				success: true,
				suggestion,
				message: 'Translation suggestion retrieved'
			};
		} catch (error) {
			console.error('Get suggestion error', {
				errorCode: classifyAppErrorCode(error),
				errorType: classifyExternalFetchError(error),
				...summarizeErrorForLog(error)
			});
			return {
				success: false,
				suggestion: null,
				message: 'Could not get translation suggestion'
			};
		}
	}
});

/**
 * Map common language names to Google Translate language codes.
 */
function getLanguageCode(language: string): string {
	const supported = normalizeLanguage(language);
	if (supported) {
		return supported.iso639_1;
	}

	const normalized = language.toLowerCase().trim();
	if (normalized.includes('-')) {
		return normalized.split('-')[0];
	}
	return normalized;
}

/**
 * Normalize text for comparison (lowercase, remove punctuation and extra spaces).
 */
function normalizeForComparison(text: string): string {
	return text
		.toLowerCase()
		.replace(/[.,!?;:'"¿¡«»„"‚']/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Calculate similarity between two strings using Levenshtein distance.
 */
function calculateSimilarity(str1: string, str2: string): number {
	if (str1 === str2) return 1;
	if (str1.length === 0 || str2.length === 0) return 0;

	const matrix: number[][] = [];

	// Initialize matrix
	for (let i = 0; i <= str1.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= str2.length; j++) {
		matrix[0][j] = j;
	}

	// Fill matrix
	for (let i = 1; i <= str1.length; i++) {
		for (let j = 1; j <= str2.length; j++) {
			const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1, // deletion
				matrix[i][j - 1] + 1, // insertion
				matrix[i - 1][j - 1] + cost // substitution
			);
		}
	}

	const distance = matrix[str1.length][str2.length];
	const maxLength = Math.max(str1.length, str2.length);
	return 1 - distance / maxLength;
}
