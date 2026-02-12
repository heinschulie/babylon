import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, writable, type Writable } from 'svelte/store';

type SessionData = {
	data: { user: { id: string; name: string; email: string } } | null;
	isPending: boolean;
	error: Error | null;
};

// Mock better-auth client before importing auth stores
vi.mock('@babylon/shared/auth-client', () => {
	const mockSessionStore = writable<SessionData>({
		data: null,
		isPending: false,
		error: null
	});

	return {
		authClient: {
			useSession: () => mockSessionStore
		},
		// Export for test manipulation
		__mockSessionStore: mockSessionStore
	};
});

// Import after mock setup
const { session, isAuthenticated, isLoading, user } = await import('@babylon/shared/stores/auth');
const authClientMock = (await import('@babylon/shared/auth-client')) as unknown as {
	__mockSessionStore: Writable<SessionData>;
};
const __mockSessionStore = authClientMock.__mockSessionStore;

describe('auth stores', () => {
	beforeEach(() => {
		// Reset to unauthenticated state
		__mockSessionStore.set({
			data: null,
			isPending: false,
			error: null
		});
	});

	describe('session', () => {
		it('should export session store', () => {
			expect(session).toBeDefined();
			expect(typeof session.subscribe).toBe('function');
		});
	});

	describe('isAuthenticated', () => {
		it('should be false when session data is null', () => {
			expect(get(isAuthenticated)).toBe(false);
		});

		it('should be true when session data exists', () => {
			__mockSessionStore.set({
				data: { user: { id: '1', name: 'Test', email: 'test@test.com' } },
				isPending: false,
				error: null
			});
			expect(get(isAuthenticated)).toBe(true);
		});

		it('should be false when session data is undefined', () => {
			__mockSessionStore.set({
				data: undefined as unknown as null,
				isPending: false,
				error: null
			});
			expect(get(isAuthenticated)).toBe(false);
		});
	});

	describe('isLoading', () => {
		it('should be false when not pending', () => {
			expect(get(isLoading)).toBe(false);
		});

		it('should be true when pending', () => {
			__mockSessionStore.set({
				data: null,
				isPending: true,
				error: null
			});
			expect(get(isLoading)).toBe(true);
		});
	});

	describe('user', () => {
		it('should be null when not authenticated', () => {
			expect(get(user)).toBeNull();
		});

		it('should return user data when authenticated', () => {
			const testUser = { id: '1', name: 'Test User', email: 'test@test.com' };
			__mockSessionStore.set({
				data: { user: testUser },
				isPending: false,
				error: null
			});
			expect(get(user)).toEqual(testUser);
		});
	});
});
