import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

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
		const dS = args.aiSoundAccuracy - args.humanSoundAccuracy;
		const dR = args.aiRhythmIntonation - args.humanRhythmIntonation;
		const dP = args.aiPhraseAccuracy - args.humanPhraseAccuracy;

		const existing = await ctx.db
			.query('aiCalibration')
			.withIndex('by_phrase', (q) => q.eq('phraseId', args.phraseId))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				comparisonCount: existing.comparisonCount + 1,
				sumDeltaSoundAccuracy: existing.sumDeltaSoundAccuracy + dS,
				sumDeltaRhythmIntonation: existing.sumDeltaRhythmIntonation + dR,
				sumDeltaPhraseAccuracy: existing.sumDeltaPhraseAccuracy + dP,
				sumAbsDeltaSoundAccuracy: existing.sumAbsDeltaSoundAccuracy + Math.abs(dS),
				sumAbsDeltaRhythmIntonation: existing.sumAbsDeltaRhythmIntonation + Math.abs(dR),
				sumAbsDeltaPhraseAccuracy: existing.sumAbsDeltaPhraseAccuracy + Math.abs(dP),
				lastUpdatedAt: Date.now()
			});
		} else {
			await ctx.db.insert('aiCalibration', {
				phraseId: args.phraseId,
				comparisonCount: 1,
				sumDeltaSoundAccuracy: dS,
				sumDeltaRhythmIntonation: dR,
				sumDeltaPhraseAccuracy: dP,
				sumAbsDeltaSoundAccuracy: Math.abs(dS),
				sumAbsDeltaRhythmIntonation: Math.abs(dR),
				sumAbsDeltaPhraseAccuracy: Math.abs(dP),
				lastUpdatedAt: Date.now()
			});
		}
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
