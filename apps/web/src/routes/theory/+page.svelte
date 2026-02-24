<script lang="ts">
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages.js';
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header class="page-stack">
		<a href={resolve('/')} class="meta-text underline">&larr; {m.theory_back()}</a>
		<p class="info-kicker">{m.theory_kicker()}</p>
		<h1 class="text-5xl sm:text-6xl">{m.theory_title()}</h1>
		<p class="meta-text mt-3 max-w-2xl">{m.theory_intro()}</p>
	</header>

	<section class="page-stack">
		<h2 class="text-3xl sm:text-4xl font-display uppercase leading-heading tracking-heading">{m.theory_section_clicks_title()}</h2>
		<p>{m.theory_section_clicks_body()}</p>
	</section>

	<section class="page-stack">
		<h2 class="text-3xl sm:text-4xl font-display uppercase leading-heading tracking-heading">{m.theory_section_agglutination_title()}</h2>
		<p>{m.theory_section_agglutination_body()}</p>
	</section>

	<section class="page-stack">
		<h2 class="text-3xl sm:text-4xl font-display uppercase leading-heading tracking-heading">{m.theory_section_noun_classes_title()}</h2>
		<p>{m.theory_section_noun_classes_body()}</p>
	</section>

	<section class="page-stack">
		<h2 class="text-3xl sm:text-4xl font-display uppercase leading-heading tracking-heading">{m.theory_section_vowels_title()}</h2>
		<p>{m.theory_section_vowels_body()}</p>
	</section>

	<section class="page-stack">
		<h2 class="text-3xl sm:text-4xl font-display uppercase leading-heading tracking-heading">{m.theory_section_tone_title()}</h2>
		<p>{m.theory_section_tone_body()}</p>
	</section>

	<section class="page-stack">
		<h2 class="text-3xl sm:text-4xl font-display uppercase leading-heading tracking-heading">{m.theory_section_patterns_title()}</h2>
		<p>{m.theory_section_patterns_body()}</p>
	</section>
</div>
