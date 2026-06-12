import type { MutationCtx } from '../../_generated/server';
import type { Id } from '../../_generated/dataModel';
import type { ReviewScores } from './scoring';

/**
 * Records an AI-vs-human score comparison into the per-phrase aiCalibration
 * aggregate. Shared by humanReviews (on review submit) and aiCalibration
 * (recordComparison internal mutation).
 */
export async function recordAiCalibrationComparison(
	ctx: MutationCtx,
	phraseId: Id<'phrases'>,
	ai: ReviewScores,
	human: ReviewScores
) {
	const dS = ai.soundAccuracy - human.soundAccuracy;
	const dR = ai.rhythmIntonation - human.rhythmIntonation;
	const dP = ai.phraseAccuracy - human.phraseAccuracy;

	const existing = await ctx.db
		.query('aiCalibration')
		.withIndex('by_phrase', (q) => q.eq('phraseId', phraseId))
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
			phraseId,
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
