export type SupportedLanguage = {
	bcp47: string;
	iso639_1: string;
	displayName: string;
	aliases: string[];
};

// Keep this list intentionally small and explicit until we roll out more languages.
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
	{
		bcp47: 'es-ES',
		iso639_1: 'es',
		displayName: 'Spanish',
		aliases: ['spanish', 'es', 'es-es']
	},
	{
		bcp47: 'fr-FR',
		iso639_1: 'fr',
		displayName: 'French',
		aliases: ['french', 'fr', 'fr-fr']
	},
	{
		bcp47: 'de-DE',
		iso639_1: 'de',
		displayName: 'German',
		aliases: ['german', 'de', 'de-de']
	},
	{
		bcp47: 'it-IT',
		iso639_1: 'it',
		displayName: 'Italian',
		aliases: ['italian', 'it', 'it-it']
	},
	{
		bcp47: 'pt-PT',
		iso639_1: 'pt',
		displayName: 'Portuguese',
		aliases: ['portuguese', 'pt', 'pt-pt', 'pt-br']
	},
	{
		bcp47: 'nl-NL',
		iso639_1: 'nl',
		displayName: 'Dutch',
		aliases: ['dutch', 'nl', 'nl-nl']
	},
	{
		bcp47: 'af-ZA',
		iso639_1: 'af',
		displayName: 'Afrikaans',
		aliases: ['afrikaans', 'af', 'af-za']
	},
	{
		bcp47: 'zu-ZA',
		iso639_1: 'zu',
		displayName: 'Zulu',
		aliases: ['zulu', 'zu', 'zu-za']
	},
	{
		bcp47: 'xh-ZA',
		iso639_1: 'xh',
		displayName: 'Xhosa',
		aliases: ['xhosa', 'xh', 'xh-za']
	}
];

export function normalizeLanguage(input: string): SupportedLanguage | null {
	const normalized = input.trim().toLowerCase();
	if (!normalized) {
		return null;
	}

	for (const language of SUPPORTED_LANGUAGES) {
		if (language.aliases.includes(normalized)) {
			return language;
		}
		if (language.bcp47.toLowerCase() === normalized) {
			return language;
		}
		if (language.iso639_1.toLowerCase() === normalized) {
			return language;
		}
	}

	return null;
}

export function requireSupportedLanguage(input: string): SupportedLanguage {
	const language = normalizeLanguage(input);
	if (!language) {
		throw new Error(`Unsupported language: ${input}`);
	}
	return language;
}
