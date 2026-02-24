<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { fly } from 'svelte/transition';
	import * as m from '$lib/paraglide/messages.js';
	import { VOCABULARY_SETS } from '$lib/vocabularySets';

	const client = useConvexClient();
	const setKey = $derived(page.params.set);
	const set = $derived(VOCABULARY_SETS.find((s) => s.key === setKey));

	let currentIndex = $state(0);
	let imageData = $state<{
		url: string;
		alt: string;
		photographerName: string;
		photographerUrl: string;
	} | null>(null);
	let imageLoading = $state(false);
	let revealed = $state(false);

	const currentItem = $derived(set?.items[currentIndex] ?? null);

	$effect(() => {
		if (currentItem) {
			revealed = false;
			loadImage(currentItem.searchTerm);
		}
	});

	async function loadImage(searchTerm: string) {
		imageLoading = true;
		try {
			const result = await client.action(api.unsplash.getRandomPhoto, { query: searchTerm });
			imageData = result;
		} catch {
			imageData = null;
		} finally {
			imageLoading = false;
		}
	}

	function next() {
		if (set && currentIndex < set.items.length - 1) {
			currentIndex++;
		}
	}

	function prev() {
		if (currentIndex > 0) {
			currentIndex--;
		}
	}
</script>

{#if !set}
	<div class="page-shell page-shell--narrow page-stack">
		<p class="meta-text">{m.vocab_set_not_found()}</p>
		<a href={resolve('/vocabulary')} class="meta-text underline">&larr; {m.vocab_back_to_sets()}</a>
	</div>
{:else}
	<div class="vocab-session">
		<div class="vocab-session__header">
			<a href={resolve('/vocabulary')} class="meta-text underline">&larr; {m.vocab_back_to_sets()}</a>
			<p class="info-kicker">{set.icon} {set.label}</p>
			<p class="meta-text">{currentIndex + 1} / {set.items.length}</p>
		</div>

		<div class="vocab-session__card">
			{#key currentIndex}
				<div class="vocab-flashcard" in:fly={{ x: 200, duration: 320 }} out:fly={{ x: -200, duration: 320 }}>
					<div class="vocab-flashcard__image">
						{#if imageLoading}
							<div class="vocab-flashcard__placeholder">
								<span class="meta-text">{m.state_loading()}</span>
							</div>
						{:else if imageData}
							<img src={imageData.url} alt={imageData.alt} />
							<p class="vocab-flashcard__attribution">
								Photo by <a href={imageData.photographerUrl} target="_blank" rel="noopener">{imageData.photographerName}</a>
							</p>
						{:else}
							<div class="vocab-flashcard__placeholder">
								<span class="text-3xl">{currentItem?.english}</span>
							</div>
						{/if}
					</div>
					<div class="vocab-flashcard__text">
						<p class="text-2xl font-semibold">{currentItem?.english}</p>
						{#if revealed}
							<p class="target-phrase font-black mt-2">{currentItem?.xhosa}</p>
						{:else}
							<button class="vocab-reveal-btn" onclick={() => (revealed = true)}>
								{m.vocab_reveal()}
							</button>
						{/if}
					</div>
				</div>
			{/key}
		</div>

		<div class="vocab-session__controls">
			<button
				class="vocab-nav-btn"
				onclick={prev}
				disabled={currentIndex === 0}
			>
				&larr; {m.vocab_prev()}
			</button>
			<button
				class="vocab-nav-btn"
				onclick={next}
				disabled={currentIndex >= set.items.length - 1}
			>
				{m.vocab_next()} &rarr;
			</button>
		</div>
	</div>
{/if}
