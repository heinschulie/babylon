<script lang="ts">
	import * as Accordion from '@babylon/ui/accordion';
	import { AttemptPlayer } from '@babylon/ui/audio';
	import * as m from '$lib/paraglide/messages.js';
	import { SvelteSet } from 'svelte/reactivity';

	type Attempt = {
		_id: string;
		status: string;
		phraseEnglish: string;
		phraseTranslation: string;
		feedbackText?: string | null;
		audioUrl?: string | null;
		aiSoundAccuracy?: number | null;
		aiRhythmIntonation?: number | null;
		aiPhraseAccuracy?: number | null;
		humanReview?: {
			initialReview?: {
				soundAccuracy: number;
				rhythmIntonation: number;
				phraseAccuracy: number;
				audioUrl?: string | null;
			} | null;
		} | null;
	};

	let { attempts, anchorFeedback = false }: { attempts: Attempt[]; anchorFeedback?: boolean } =
		$props();

	// Verifier exemplar clips show a fire badge until first listened to.
	const playedVerifierClips = new SvelteSet<string>();
</script>

<Accordion.Root type="single">
	{#each attempts as attempt (attempt._id)}
		{@const initialReview = attempt.humanReview?.initialReview}
		{@const showFire = !!initialReview?.audioUrl && !playedVerifierClips.has(attempt._id)}
		<Accordion.Item value={attempt._id}>
			<Accordion.Trigger class="practice-review-trigger">
				{#if showFire}
					<img src="/fire.gif" alt="" class="practice-review-fire" />
				{/if}
				<div class="practice-review-trigger__content">
					<p class="practice-review-phrase">{attempt.phraseTranslation}</p>
					<p class="meta-text">{attempt.phraseEnglish}</p>
				</div>
				{#if attempt.status === 'feedback_ready' && attempt.aiSoundAccuracy != null}
					<div class="practice-review-trigger__scores">
						<span class="practice-review-score" title={m.practice_score_sound()}>S{attempt.aiSoundAccuracy}</span>
						<span class="practice-review-score" title={m.practice_score_rhythm()}>R{attempt.aiRhythmIntonation}</span>
						<span class="practice-review-score" title={m.practice_score_phrase()}>P{attempt.aiPhraseAccuracy}</span>
					</div>
				{:else if attempt.status === 'processing'}
					<span class="meta-text">{m.state_processing()}</span>
				{:else if attempt.status === 'failed'}
					<span class="text-destructive text-sm">{m.state_failed()}</span>
				{/if}
				{#if initialReview}
					<div class="practice-review-trigger__verifier-scores">
						<span class="practice-review-vscore" title={m.practice_score_sound()}>S{initialReview.soundAccuracy}</span>
						<span class="practice-review-vscore" title={m.practice_score_rhythm()}>R{initialReview.rhythmIntonation}</span>
						<span class="practice-review-vscore" title={m.practice_score_phrase()}>P{initialReview.phraseAccuracy}</span>
					</div>
				{/if}
			</Accordion.Trigger>
			<Accordion.Content>
				<div
					class="practice-review-detail"
					id={anchorFeedback && initialReview ? 'feedback' : undefined}
				>
					{#if attempt.feedbackText}
						<div class="text-sm practice-review-feedback">
							{#each attempt.feedbackText.split('\n') as line}
								{#if line.trim()}<p>{line}</p>{/if}
							{/each}
						</div>
					{/if}
					{#if attempt.audioUrl}
						<div class="practice-review-detail__players">
							<div>
								<p class="info-kicker mb-1">{m.practice_your_recording()}</p>
								<AttemptPlayer src={attempt.audioUrl} playingLabel={m.state_playing()} />
							</div>
							{#if initialReview?.audioUrl}
								<div>
									<p class="info-kicker mb-1">{m.practice_verifier_example()}</p>
									<AttemptPlayer
										src={initialReview.audioUrl}
										variant="verifier"
										playingLabel={m.state_playing()}
										onfirstended={() => playedVerifierClips.add(attempt._id)}
									/>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</Accordion.Content>
		</Accordion.Item>
	{/each}
</Accordion.Root>
