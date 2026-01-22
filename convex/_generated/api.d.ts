// Auto-generated. DO NOT EDIT.
// Run `npx convex dev` to regenerate.

import type { FunctionReference } from 'convex/server';
import type { GenericId } from 'convex/values';
import type { Doc, Id, TableNames } from './dataModel';

// Sessions API
export declare const api: {
	sessions: {
		list: FunctionReference<'query', 'public', Record<string, never>, Doc<'sessions'>[]>;
		getByDate: FunctionReference<'query', 'public', { date: string }, Doc<'sessions'> | null>;
		create: FunctionReference<
			'mutation',
			'public',
			{ date: string; targetLanguage: string },
			Id<'sessions'>
		>;
		remove: FunctionReference<'mutation', 'public', { id: Id<'sessions'> }, void>;
	};
	phrases: {
		listBySession: FunctionReference<
			'query',
			'public',
			{ sessionId: Id<'sessions'> },
			Doc<'phrases'>[]
		>;
		create: FunctionReference<
			'mutation',
			'public',
			{ sessionId: Id<'sessions'>; english: string; translation: string },
			Id<'phrases'>
		>;
		update: FunctionReference<
			'mutation',
			'public',
			{ id: Id<'phrases'>; english?: string; translation?: string },
			void
		>;
		remove: FunctionReference<'mutation', 'public', { id: Id<'phrases'> }, void>;
	};
	preferences: {
		get: FunctionReference<
			'query',
			'public',
			Record<string, never>,
			{
				userId: string;
				quietHoursStart: number;
				quietHoursEnd: number;
				notificationsPerPhrase: number;
				pushSubscription?: string;
			}
		>;
		upsert: FunctionReference<
			'mutation',
			'public',
			{
				quietHoursStart?: number;
				quietHoursEnd?: number;
				notificationsPerPhrase?: number;
				pushSubscription?: string;
			},
			Id<'userPreferences'>
		>;
	};
};

export declare const internal: {
	// Add internal functions here as needed
};

// Re-export components for auth
export declare const components: {
	betterAuth: any;
};
