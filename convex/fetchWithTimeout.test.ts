import { afterEach, describe, expect, it } from 'vitest';
import { FetchTimeoutError, fetchWithTimeout } from './lib/fetchWithTimeout';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('fetchWithTimeout', () => {
	it('aborts and throws FetchTimeoutError when request hangs', async () => {
		globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
			return await new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					reject(new DOMException('Aborted', 'AbortError'));
				});
			});
		}) as typeof fetch;

		await expect(
			fetchWithTimeout('https://example.com', {
				service: 'test',
				operation: 'timeout_case',
				timeoutMs: 5
			})
		).rejects.toBeInstanceOf(FetchTimeoutError);
	});

	it('retries one safe GET request after timeout and succeeds', async () => {
		let attempts = 0;
		globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
			attempts += 1;
			if (attempts === 1) {
				return await new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('Aborted', 'AbortError'));
					});
				});
			}
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}) as typeof fetch;

		const response = await fetchWithTimeout('https://example.com/data', {
			service: 'test',
			operation: 'retry_case',
			timeoutMs: 5,
			retries: 1
		});

		expect(attempts).toBe(2);
		expect(response.ok).toBe(true);
	});

	it('does not retry non-idempotent methods even if retries are requested', async () => {
		let attempts = 0;
		globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
			attempts += 1;
			return await new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					reject(new DOMException('Aborted', 'AbortError'));
				});
			});
		}) as typeof fetch;

		await expect(
			fetchWithTimeout('https://example.com/data', {
				service: 'test',
				operation: 'post_no_retry',
				method: 'POST',
				body: JSON.stringify({ hello: 'world' }),
				timeoutMs: 5,
				retries: 2
			})
		).rejects.toBeInstanceOf(FetchTimeoutError);

		expect(attempts).toBe(1);
	});
});
