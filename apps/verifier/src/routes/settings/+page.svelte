<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import { requestNotificationPermission } from '@babylon/shared/notifications';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale, setLocale, locales, isLocale } from '$lib/paraglide/runtime.js';

	const client = useConvexClient();
	const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});
	const supportedLanguages = useQuery(api.verifierAccess.listSupportedLanguages, {});
	const verifierStats = useQuery(api.verifierAccess.getMyStats, {});
	const preferences = useQuery(api.preferences.get, {});

	let selectedLanguage = $state('xh-ZA');
	let onboardingFirstName = $state('');
	let onboardingImageUrl = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let message = $state<string | null>(null);
	let enabling = $state(false);
	let testing = $state(false);
	let testResult = $state<{ success: boolean; message: string } | null>(null);
	let notificationsEnabled = $derived(!!preferences.data?.pushSubscription);

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	const canReview = $derived(
		!!verifierState.data?.languages.find(
			(l) => l.languageCode === selectedLanguage && l.active
		)
	);

	const localeNames: Record<string, string> = { en: 'English', xh: 'isiXhosa' };
	function localeDisplayName(locale: string): string {
		return localeNames[locale] ?? locale;
	}
	async function switchLanguage(locale: string) {
		if (!isLocale(locale)) return;
		await client.mutation(api.preferences.upsert, { uiLocale: locale });
		setLocale(locale);
	}

	async function enableNotifications() {
		enabling = true;
		try {
			const subscription = await requestNotificationPermission();
			if (subscription) {
				await client.mutation(api.preferences.upsert, {
					pushSubscription: JSON.stringify(subscription.toJSON())
				});
			}
		} catch (e) {
			console.error('Failed to enable notifications:', e);
		} finally {
			enabling = false;
		}
	}

	async function disableNotifications() {
		await client.mutation(api.preferences.upsert, { pushSubscription: '' });
	}

	async function sendTestNotification() {
		testing = true;
		testResult = null;
		try {
			await client.action(api.notificationsNode.sendTest, {});
			testResult = { success: true, message: m.vsettings_push_test_sent() };
		} catch (e) {
			testResult = {
				success: false,
				message: e instanceof Error ? e.message : m.vsettings_push_test_failed()
			};
		} finally {
			testing = false;
			setTimeout(() => (testResult = null), 5000);
		}
	}

	async function saveOnboarding() {
		if (!onboardingFirstName.trim()) {
			error = m.vsettings_name_required();
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
			message = m.vsettings_activated();
		} catch (e) {
			error = e instanceof Error ? e.message : m.vsettings_save_failed();
		} finally {
			saving = false;
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<div class="page-stack">
		<a href={resolve('/')} class="meta-text underline">&larr; {m.vsettings_back()}</a>
		<p class="info-kicker">{m.vsettings_kicker()}</p>
		<h1 class="text-5xl sm:text-6xl">{m.vsettings_title()}</h1>
	</div>

	<!-- Stats callout -->
	<div class="border border-primary/40 bg-primary/10 p-4">
		<div class="grid grid-cols-2 gap-4">
			<div>
				<p class="info-kicker">{m.vsettings_total()}</p>
				<p class="mt-2 text-4xl font-display">{verifierStats.data?.totalReviews ?? 0}</p>
			</div>
			<div>
				<p class="info-kicker">{m.vsettings_today()}</p>
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
			<Card.Title>{m.vsettings_language_ui_title()}</Card.Title>
			<Card.Description>{m.vsettings_language_ui_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<select
				value={getLocale()}
				onchange={(e) => switchLanguage(e.currentTarget.value)}
				class="w-full border border-input bg-background px-3 py-2.5 text-base"
			>
				{#each locales as locale}
					<option value={locale}>{localeDisplayName(locale)}</option>
				{/each}
			</select>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>{m.vsettings_language_title()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-3">
			<div class="space-y-2">
				<Label for="languageCode">{m.vsettings_language_label()}</Label>
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
				<p class="meta-text">{m.vsettings_active({ name: verifierState.data.profile.firstName })}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>{m.vsettings_push_title()}</Card.Title>
			<Card.Description>{m.vsettings_push_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if notificationsEnabled}
				<p class="text-green-600">{m.vsettings_push_enabled()}</p>
				<div class="flex items-center gap-4 flex-wrap">
					<Button onclick={sendTestNotification} disabled={testing} variant="outline">
						{testing ? '...' : m.vsettings_push_test()}
					</Button>
					<Button onclick={disableNotifications} variant="ghost" size="sm">
						{m.vsettings_push_disable()}
					</Button>
					{#if testResult}
						<span class="{testResult.success ? 'text-green-600' : 'text-destructive'}">
							{testResult.message}
						</span>
					{/if}
				</div>
			{:else}
				<Button onclick={enableNotifications} disabled={enabling}>
					{enabling ? m.vsettings_push_enabling() : m.vsettings_push_enable()}
				</Button>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if !verifierState.data?.profile || !canReview}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.vsettings_activate_title()}</Card.Title>
				<Card.Description>{m.vsettings_activate_desc()}</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="space-y-2">
					<Label for="firstName">{m.vsettings_first_name()}</Label>
					<Input id="firstName" bind:value={onboardingFirstName} placeholder={m.vsettings_first_name_placeholder()} />
				</div>
				<div class="space-y-2">
					<Label for="profileImage">{m.vsettings_image_label()}</Label>
					<Input id="profileImage" bind:value={onboardingImageUrl} placeholder="https://..." />
				</div>
				<Button class="w-full" onclick={saveOnboarding} disabled={saving}>
					{saving ? m.btn_saving() : m.vsettings_activate_btn()}
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
