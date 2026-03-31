import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testMoodHeatmap', () => {
	describe('recordMoodEntry', () => {
		it('should create new doc when no entry exists for date+mood', async () => {
			const t = convexTest(schema, modules);

			// Call the internal mutation
			await t.run(async (ctx) => {
				await ctx.runMutation('testMoodHeatmap:recordMoodEntry', {
					date: '2024-01-15',
					mood: 'chill'
				});
			});

			// Verify the record was created with count=1
			const entries = await t.run(async (ctx) =>
				ctx.db.query('testMoodHeatmapTable').collect()
			);

			expect(entries).toHaveLength(1);
			expect(entries[0]).toMatchObject({
				date: '2024-01-15',
				mood: 'chill',
				count: 1
			});
		});

		it('should increment count when entry already exists for date+mood', async () => {
			const t = convexTest(schema, modules);

			// Create initial entry
			await t.run(async (ctx) => {
				await ctx.runMutation('testMoodHeatmap:recordMoodEntry', {
					date: '2024-01-15',
					mood: 'chill'
				});
			});

			// Call again with same date+mood
			await t.run(async (ctx) => {
				await ctx.runMutation('testMoodHeatmap:recordMoodEntry', {
					date: '2024-01-15',
					mood: 'chill'
				});
			});

			// Verify count was incremented to 2
			const entries = await t.run(async (ctx) =>
				ctx.db.query('testMoodHeatmapTable').collect()
			);

			expect(entries).toHaveLength(1);
			expect(entries[0]).toMatchObject({
				date: '2024-01-15',
				mood: 'chill',
				count: 2
			});
		});
	});

	describe('submitEmoji integration', () => {
		it('should call recordMoodEntry after emoji insertion', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Submit an emoji
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Verify mood entry was recorded
			const moodEntries = await t.run(async (ctx) =>
				ctx.db.query('testMoodHeatmapTable').collect()
			);

			expect(moodEntries).toHaveLength(1);
			expect(moodEntries[0]).toMatchObject({
				mood: 'chill',
				count: 1
			});
			// Date should be today's date
			expect(moodEntries[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});
	});

	describe('getWeekHeatmap', () => {
		it('should return entries only for the last 7 days', async () => {
			const t = convexTest(schema, modules);

			// Mock today's date for consistent testing
			const originalDateNow = Date.now;
			const todayMs = new Date('2024-01-15').getTime();
			Date.now = () => todayMs;

			// Create entries for different dates
			await t.run(async (ctx) => {
				// Within 7 days (should be included)
				await ctx.runMutation('testMoodHeatmap:recordMoodEntry', {
					date: '2024-01-15', // today
					mood: 'happy'
				});
				await ctx.runMutation('testMoodHeatmap:recordMoodEntry', {
					date: '2024-01-10', // 5 days ago
					mood: 'chill'
				});
				await ctx.runMutation('testMoodHeatmap:recordMoodEntry', {
					date: '2024-01-09', // 6 days ago
					mood: 'angry'
				});

				// Outside 7 days (should NOT be included)
				await ctx.runMutation('testMoodHeatmap:recordMoodEntry', {
					date: '2024-01-08', // 7 days ago
					mood: 'happy'
				});
				await ctx.runMutation('testMoodHeatmap:recordMoodEntry', {
					date: '2024-01-01', // 14 days ago
					mood: 'chill'
				});
			});

			// Query week heatmap
			const result = await t.query(api.testMoodHeatmap.getWeekHeatmap, {});

			// Should return only the 3 entries within last 7 days
			expect(result).toHaveLength(3);
			const dates = result.map(entry => entry.date).sort();
			expect(dates).toEqual(['2024-01-09', '2024-01-10', '2024-01-15']);

			// Restore Date.now
			Date.now = originalDateNow;
		});

		it('should return empty array when no data exists', async () => {
			const t = convexTest(schema, modules);

			// Query week heatmap without any data
			const result = await t.query(api.testMoodHeatmap.getWeekHeatmap, {});

			expect(result).toEqual([]);
			expect(result).toHaveLength(0);
		});
	});
});