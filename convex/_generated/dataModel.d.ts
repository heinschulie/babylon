// Auto-generated. DO NOT EDIT.
// Run `npx convex dev` to regenerate.

import type {
	GenericDataModel,
	GenericDocument,
	GenericTableInfo,
	DocumentByInfo,
	FieldPaths,
	Indexes
} from 'convex/server';
import type { GenericId } from 'convex/values';

export type Id<TableName extends TableNames> = GenericId<TableName>;

export type TableNames = 'sessions' | 'phrases' | 'userPreferences' | 'scheduledNotifications';

export type Doc<TableName extends TableNames> = TableName extends 'sessions'
	? {
			_id: Id<'sessions'>;
			_creationTime: number;
			userId: string;
			date: string;
			targetLanguage: string;
			createdAt: number;
		}
	: TableName extends 'phrases'
		? {
				_id: Id<'phrases'>;
				_creationTime: number;
				sessionId: Id<'sessions'>;
				userId: string;
				english: string;
				translation: string;
				createdAt: number;
			}
		: TableName extends 'userPreferences'
			? {
					_id: Id<'userPreferences'>;
					_creationTime: number;
					userId: string;
					quietHoursStart: number;
					quietHoursEnd: number;
					notificationsPerPhrase: number;
					pushSubscription?: string;
				}
			: TableName extends 'scheduledNotifications'
				? {
						_id: Id<'scheduledNotifications'>;
						_creationTime: number;
						phraseId: Id<'phrases'>;
						userId: string;
						scheduledFor: number;
						sent: boolean;
					}
				: never;

export interface DataModel extends GenericDataModel {
	sessions: GenericTableInfo;
	phrases: GenericTableInfo;
	userPreferences: GenericTableInfo;
	scheduledNotifications: GenericTableInfo;
}
