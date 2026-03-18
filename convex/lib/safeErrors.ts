import { classifyExternalFetchError } from './fetchWithTimeout';

export type AppErrorCode =
	| 'timeout'
	| 'network'
	| 'auth'
	| 'quota'
	| 'validation'
	| 'upstream_response'
	| 'upstream_invalid_response'
	| 'internal';

const MAX_LOG_STRING_LENGTH = 240;
const REDACTED = '[redacted]';
const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|token|signature|passphrase|secret|password|pushsubscription|subscription|endpoint)/i;

export function classifyAppErrorCode(error: unknown): AppErrorCode {
	const external = classifyExternalFetchError(error);
	if (external === 'timeout') return 'timeout';
	if (external === 'network' || external === 'aborted') return 'network';

	if (error instanceof SyntaxError) {
		return 'upstream_invalid_response';
	}

	if (error instanceof Error) {
		const message = error.message.toLowerCase();
		if (message.includes('not authenticated') || message.includes('unauthorized')) return 'auth';
		if (message.includes('too many requests')) return 'quota';
		if (
			message.includes('required') ||
			message.includes('too long') ||
			message.includes('invalid') ||
			message.includes('mismatch')
		) {
			return 'validation';
		}
		if (message.includes('api error') || message.includes('provider')) return 'upstream_response';
	}

	return 'internal';
}

export function sanitizeTextForLog(value: string, maxLength = MAX_LOG_STRING_LENGTH): string {
	const redacted = value
		.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, `Bearer ${REDACTED}`)
		.replace(/([?&](?:key|api_key|token|signature)=)[^&\s]+/gi, `$1${REDACTED}`)
		.replace(
			/((?:x-api-key|authorization|signature|token|api[_-]?key|passphrase)\s*[:=]\s*)[^\s,;]+/gi,
			`$1${REDACTED}`
		);

	if (redacted.length <= maxLength) return redacted;
	return `${redacted.slice(0, maxLength)}…`;
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
	if (value == null) return value;
	if (depth > 4) return '[truncated]';

	if (typeof value === 'string') {
		return sanitizeTextForLog(value);
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}

	if (Array.isArray(value)) {
		return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1));
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: sanitizeTextForLog(value.message),
			errorCode: classifyAppErrorCode(value)
		};
	}

	if (typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
			out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeLogValue(nested, depth + 1);
		}
		return out;
	}

	return String(value);
}

export function summarizeErrorForLog(error: unknown): Record<string, unknown> {
	if (!(error instanceof Error)) {
		return { errorCode: classifyAppErrorCode(error), message: 'unknown' };
	}

	const errorWithStatus = error as Error & { statusCode?: unknown };
	const statusCode =
		typeof errorWithStatus.statusCode === 'number' ? errorWithStatus.statusCode : undefined;

	return {
		errorCode: classifyAppErrorCode(error),
		name: error.name,
		message: sanitizeTextForLog(error.message),
		...(statusCode ? { statusCode } : {})
	};
}

export async function readSafeErrorBodySnippet(response: Response): Promise<string | null> {
	try {
		const text = await response.text();
		if (!text) return null;
		return sanitizeTextForLog(text);
	} catch {
		return null;
	}
}

export function toClientSafeError(error: unknown, fallbackMessage: string): Error {
	const errorCode = classifyAppErrorCode(error);
	if (errorCode === 'timeout') {
		return new Error('Upstream service timed out. Please try again.');
	}
	if (errorCode === 'network') {
		return new Error('Upstream service is unavailable. Please try again.');
	}
	if (errorCode === 'auth' || errorCode === 'validation' || errorCode === 'quota') {
		return error instanceof Error ? new Error(error.message) : new Error(fallbackMessage);
	}
	return new Error(fallbackMessage);
}

export function summarizePushSubscriptionForLog(raw: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(raw) as {
			endpoint?: string;
			keys?: Record<string, string>;
			expirationTime?: number | null;
		};
		let endpointHost: string | null = null;
		if (parsed.endpoint) {
			try {
				endpointHost = new URL(parsed.endpoint).host;
			} catch {
				endpointHost = 'invalid_url';
			}
		}
		return {
			endpointHost,
			hasKeys: Boolean(parsed.keys),
			keyCount: parsed.keys ? Object.keys(parsed.keys).length : 0,
			hasExpirationTime: parsed.expirationTime != null
		};
	} catch (error) {
		return {
			parseError: true,
			...summarizeErrorForLog(error)
		};
	}
}
