<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '@babylon/ui/button';
	import * as Accordion from '@babylon/ui/accordion';
	import * as Card from '@babylon/ui/card';
	import * as m from '$lib/paraglide/messages.js';

	type SessionSummary = {
		_id: string;
		startedAt: number;
		phraseCount: number;
		avgScores?: { sound: number; rhythm: number; phrase: number } | null;
	};

	let {
		phraseCount,
		streak,
		sessions,
		sessionsLoading,
		starting,
		onStart
	}: {
		phraseCount: number;
		streak: number | null;
		sessions: SessionSummary[];
		sessionsLoading: boolean;
		starting: boolean;
		onStart: () => void;
	} = $props();

	function relativeTime(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / 60000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return m.time_just_now();
		if (minutes < 60) return m.time_minutes_ago({ count: minutes });

		const date = new Date(timestamp);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) return m.time_earlier_today();
		if (date.toDateString() === yesterday.toDateString()) return m.time_yesterday();
		if (days < 7) return m.time_days_ago({ count: days });
		if (days < 30) return m.time_weeks_ago({ count: Math.floor(days / 7) });
		return date.toLocaleDateString();
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header class="page-stack">
		<div>
			<p class="info-kicker">{m.practice_kicker()}</p>
			<h1 class="text-5xl sm:text-6xl">{m.practice_title()}</h1>
		</div>

		{#if streak !== null}
			<div class="streak-display">
				<span class="streak-display__number">{streak}</span>
				<span class="streak-display__days">days streak</span>
				<span class="streak-display__label">{m.practice_streak_subtitle()} <img src="/fire.gif" alt="" class="practice-review-fire" style="display:inline; vertical-align:middle;" /></span>
			</div>
		{/if}

		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Content>
				<div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
					<div class="space-y-2">
						<p class="info-kicker">{m.practice_quick_start()}</p>
						<p class="text-xl font-semibold">
							{m.practice_ready({ count: phraseCount })}
						</p>
						<p class="meta-text">{m.practice_tip()}</p>
					</div>
					<Button
						onclick={onStart}
						disabled={starting || phraseCount === 0}
						size="lg"
						class="w-full sm:w-auto"
					>
						{starting ? m.practice_starting() : m.practice_start()}
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	</header>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Content>
			<div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
				<div class="space-y-2">
					<p class="info-kicker">{m.practice_vocab_kicker()}</p>
					<p class="text-xl font-semibold">{m.practice_vocab_title()}</p>
					<p class="meta-text">{m.practice_vocab_desc()}</p>
				</div>
				<a
					href={resolve('/vocabulary')}
					class="inline-flex items-center justify-center border border-border bg-background px-6 py-2 text-sm font-semibold uppercase tracking-widest transition-colors hover:bg-secondary"
				>
					{m.practice_vocab_go()}
				</a>
			</div>
		</Card.Content>
	</Card.Root>

	{#if phraseCount === 0}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.practice_no_phrases()}</Card.Title>
				<Card.Description>{m.practice_no_phrases_desc()}</Card.Description>
			</Card.Header>
			<Card.Footer>
				<a href={resolve('/library')} class="meta-text underline">{m.practice_go_library()}</a>
			</Card.Footer>
		</Card.Root>
	{/if}

	<Accordion.Root type="single">
		<Accordion.Item value="recent">
			<Accordion.Trigger class="text-3xl sm:text-4xl font-display uppercase leading-heading tracking-heading hover:no-underline py-0 gap-2 text-start justify-start">
				<div>
					<span>{m.practice_recent()}</span>
					<p class="text-muted-foreground text-xs leading-relaxed font-body font-normal normal-case tracking-normal">
						{m.practice_recent_desc()}
					</p>
				</div>
			</Accordion.Trigger>
			<Accordion.Content>
				{#if sessionsLoading}
					<p class="meta-text">{m.practice_loading_sessions()}</p>
				{:else if sessions.length === 0}
					<p class="meta-text">{m.practice_no_sessions()}</p>
				{:else}
					<ul class="space-y-3">
						{#each sessions as session (session._id)}
							<li>
								<a
									href={resolve(`/practice/session/${session._id}`)}
									class="flex items-center justify-between border border-border/60 bg-background/70 p-4 transition-colors hover:bg-background/90"
								>
									<div>
										<span class="font-semibold">{relativeTime(session.startedAt)}</span>
										<span class="meta-text ml-2">{m.library_phrase_count({ count: session.phraseCount })}</span>
									</div>
									{#if session.avgScores}
										<div class="practice-review-trigger__scores">
											<span class="practice-review-score" title={m.practice_score_sound()}>S{session.avgScores.sound}</span>
											<span class="practice-review-score" title={m.practice_score_rhythm()}>R{session.avgScores.rhythm}</span>
											<span class="practice-review-score" title={m.practice_score_phrase()}>P{session.avgScores.phrase}</span>
										</div>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</Accordion.Content>
		</Accordion.Item>
	</Accordion.Root>
</div>

<!-- Practice FAB -->
<button
	class="practice-fab"
	onclick={onStart}
	disabled={starting || phraseCount === 0}
	aria-label={m.practice_fab_start()}
>
	<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
		fill="currentColor" stroke="none">
		<polygon points="5,3 19,12 5,21" />
	</svg>
</button>
