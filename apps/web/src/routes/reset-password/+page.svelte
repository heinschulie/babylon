<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { authClient } from '@babylon/shared/auth-client';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import * as m from '$lib/paraglide/messages.js';

	const token = $derived(page.url.searchParams.get('token') ?? '');
	const linkError = $derived(page.url.searchParams.get('error') ?? '');

	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);
	let success = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		if (!token) {
			error = m.auth_reset_invalid_token();
			return;
		}

		if (password !== confirmPassword) {
			error = m.auth_reset_password_mismatch();
			return;
		}

		loading = true;
		const { error: err } = await authClient.resetPassword({
			newPassword: password,
			token
		});

		if (err) {
			error = err.message ?? m.auth_reset_failed();
			loading = false;
			return;
		}

		success = true;
		loading = false;
		setTimeout(() => {
			goto(resolve('/login'));
		}, 1200);
	}
</script>

<div class="page-shell page-shell--compact flex min-h-[calc(100svh-9rem)] items-center justify-center">
	<Card.Root class="w-full border border-border/60 bg-background/88 backdrop-blur-sm">
		<Card.Header>
			<p class="info-kicker">{m.auth_reset_title()}</p>
			<Card.Title>{m.auth_reset_title()}</Card.Title>
			<Card.Description>{m.auth_reset_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleSubmit} class="space-y-5">
				<div class="space-y-2">
					<Label for="password">{m.auth_reset_new_password()}</Label>
					<Input id="password" type="password" bind:value={password} required minlength={8} />
				</div>
				<div class="space-y-2">
					<Label for="confirmPassword">{m.auth_reset_confirm_password()}</Label>
					<Input
						id="confirmPassword"
						type="password"
						bind:value={confirmPassword}
						required
						minlength={8}
					/>
				</div>
				{#if linkError || error}
					<p class="text-sm text-red-500">
						{linkError ? m.auth_reset_invalid_token() : error}
					</p>
				{/if}
				{#if success}
					<p class="text-sm text-foreground/80">{m.auth_reset_success()}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={loading || !token || !!linkError}>
					{loading ? m.auth_reset_submitting() : m.auth_reset_submit()}
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
