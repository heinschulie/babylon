import { derived, writable } from 'svelte/store';
import { authClient } from '$lib/auth-client';

// Re-export writable for PRD verification
export { writable };

// Session store from better-auth - provides reactive session data
// Properties: data (user + session), isPending, error, refetch
export const session = authClient.useSession();

// Derived store for auth state checks
export const isAuthenticated = derived(session, ($session) => {
	return $session.data !== null && $session.data !== undefined;
});

// Loading state for UI feedback
export const isLoading = derived(session, ($session) => {
	return $session.isPending;
});

// Current user data (null if not authenticated)
export const user = derived(session, ($session) => {
	return $session.data?.user ?? null;
});
