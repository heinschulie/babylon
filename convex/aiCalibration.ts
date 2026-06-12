import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { recordAiCalibrationComparison } from './lib/humanReviews/calibration';

export const recordComparison = internalMutation({
	args: {
		phraseId: v.id('phrases'),
		aiSoundAccuracy: v.number(),
		aiRhythmIntonation: v.number(),
		aiPhraseAccuracy: v.number(),
		humanSoundAccuracy: v.number(),
		humanRhythmIntonation: v.number(),
		humanPhraseAccuracy: v.number()
	},
	handler: async (ctx, args) => {
		await recordAiCalibrationComparison(
			ctx,
			args.phraseId,
			{
				soundAccuracy: args.aiSoundAccuracy,
				rhythmIntonation: args.aiRhythmIntonation,
				phraseAccuracy: args.aiPhraseAccuracy
			},
			{
				soundAccuracy: args.humanSoundAccuracy,
				rhythmIntonation: args.humanRhythmIntonation,
				phraseAccuracy: args.humanPhraseAccuracy
			}
		);
	}
});

// Internal-only: per-phrase calibration bias is operational data, not user-facing.
export const listAll = internalQuery({
	args: {},
	handler: async (ctx) => {
		const rows = await ctx.db.query('aiCalibration').collect();
		return rows.map((row) => ({
			phraseId: row.phraseId,
			comparisonCount: row.comparisonCount,
			meanBias: {
				soundAccuracy: row.sumDeltaSoundAccuracy / row.comparisonCount,
				rhythmIntonation: row.sumDeltaRhythmIntonation / row.comparisonCount,
				phraseAccuracy: row.sumDeltaPhraseAccuracy / row.comparisonCount
			},
			meanAbsError: {
				soundAccuracy: row.sumAbsDeltaSoundAccuracy / row.comparisonCount,
				rhythmIntonation: row.sumAbsDeltaRhythmIntonation / row.comparisonCount,
				phraseAccuracy: row.sumAbsDeltaPhraseAccuracy / row.comparisonCount
			},
			lastUpdatedAt: row.lastUpdatedAt
		}));
	}
});
