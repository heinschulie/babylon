import { AGREEMENT_TOLERANCE } from './constants';

export type ReviewScores = {
	soundAccuracy: number;
	rhythmIntonation: number;
	phraseAccuracy: number;
};

export function scoresAreValid(scores: ReviewScores) {
	return [scores.soundAccuracy, scores.rhythmIntonation, scores.phraseAccuracy].every(
		(score) => Number.isInteger(score) && score >= 1 && score <= 5
	);
}

export function agreesWithOriginal(original: ReviewScores, next: ReviewScores) {
	return (
		Math.abs(original.soundAccuracy - next.soundAccuracy) <= AGREEMENT_TOLERANCE &&
		Math.abs(original.rhythmIntonation - next.rhythmIntonation) <= AGREEMENT_TOLERANCE &&
		Math.abs(original.phraseAccuracy - next.phraseAccuracy) <= AGREEMENT_TOLERANCE
	);
}

export function medianOf(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}
