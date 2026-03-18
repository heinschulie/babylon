const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class FetchTimeoutError extends Error {
	readonly timeoutMs: number;
	readonly service: string;
	readonly operation?: string;

	constructor(args: { service: string; timeoutMs: number; operation?: string }) {
		super(
			`${args.service} request timed out after ${args.timeoutMs}ms${
				args.operation ? ` (${args.operation})` : ''
			}`
		);
		this.name = 'FetchTimeoutError';
		this.timeoutMs = args.timeoutMs;
		this.service = args.service;
		this.operation = args.operation;
	}
}

export class FetchNetworkError extends Error {
	readonly service: string;
	readonly operation?: string;

	constructor(args: { service: string; operation?: string; cause?: unknown }) {
		super(`${args.service} request failed before receiving a response`);
		this.name = 'FetchNetworkError';
		this.service = args.service;
		this.operation = args.operation;
		if (args.cause !== undefined) {
			(this as Error & { cause?: unknown }).cause = args.cause;
		}
	}
}

export type ExternalFetchErrorType = 'timeout' | 'network' | 'aborted' | 'unknown';

export function classifyExternalFetchError(error: unknown): ExternalFetchErrorType {
	if (error instanceof FetchTimeoutError) return 'timeout';
	if (error instanceof FetchNetworkError) return 'network';
	if (error instanceof DOMException && error.name === 'AbortError') return 'aborted';
	return 'unknown';
}

type FetchWithTimeoutOptions = RequestInit & {
	timeoutMs: number;
	service: string;
	operation?: string;
	retries?: number;
	retryDelayMs?: number;
};

export async function fetchWithTimeout(
	input: string | URL | Request,
	options: FetchWithTimeoutOptions
): Promise<Response> {
	const {
		timeoutMs,
		service,
		operation,
		retries = 0,
		retryDelayMs = 0,
		signal: upstreamSignal,
		...init
	} = options;

	const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
	const canRetryMethod = SAFE_RETRY_METHODS.has(method);
	const normalizedRetries = canRetryMethod ? Math.max(0, retries) : 0;
	const maxAttempts = 1 + normalizedRetries;

	if (retries > 0 && !canRetryMethod) {
		console.info('External fetch retry disabled for non-idempotent method', {
			service,
			operation: operation ?? null,
			method,
			requestedRetries: retries
		});
	}

	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const controller = new AbortController();
		let timedOut = false;
		let upstreamAbortHandler: (() => void) | undefined;

		if (upstreamSignal) {
			if (upstreamSignal.aborted) {
				throw new DOMException('Aborted', 'AbortError');
			}
			upstreamAbortHandler = () => controller.abort();
			upstreamSignal.addEventListener('abort', upstreamAbortHandler, { once: true });
		}

		const timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);

		try {
			return await fetch(input, {
				...init,
				signal: controller.signal
			});
		} catch (error) {
			lastError = timedOut
				? new FetchTimeoutError({ service, timeoutMs, operation })
				: new FetchNetworkError({ service, operation, cause: error });

			const errorType = classifyExternalFetchError(lastError);
			if (attempt < maxAttempts) {
				console.warn('External fetch retrying', {
					service,
					operation: operation ?? null,
					method,
					errorType,
					attempt,
					maxAttempts
				});
				if (retryDelayMs > 0) {
					await delay(retryDelayMs);
				}
				continue;
			}

			if (errorType === 'timeout') {
				console.warn('External fetch timeout', {
					service,
					operation: operation ?? null,
					method,
					timeoutMs,
					attempt
				});
			}

			throw lastError;
		} finally {
			clearTimeout(timeout);
			if (upstreamSignal && upstreamAbortHandler) {
				upstreamSignal.removeEventListener('abort', upstreamAbortHandler);
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error('External fetch failed');
}

function delay(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}
