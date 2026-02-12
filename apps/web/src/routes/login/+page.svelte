<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '@babylon/shared/auth-client';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import * as m from '$lib/paraglide/messages.js';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = '';

		const { error: err } = await authClient.signIn.email({
			email,
			password
		});

		if (err) {
			error = err.message ?? m.auth_login_failed();
		} else {
			goto(resolve('/'));
		}
		loading = false;
	}
</script>

<div class="page-shell page-shell--compact flex min-h-[calc(100svh-9rem)] items-center justify-center">
	<Card.Root class="w-full border border-border/60 bg-background/88 backdrop-blur-sm">
		<Card.Header>
			<p class="info-kicker">{m.login_kicker()}</p>
			<Card.Title>{m.login_title()}</Card.Title>
			<Card.Description>{m.login_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleLogin} class="space-y-5">
				<div class="space-y-2">
					<Label for="email">{m.auth_email()}</Label>
					<Input id="email" type="email" bind:value={email} required />
				</div>
				<div class="space-y-2">
					<Label for="password">{m.auth_password()}</Label>
					<Input id="password" type="password" bind:value={password} required />
				</div>
				{#if error}
					<p class="text-sm text-red-500">{error}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? m.auth_signing_in() : m.auth_sign_in()}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center">
			<p class="meta-text">
				{m.auth_no_account()}
				<a href={resolve('/register')} class="text-primary underline">{m.auth_register()}</a>
			</p>
		</Card.Footer>
	</Card.Root>
</div>
