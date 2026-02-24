<script lang="ts">
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages.js';
	import { VOCABULARY_SETS } from '$lib/vocabularySets';
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header class="page-stack">
		<a href={resolve('/')} class="meta-text underline">&larr; {m.vocab_back()}</a>
		<p class="info-kicker">{m.vocab_kicker()}</p>
		<h1 class="text-5xl sm:text-6xl">{m.vocab_title()}</h1>
		<p class="meta-text mt-3">{m.vocab_desc()}</p>
	</header>

	<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
		{#each VOCABULARY_SETS as set}
			<a
				href={resolve(`/vocabulary/${set.key}`)}
				class="vocab-set-card"
			>
				<span class="vocab-set-card__icon">{set.icon}</span>
				<span class="vocab-set-card__label">{set.label}</span>
				<span class="vocab-set-card__count">{set.items.length} words</span>
			</a>
		{/each}
	</div>
</div>
