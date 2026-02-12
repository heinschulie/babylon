<script lang="ts">
	import { resolve } from '$app/paths';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import { requestNotificationPermission } from '@babylon/shared/notifications';

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

	$effect(() => {
		if (preferences.data) {
			quietStart = preferences.data.quietHoursStart;
			quietEnd = preferences.data.quietHoursEnd;
			perPhrase = preferences.data.notificationsPerPhrase;
			timeZone = preferences.data.timeZone ?? timeZone;
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
			testResult = { success: true, message: 'Test notification sent!' };
		} catch (e) {
			testResult = {
				success: false,
				message: e instanceof Error ? e.message : 'Failed to send test notification'
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
			billingError = e instanceof Error ? e.message : 'Failed to start checkout';
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
			devTierMessage = `Switched to ${tier} tier (dev mode).`;
		} catch (e) {
			devTierError = e instanceof Error ? e.message : 'Failed to switch dev tier';
		} finally {
			devTierLoading = false;
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<div class="page-stack">
		<a href={resolve('/')} class="meta-text underline"
			>&larr; Back to phrase library</a
		>
		<p class="info-kicker">Keep Sessions Sustainable</p>
		<h1 class="text-5xl sm:text-6xl">Settings</h1>
	</div>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>Push Notifications</Card.Title>
			<Card.Description>Enable push notifications to receive vocabulary reminders.</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if notificationsEnabled}
				<p class="text-green-600">Notifications are enabled!</p>
				<div class="flex items-center gap-4 flex-wrap">
					<Button onclick={sendTestNotification} disabled={testing} variant="outline">
						{testing ? 'Sending...' : 'Test Notification'}
					</Button>
					<Button onclick={enableNotifications} disabled={enabling} variant="ghost" size="sm">
						{enabling ? 'Refreshing...' : 'Refresh Subscription'}
					</Button>
					{#if testResult}
						<span class="{testResult.success ? 'text-green-600' : 'text-destructive'}">
							{testResult.message}
						</span>
					{/if}
				</div>
			{:else}
				<Button onclick={enableNotifications} disabled={enabling}>
					{enabling ? 'Enabling...' : 'Enable Notifications'}
				</Button>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>Notification Preferences</Card.Title>
			<Card.Description>Configure when and how you receive reminders.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if preferences.isLoading}
				<p class="text-muted-foreground">Loading preferences...</p>
			{:else if preferences.error}
				<p class="text-destructive">Error loading preferences</p>
			{:else}
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="quietStart">Quiet Hours Start</Label>
						<Input
							id="quietStart"
							type="number"
							min="0"
							max="23"
							bind:value={quietStart}
							placeholder="22"
						/>
						<p class="meta-text">Hour (0-23) when quiet hours begin</p>
					</div>
					<div class="space-y-2">
						<Label for="quietEnd">Quiet Hours End</Label>
						<Input
							id="quietEnd"
							type="number"
							min="0"
							max="23"
							bind:value={quietEnd}
							placeholder="8"
						/>
						<p class="meta-text">Hour (0-23) when quiet hours end</p>
					</div>
				</div>
				<div class="space-y-2">
					<Label for="perPhrase">Notifications Per Phrase</Label>
					<Input
						id="perPhrase"
						type="number"
						min="1"
						max="10"
						bind:value={perPhrase}
						placeholder="3"
					/>
					<p class="meta-text">
						Number of reminder notifications per phrase per day
					</p>
				</div>
			{/if}
		</Card.Content>
		<Card.Footer class="flex items-center gap-4">
			<Button onclick={handleSave} disabled={preferences.isLoading || saving}>
				{saving ? 'Saving...' : 'Save Settings'}
			</Button>
			{#if saved}
				<span class="text-green-600">Saved!</span>
			{/if}
		</Card.Footer>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>Subscription</Card.Title>
			<Card.Description>Manage your plan and daily recording minutes.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if billing.isLoading}
				<p class="text-muted-foreground">Loading subscription...</p>
			{:else if billing.error}
				<p class="text-destructive">Error loading subscription</p>
			{:else}
				<div class="flex flex-col gap-2">
					<p>
						Current tier:
						<span class="font-semibold capitalize">{billing.data?.tier ?? 'free'}</span>
					</p>
					<p class="meta-text">
						Status: {billing.data?.status ?? 'unknown'}
					</p>
					<p class="meta-text">
						Minutes used today: {billing.data?.minutesUsed?.toFixed(1) ?? '0.0'} /{' '}
						{billing.data?.minutesLimit ?? 0}
					</p>
				</div>
				<div class="flex flex-wrap gap-3">
					<Button onclick={() => startCheckout('ai')} disabled={billingLoading}>
						{billingLoading ? 'Redirecting...' : 'Upgrade to AI (R150/mo)'}
					</Button>
					<Button onclick={() => startCheckout('pro')} disabled={billingLoading} variant="outline">
						{billingLoading ? 'Redirecting...' : 'Upgrade to Pro (R500/mo)'}
					</Button>
				</div>
				{#if billingError}
					<p class="text-destructive">{billingError}</p>
				{/if}

				<div class="mt-4 border border-border/60 bg-muted/40 p-4">
					<p class="info-kicker">
						Dev Tier Switch
					</p>
					<p class="meta-text mt-2">
						Instantly switch your current user between `free`, `ai`, and `pro` without checkout.
					</p>
					{#if billing.data?.devToggleEnabled === false}
						<p class="meta-text mt-2 text-orange-600">
							Backend toggle is currently disabled. Enable `BILLING_DEV_TOGGLE=true` in Convex env.
						</p>
					{/if}
					<div class="mt-3 flex flex-wrap gap-2">
						<Button
							size="sm"
							variant={billing.data?.tier === 'free' ? 'default' : 'outline'}
							disabled={devTierLoading}
							onclick={() => setDevTier('free')}
						>
							Free
						</Button>
						<Button
							size="sm"
							variant={billing.data?.tier === 'ai' ? 'default' : 'outline'}
							disabled={devTierLoading}
							onclick={() => setDevTier('ai')}
						>
							AI
						</Button>
						<Button
							size="sm"
							variant={billing.data?.tier === 'pro' ? 'default' : 'outline'}
							disabled={devTierLoading}
							onclick={() => setDevTier('pro')}
						>
							Pro
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
