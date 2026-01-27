'use node';

import { v } from 'convex/values';
import { action } from './_generated/server';

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
	handler: async (_ctx, { english, userTranslation, targetLanguage }) => {
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
			const languageCode = getLanguageCode(targetLanguage);

			// Call Google Translate API
			const response = await fetch(
				`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						q: english,
						source: 'en',
						target: languageCode,
						format: 'text'
					})
				}
			);

			if (!response.ok) {
				const error = await response.text();
				console.error('Google Translate API error:', error);
				return {
					verified: true,
					suggestedTranslation: null,
					message: 'Could not verify translation (API error)'
				};
			}

			const data = await response.json();
			const googleTranslation = data.data.translations[0].translatedText;

			// Compare translations (normalize for comparison)
			const normalizedUser = normalizeForComparison(userTranslation);
			const normalizedGoogle = normalizeForComparison(googleTranslation);

			// Calculate similarity
			const similarity = calculateSimilarity(normalizedUser, normalizedGoogle);
			const isAcceptable = similarity >= 0.7; // 70% similarity threshold

			return {
				verified: isAcceptable,
				suggestedTranslation: googleTranslation,
				userTranslation: userTranslation,
				similarity: Math.round(similarity * 100),
				message: isAcceptable
					? 'Translation looks correct!'
					: `Your translation may have spelling differences. Google suggests: "${googleTranslation}"`
			};
		} catch (error) {
			console.error('Translation verification error:', error);
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
	handler: async (_ctx, { english, targetLanguage }) => {
		const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

		if (!apiKey) {
			return {
				success: false,
				suggestion: null,
				message: 'Translation service not configured'
			};
		}

		try {
			const languageCode = getLanguageCode(targetLanguage);

			const response = await fetch(
				`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						q: english,
						source: 'en',
						target: languageCode,
						format: 'text'
					})
				}
			);

			if (!response.ok) {
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
			console.error('Get suggestion error:', error);
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
	const languageMap: Record<string, string> = {
		spanish: 'es',
		french: 'fr',
		german: 'de',
		italian: 'it',
		portuguese: 'pt',
		dutch: 'nl',
		russian: 'ru',
		japanese: 'ja',
		chinese: 'zh',
		korean: 'ko',
		arabic: 'ar',
		hindi: 'hi',
		turkish: 'tr',
		polish: 'pl',
		vietnamese: 'vi',
		thai: 'th',
		greek: 'el',
		hebrew: 'he',
		swedish: 'sv',
		norwegian: 'no',
		danish: 'da',
		finnish: 'fi',
		czech: 'cs',
		hungarian: 'hu',
		romanian: 'ro',
		ukrainian: 'uk',
		indonesian: 'id',
		malay: 'ms',
		tagalog: 'tl',
		swahili: 'sw',
		afrikaans: 'af'
	};

	const normalized = language.toLowerCase().trim();
	return languageMap[normalized] || normalized;
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
