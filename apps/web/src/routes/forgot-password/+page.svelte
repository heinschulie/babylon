<script lang="ts">
	import { resolve } from '$app/paths';
	import { authClient } from '@babylon/shared/auth-client';
	import { convexClient } from '@babylon/shared/convex';
	import { api } from '@babylon/convex';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import * as m from '$lib/paraglide/messages.js';

	let email = $state('');
	let error = $state('');
	let loading = $state(false);
	let submitted = $state(false);
	let debugUrl = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = '';
		debugUrl = '';

		const redirectTo = `${window.location.origin}${resolve('/reset-password')}`;
		const { error: err } = await authClient.requestPasswordReset({
			email,
			redirectTo
		});

		if (err) {
			error = err.message ?? m.auth_reset_failed();
			loading = false;
			return;
		}

		submitted = true;
		try {
			const debugLink = await convexClient.query(api.passwordReset.getLatestDebugLink, { email });
			debugUrl = debugLink?.url ?? '';
		} catch {
			debugUrl = '';
		}

		loading = false;
	}
</script>

<div class="page-shell page-shell--compact flex min-h-[calc(100svh-9rem)] items-center justify-center">
	<Card.Root class="w-full border border-border/60 bg-background/88 backdrop-blur-sm">
		<Card.Header>
			<p class="info-kicker">{m.auth_forgot_password_link()}</p>
			<Card.Title>{m.auth_reset_request_title()}</Card.Title>
			<Card.Description>{m.auth_reset_request_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleSubmit} class="space-y-5">
				<div class="space-y-2">
					<Label for="email">{m.auth_email()}</Label>
					<Input id="email" type="email" bind:value={email} required />
				</div>
				{#if error}
					<p class="text-sm text-red-500">{error}</p>
				{/if}
				{#if submitted}
					<p class="text-sm text-foreground/80">{m.auth_reset_request_success()}</p>
				{/if}
				{#if debugUrl}
					<div class="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
						<p class="text-sm text-foreground/80">{m.auth_reset_request_debug_description()}</p>
						<a class="inline-flex text-sm text-primary underline" href={debugUrl}
							>{m.auth_reset_request_debug_link()}</a
						>
					</div>
				{/if}
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? m.auth_reset_request_submitting() : m.auth_reset_request_submit()}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center">
			<a href={resolve('/login')} class="meta-text text-primary underline"
				>{m.auth_back_to_login()}</a
			>
		</Card.Footer>
	</Card.Root>
</div>
