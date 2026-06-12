<script lang="ts">
	import { formatDuration } from './recorder.svelte.js';

	let {
		src,
		variant = 'default',
		playingLabel,
		fallbackDurationMs = 0,
		onfirstended
	}: {
		src: string;
		variant?: 'default' | 'verifier';
		/** Localized "Playing…" label — this package has no i18n. */
		playingLabel: string;
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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="practice-player {variant === 'verifier' ? 'practice-player--verifier' : ''}"
	onclick={toggle}
>
	<div class="practice-player__fill" style="width: {progress * 100}%"></div>
	<span class="practice-player__label">
		{playing ? playingLabel : formatDuration(displayDurationMs)}
	</span>
</div>
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
