export type RecorderErrorCode = 'unsupported' | 'permission_denied' | 'no_microphone' | 'failed';

// Ordered by preference. audio/mp4 is what iOS Safari's MediaRecorder produces —
// keep it ahead of ogg so Safari gets a first-class path.
const MIME_CANDIDATES = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/mp4',
	'audio/ogg;codecs=opus'
];

function preferredMimeType(): string {
	if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
		return '';
	}
	return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

/**
 * Microphone recorder with mobile-Safari-aware error reporting.
 *
 * Owns the MediaRecorder lifecycle: chunk collection, duration measurement
 * anchored to the recorder's own start/stop events (not call sites), stream
 * track cleanup, and object-URL revocation. Emits error codes, not copy —
 * apps map codes to localized messages.
 */
export class AudioRecorder {
	recording = $state(false);
	blob = $state<Blob | null>(null);
	url = $state<string | null>(null);
	durationMs = $state(0);
	errorCode = $state<RecorderErrorCode | null>(null);

	private mediaRecorder: MediaRecorder | null = null;
	private stream: MediaStream | null = null;
	private chunks: Blob[] = [];
	private startedAtMs = 0;

	get hasRecording(): boolean {
		return this.blob !== null;
	}

	async start(): Promise<void> {
		if (this.recording) return;
		this.discard();
		this.errorCode = null;

		if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
			this.errorCode = 'unsupported';
			return;
		}

		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch (err) {
			if (err instanceof DOMException && err.name === 'NotAllowedError') {
				this.errorCode = 'permission_denied';
			} else if (err instanceof DOMException && err.name === 'NotFoundError') {
				this.errorCode = 'no_microphone';
			} else {
				this.errorCode = 'failed';
			}
			return;
		}

		try {
			const mimeType = preferredMimeType();
			const mediaRecorder = mimeType
				? new MediaRecorder(stream, { mimeType })
				: new MediaRecorder(stream);

			this.stream = stream;
			this.mediaRecorder = mediaRecorder;
			this.chunks = [];

			mediaRecorder.onstart = () => {
				this.startedAtMs = Date.now();
			};

			mediaRecorder.ondataavailable = (event) => {
				if (event.data && event.data.size > 0) {
					this.chunks.push(event.data);
				}
			};

			mediaRecorder.onstop = () => {
				const mimeTypeUsed = mediaRecorder.mimeType || this.chunks[0]?.type || 'audio/webm';
				const blob = new Blob(this.chunks, { type: mimeTypeUsed });
				this.blob = blob;
				this.url = URL.createObjectURL(blob);
				this.durationMs = this.startedAtMs ? Date.now() - this.startedAtMs : 0;
				this.releaseStream();
			};

			mediaRecorder.onerror = () => {
				this.errorCode = 'failed';
				this.recording = false;
				this.releaseStream();
			};

			// Timeslice keeps chunks flowing on iOS, where a single trailing
			// dataavailable after long recordings is unreliable.
			mediaRecorder.start(1000);
			this.recording = true;
		} catch {
			this.errorCode = 'failed';
			this.releaseStream();
		}
	}

	stop(): void {
		if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
		this.mediaRecorder.stop();
		this.recording = false;
	}

	discard(): void {
		if (this.url) {
			URL.revokeObjectURL(this.url);
		}
		this.blob = null;
		this.url = null;
		this.durationMs = 0;
		this.chunks = [];
		this.errorCode = null;
	}

	/** Stop everything and free resources. Call on component teardown. */
	destroy(): void {
		if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
			this.mediaRecorder.onstop = null;
			this.mediaRecorder.stop();
		}
		this.mediaRecorder = null;
		this.recording = false;
		this.releaseStream();
		this.discard();
	}

	private releaseStream(): void {
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
	}
}

export function formatDuration(ms: number): string {
	if (!ms || !isFinite(ms) || ms < 0) return '0:00';
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
