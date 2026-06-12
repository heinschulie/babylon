export const DEFAULT_LANGUAGE_CODE = 'xh-ZA';

type LanguageMembership = { languageCode: string; active: boolean };

/**
 * The language a verifier is currently working in: their first active
 * membership, falling back to the default while state is loading or the
 * verifier hasn't activated any language yet.
 */
export function activeLanguageCode(
	languages: LanguageMembership[] | undefined | null
): string {
	return languages?.find((l) => l.active)?.languageCode ?? DEFAULT_LANGUAGE_CODE;
}

export function hasActiveLanguage(languages: LanguageMembership[] | undefined | null): boolean {
	return !!languages?.some((l) => l.active);
}
