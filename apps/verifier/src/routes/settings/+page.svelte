<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';

	const client = useConvexClient();
	const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});
	const supportedLanguages = useQuery(api.verifierAccess.listSupportedLanguages, {});
	const verifierStats = useQuery(api.verifierAccess.getMyStats, {});

	let selectedLanguage = $state('xh-ZA');
	let onboardingFirstName = $state('');
	let onboardingImageUrl = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let message = $state<string | null>(null);

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	const canReview = $derived(
		!!verifierState.data?.languages.find(
			(l) => l.languageCode === selectedLanguage && l.active
		)
	);

	async function saveOnboarding() {
		if (!onboardingFirstName.trim()) {
			error = 'Please enter a first name.';
			return;
		}
		saving = true;
		error = null;
		try {
			await client.mutation(api.verifierAccess.upsertMyProfile, {
				firstName: onboardingFirstName.trim(),
				profileImageUrl: onboardingImageUrl.trim() || undefined
			});
			await client.mutation(api.verifierAccess.setMyLanguageActive, {
				languageCode: selectedLanguage,
				active: true
			});
			message = 'Verifier profile activated.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<div class="page-stack">
		<a href={resolve('/')} class="meta-text underline">&larr; Back home</a>
		<p class="info-kicker">Verifier Configuration</p>
		<h1 class="text-5xl sm:text-6xl">Settings</h1>
	</div>

	<!-- Stats callout -->
	<div class="border border-primary/40 bg-primary/10 p-4">
		<div class="grid grid-cols-2 gap-4">
			<div>
				<p class="info-kicker">Total Verifications</p>
				<p class="mt-2 text-4xl font-display">{verifierStats.data?.totalReviews ?? 0}</p>
			</div>
			<div>
				<p class="info-kicker">Today</p>
				<p class="mt-2 text-4xl font-display">{verifierStats.data?.todayReviews ?? 0}</p>
			</div>
		</div>
	</div>

	{#if error}
		<div class="border border-destructive/50 bg-destructive/10 p-3 text-destructive">{error}</div>
	{/if}
	{#if message}
		<div class="border border-primary/40 bg-primary/10 p-3 text-primary">{message}</div>
	{/if}

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>Language Team</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-3">
			<div class="space-y-2">
				<Label for="languageCode">Language</Label>
				<select
					id="languageCode"
					class="w-full border border-input bg-background px-3 py-2.5 text-base"
					bind:value={selectedLanguage}
				>
					{#if supportedLanguages.data}
						{#each supportedLanguages.data.filter((l) => l.code === 'xh-ZA') as language}
							<option value={language.code}>{language.displayName} ({language.code})</option>
						{/each}
					{/if}
				</select>
			</div>
			{#if verifierState.data?.profile}
				<p class="meta-text">Active verifier: {verifierState.data.profile.firstName}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if !verifierState.data?.profile || !canReview}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>Activate Verifier Access</Card.Title>
				<Card.Description>Set your visible identity and join this language team.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="space-y-2">
					<Label for="firstName">First Name</Label>
					<Input id="firstName" bind:value={onboardingFirstName} placeholder="e.g. Lwazi" />
				</div>
				<div class="space-y-2">
					<Label for="profileImage">Profile Image URL (optional)</Label>
					<Input id="profileImage" bind:value={onboardingImageUrl} placeholder="https://..." />
				</div>
				<Button class="w-full" onclick={saveOnboarding} disabled={saving}>
					{saving ? 'Saving...' : 'Activate'}
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
