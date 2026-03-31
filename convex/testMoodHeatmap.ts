import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';

export const recordMoodEntry = internalMutation({
	args: {
		date: v.string(),  // YYYY-MM-DD
		mood: v.string(),  // chill | angry | happy
	},
	handler: async (ctx, { date, mood }) => {
		// Use the compound index to find existing entry for this date+mood
		const existingEntry = await ctx.db
			.query('testMoodHeatmapTable')
			.withIndex('by_date_mood', q => q.eq('date', date).eq('mood', mood))
			.unique();

		if (existingEntry) {
			// Increment count if entry exists
			await ctx.db.patch(existingEntry._id, {
				count: existingEntry.count + 1
			});
		} else {
			// Create new entry if doesn't exist
			await ctx.db.insert('testMoodHeatmapTable', {
				date,
				mood,
				count: 1
			});
		}
	},
});

export const getWeekHeatmap = query({
	args: {},
	handler: async (ctx) => {
		// Compute last 7 days from today
		const today = new Date(Date.now()).toISOString().slice(0, 10);
		const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

		// Query entries for the last 7 days using date range
		const entries = await ctx.db
			.query('testMoodHeatmapTable')
			.withIndex('by_date', q => q.gte('date', sevenDaysAgo).lte('date', today))
			.collect();

		return entries;
	},
});