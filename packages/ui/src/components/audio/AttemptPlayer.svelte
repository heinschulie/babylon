<script lang="ts">
	import { formatDuration } from './recorder.svelte.js';

	let {
		src,
		variant = 'default',
		playingLabel,
		label,
		fallbackDurationMs = 0,
		onfirstended
	}: {
		src: string;
		variant?: 'default' | 'verifier';
		/** Localized "Playing…" label — this package has no i18n. */
		playingLabel: string;
		/** Localized accessible name, e.g. "Play your recording". */
		label?: string;
		/** Shown until the element reports a real duration (blob URLs often don't). */
		fallbackDurationMs?: number;
		onfirstended?: () => void;
	} = $props();

	let el: HTMLAudioElement | null = $state(null);
	let playing = $state(false);
	let progress = $state(0);
	let durationMs = $state(0);
	let endedOnce = false;

	const displayDurationMs = $derived(durationMs || fallbackDurationMs);

	function syncDuration() {
		if (el && isFinite(el.duration) && el.duration > 0) {
			durationMs = el.duration * 1000;
		}
	}

	function toggle() {
		if (!el) return;
		if (playing) {
			el.pause();
		} else {
			void el.play();
		}
	}

	function onTimeUpdate() {
		if (!el || !isFinite(el.duration) || el.duration <= 0) return;
		progress = el.currentTime / el.duration;
	}

	function onEnded() {
		playing = false;
		progress = 0;
		if (!endedOnce) {
			endedOnce = true;
			onfirstended?.();
		}
	}
</script>

<button
	type="button"
	class="practice-player w-full border-0 p-0 {variant === 'verifier' ? 'practice-player--verifier' : ''}"
	aria-label={label ?? playingLabel}
	aria-pressed={playing}
	onclick={toggle}
>
	<div class="practice-player__fill" style="width: {progress * 100}%"></div>
	<span class="practice-player__label">
		{playing ? playingLabel : formatDuration(displayDurationMs)}
	</span>
</button>
<audio
	bind:this={el}
	{src}
	onloadedmetadata={syncDuration}
	oncanplay={syncDuration}
	ontimeupdate={onTimeUpdate}
	onplay={() => (playing = true)}
	onpause={() => (playing = false)}
	onended={onEnded}
></audio>
