export type SttResult = {
	transcript: string | null;
	confidence?: number;
	errorTags?: string[];
};

export type SttProvider = {
	transcribeAudio: (input: {
		audioUrl: string;
		language?: string;
	}) => Promise<SttResult>;
};

export class NoopSttProvider implements SttProvider {
	async transcribeAudio(): Promise<SttResult> {
		return { transcript: null, confidence: 0 };
	}
}
