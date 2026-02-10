export type LlmFeedback = {
	feedbackText: string;
	score?: number;
	errorTags?: string[];
};

export type LlmProvider = {
	generateFeedback: (input: {
		englishPrompt: string;
		targetPhrase: string;
		transcript: string | null;
	}) => Promise<LlmFeedback>;
};

export class NoopLlmProvider implements LlmProvider {
	async generateFeedback(): Promise<LlmFeedback> {
		return { feedbackText: 'Feedback not configured yet.' };
	}
}
