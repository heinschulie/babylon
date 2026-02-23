<script lang="ts">
	import { resolve } from '$app/paths';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import { requestNotificationPermission } from '@babylon/shared/notifications';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale, setLocale, locales, isLocale } from '$lib/paraglide/runtime.js';

	const client = useConvexClient();
	const preferences = useQuery(api.preferences.get, {});
	const billing = useQuery(api.billing.getStatus, {});

	let quietStart = $state(22);
	let quietEnd = $state(8);
	let perPhrase = $state(3);
	let timeZone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);
	let saving = $state(false);
	let saved = $state(false);
	let enabling = $state(false);
	let testing = $state(false);
	let testResult = $state<{ success: boolean; message: string } | null>(null);
	let billingLoading = $state(false);
	let billingError = $state<string | null>(null);
	let devTierLoading = $state(false);
	let devTierError = $state<string | null>(null);
	let devTierMessage = $state<string | null>(null);
	let notificationsEnabled = $derived(!!preferences.data?.pushSubscription);

	const localeNames: Record<string, string> = { en: 'English', xh: 'isiXhosa' };
	function localeDisplayName(locale: string): string {
		return localeNames[locale] ?? locale;
	}
	async function switchLanguage(locale: string) {
		if (!isLocale(locale)) return;
		await client.mutation(api.preferences.upsert, { uiLocale: locale });
		setLocale(locale);
	}

	const SKINS = ['default', 'mono'] as const;
	type Skin = (typeof SKINS)[number];

	let currentSkin = $state<Skin>('default');

	function applySkin(skin: Skin) {
		const el = document.documentElement;
		if (skin === 'default') {
			el.removeAttribute('data-skin');
		} else {
			el.setAttribute('data-skin', skin);
		}
		localStorage.setItem('skin', skin);
	}

	async function switchSkin(skin: Skin) {
		currentSkin = skin;
		applySkin(skin);
		await client.mutation(api.preferences.upsert, { uiSkin: skin });
	}

	$effect(() => {
		if (preferences.data) {
			quietStart = preferences.data.quietHoursStart;
			quietEnd = preferences.data.quietHoursEnd;
			perPhrase = preferences.data.notificationsPerPhrase;
			timeZone = preferences.data.timeZone ?? timeZone;
			if (preferences.data.uiSkin) {
				currentSkin = preferences.data.uiSkin as Skin;
			}
		}
	});

	async function handleSave() {
		saving = true;
		saved = false;

		try {
			await updatePreferences();
			saved = true;
			setTimeout(() => (saved = false), 2000);
		} catch (e) {
			console.error('Failed to save preferences:', e);
		} finally {
			saving = false;
		}
	}

	async function updatePreferences() {
		await client.mutation(api.preferences.upsert, {
			quietHoursStart: quietStart,
			quietHoursEnd: quietEnd,
			notificationsPerPhrase: perPhrase,
			timeZone
		});
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

	async function sendTestNotification() {
		testing = true;
		testResult = null;

		try {
			await client.action(api.notificationsNode.sendTest, {});
			testResult = { success: true, message: m.settings_push_test_sent() };
		} catch (e) {
			testResult = {
				success: false,
				message: e instanceof Error ? e.message : m.settings_push_test_failed()
			};
		} finally {
			testing = false;
			setTimeout(() => (testResult = null), 5000);
		}
	}

	async function startCheckout(plan: 'ai' | 'pro') {
		billingLoading = true;
		billingError = null;

		try {
			const checkout = await client.mutation(api.billing.createPayfastCheckout, { plan });
			const form = document.createElement('form');
			form.method = 'POST';
			form.action = checkout.endpointUrl;

			const fields = checkout.fields as Record<string, string>;
			Object.entries(fields).forEach(([key, value]) => {
				const input = document.createElement('input');
				input.type = 'hidden';
				input.name = key;
				input.value = value;
				form.appendChild(input);
			});

			document.body.appendChild(form);
			form.submit();
			form.remove();
		} catch (e) {
			billingError = e instanceof Error ? e.message : m.settings_sub_checkout_error();
		} finally {
			billingLoading = false;
		}
	}

	async function setDevTier(tier: 'free' | 'ai' | 'pro') {
		devTierLoading = true;
		devTierError = null;
		devTierMessage = null;
		try {
			await client.mutation(api.billing.setMyTierForDev, {
				tier,
				resetDailyUsage: true
			});
			devTierMessage = m.settings_dev_switched({ tier });
		} catch (e) {
			devTierError = e instanceof Error ? e.message : m.settings_dev_error();
		} finally {
			devTierLoading = false;
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<div class="page-stack">
		<a href={resolve('/')} class="meta-text underline"
			>&larr; {m.settings_back()}</a
		>
		<p class="info-kicker">{m.settings_kicker()}</p>
		<h1 class="text-5xl sm:text-6xl">{m.settings_title()}</h1>
	</div>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>{m.settings_language_title()}</Card.Title>
			<Card.Description>{m.settings_language_desc()}</Card.Description>
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
			<Card.Title>{m.settings_appearance_title()}</Card.Title>
			<Card.Description>{m.settings_appearance_desc()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex gap-3">
				{#each SKINS as skin}
					<button
						onclick={() => switchSkin(skin)}
						class="flex-1 border-2 p-4 text-center transition-colors {currentSkin === skin
							? 'border-primary bg-primary/10'
							: 'border-border hover:border-muted-foreground'}"
					>
						<span class="font-display text-lg uppercase tracking-wide">
							{skin === 'default' ? m.settings_skin_default() : m.settings_skin_mono()}
						</span>
					</button>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>{m.settings_push_title()}</Card.Title>
			<Card.Description>{m.settings_push_desc()}</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if notificationsEnabled}
				<p class="text-green-600">{m.settings_push_enabled()}</p>
				<div class="flex items-center gap-4 flex-wrap">
					<Button onclick={sendTestNotification} disabled={testing} variant="outline">
						{testing ? m.settings_push_sending() : m.settings_push_test()}
					</Button>
					<Button onclick={enableNotifications} disabled={enabling} variant="ghost" size="sm">
						{enabling ? m.settings_push_refreshing() : m.settings_push_refresh()}
					</Button>
					{#if testResult}
						<span class="{testResult.success ? 'text-green-600' : 'text-destructive'}">
							{testResult.message}
						</span>
					{/if}
				</div>
			{:else}
				<Button onclick={enableNotifications} disabled={enabling}>
					{enabling ? m.settings_push_enabling() : m.settings_push_enable()}
				</Button>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>{m.settings_prefs_title()}</Card.Title>
			<Card.Description>{m.settings_prefs_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if preferences.isLoading}
				<p class="text-muted-foreground">{m.settings_prefs_loading()}</p>
			{:else if preferences.error}
				<p class="text-destructive">{m.settings_prefs_error()}</p>
			{:else}
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="quietStart">{m.settings_quiet_start()}</Label>
						<Input
							id="quietStart"
							type="number"
							min="0"
							max="23"
							bind:value={quietStart}
							placeholder="22"
						/>
						<p class="meta-text">{m.settings_quiet_start_help()}</p>
					</div>
					<div class="space-y-2">
						<Label for="quietEnd">{m.settings_quiet_end()}</Label>
						<Input
							id="quietEnd"
							type="number"
							min="0"
							max="23"
							bind:value={quietEnd}
							placeholder="8"
						/>
						<p class="meta-text">{m.settings_quiet_end_help()}</p>
					</div>
				</div>
				<div class="space-y-2">
					<Label for="perPhrase">{m.settings_per_phrase()}</Label>
					<Input
						id="perPhrase"
						type="number"
						min="1"
						max="10"
						bind:value={perPhrase}
						placeholder="3"
					/>
					<p class="meta-text">
						{m.settings_per_phrase_help()}
					</p>
				</div>
			{/if}
		</Card.Content>
		<Card.Footer class="flex items-center gap-4">
			<Button onclick={handleSave} disabled={preferences.isLoading || saving}>
				{saving ? m.btn_saving() : m.btn_save()}
			</Button>
			{#if saved}
				<span class="text-green-600">{m.btn_saved()}</span>
			{/if}
		</Card.Footer>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>{m.settings_sub_title()}</Card.Title>
			<Card.Description>{m.settings_sub_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if billing.isLoading}
				<p class="text-muted-foreground">{m.settings_sub_loading()}</p>
			{:else if billing.error}
				<p class="text-destructive">{m.settings_sub_error()}</p>
			{:else}
				<div class="flex flex-col gap-2">
					<p>
						{m.settings_sub_tier()}
						<span class="font-semibold capitalize">{billing.data?.tier ?? 'free'}</span>
					</p>
					<p class="meta-text">
						{m.settings_sub_status({ status: billing.data?.status ?? 'unknown' })}
					</p>
					<p class="meta-text">
						{m.settings_sub_minutes({ used: billing.data?.minutesUsed?.toFixed(1) ?? '0.0', limit: String(billing.data?.minutesLimit ?? 0) })}
					</p>
				</div>
				<div class="flex flex-wrap gap-3">
					<Button onclick={() => startCheckout('ai')} disabled={billingLoading}>
						{billingLoading ? m.settings_sub_redirecting() : m.settings_sub_upgrade_ai()}
					</Button>
					<Button onclick={() => startCheckout('pro')} disabled={billingLoading} variant="outline">
						{billingLoading ? m.settings_sub_redirecting() : m.settings_sub_upgrade_pro()}
					</Button>
				</div>
				{#if billingError}
					<p class="text-destructive">{billingError}</p>
				{/if}

				<div class="mt-4 border border-border/60 bg-muted/40 p-4">
					<p class="info-kicker">
						{m.settings_dev_title()}
					</p>
					<p class="meta-text mt-2">
						{m.settings_dev_desc()}
					</p>
					{#if billing.data?.devToggleEnabled === false}
						<p class="meta-text mt-2 text-orange-600">
							{m.settings_dev_disabled()}
						</p>
					{/if}
					<div class="mt-3 flex flex-wrap gap-2">
						<Button
							size="sm"
							variant={billing.data?.tier === 'free' ? 'default' : 'outline'}
							disabled={devTierLoading}
							onclick={() => setDevTier('free')}
						>
							{m.settings_dev_free()}
						</Button>
						<Button
							size="sm"
							variant={billing.data?.tier === 'ai' ? 'default' : 'outline'}
							disabled={devTierLoading}
							onclick={() => setDevTier('ai')}
						>
							{m.settings_dev_ai()}
						</Button>
						<Button
							size="sm"
							variant={billing.data?.tier === 'pro' ? 'default' : 'outline'}
							disabled={devTierLoading}
							onclick={() => setDevTier('pro')}
						>
							{m.settings_dev_pro()}
						</Button>
					</div>
					{#if devTierMessage}
						<p class="meta-text mt-2 text-green-600">{devTierMessage}</p>
					{/if}
					{#if devTierError}
						<p class="meta-text mt-2 text-destructive">{devTierError}</p>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
