export type TtsResult = {
	audioUrl: string | null;
};

export type TtsProvider = {
	synthesize: (input: {
		text: string;
		language?: string;
	}) => Promise<TtsResult>;
};

export class NoopTtsProvider implements TtsProvider {
	async synthesize(): Promise<TtsResult> {
		return { audioUrl: null };
	}
}
