import SparkMD5 from 'spark-md5';

export function parseFormBody(body: string) {
	const params = new URLSearchParams(body);
	const result: Record<string, string> = {};
	for (const [key, value] of params.entries()) {
		result[key] = value;
	}
	return result;
}

function payfastUrlEncode(value: string) {
	return encodeURIComponent(value.trim()).replace(/%20/g, '+');
}

export function normalizePayfastPassphrase(value?: string | null) {
	if (value === undefined || value === null) return undefined;
	const normalized = value.trim();
	return normalized === '' ? undefined : normalized;
}

export function buildPayfastCanonicalString(params: Record<string, string>, passphrase?: string) {
	const entries = Object.entries(params)
		.filter(([key, value]) => key !== 'signature' && value !== undefined && value !== null && value !== '')
		.map(([key, value]) => `${key}=${payfastUrlEncode(value)}`);

	const normalizedPassphrase = normalizePayfastPassphrase(passphrase);
	if (normalizedPassphrase) {
		entries.push(`passphrase=${payfastUrlEncode(normalizedPassphrase)}`);
	}

	return entries.join('&');
}

export function buildPayfastSignature(params: Record<string, string>, passphrase?: string) {
	const canonical = buildPayfastCanonicalString(params, passphrase);
	return SparkMD5.hash(canonical);
}
