<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Button } from '../button';
	import * as Card from '../card';
	import { Input } from '../input';
	import { Label } from '../label';

	interface LoginFormLabels {
		kicker: string;
		title: string;
		description: string;
		emailLabel: string;
		passwordLabel: string;
		signIn: string;
		signingIn: string;
		loginFailed: string;
		forgotPasswordLink: string;
		noAccount: string;
		register: string;
	}

	interface LoginAuthClient {
		signIn: {
			email: (input: {
				email: string;
				password: string;
			}) => Promise<{ error: { message?: string } | null }>;
		};
	}

	interface Props {
		authClient: LoginAuthClient;
		/** Localized strings — this package has no i18n. */
		labels: LoginFormLabels;
	}

	let { authClient, labels }: Props = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const r = resolve as (...args: any[]) => string;

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
			error = err.message ?? labels.loginFailed;
		} else {
			goto(r('/'));
		}
		loading = false;
	}
</script>

<div class="page-shell page-shell--compact flex min-h-[calc(100svh-9rem)] items-center justify-center">
	<Card.Root class="w-full border border-border/60 bg-background/88 backdrop-blur-sm">
		<Card.Header>
			<p class="info-kicker">{labels.kicker}</p>
			<Card.Title>{labels.title}</Card.Title>
			<Card.Description>{labels.description}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleLogin} class="space-y-5">
				<div class="space-y-2">
					<Label for="email">{labels.emailLabel}</Label>
					<Input id="email" type="email" bind:value={email} required />
				</div>
				<div class="space-y-2">
					<Label for="password">{labels.passwordLabel}</Label>
					<Input id="password" type="password" bind:value={password} required />
				</div>
				{#if error}
					<p class="text-sm text-red-500">{error}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? labels.signingIn : labels.signIn}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center">
			<div class="space-y-2 text-center">
				<p class="meta-text">
					<a href={r('/forgot-password')} class="text-primary underline"
						>{labels.forgotPasswordLink}</a
					>
				</p>
				<p class="meta-text">
					{labels.noAccount}
					<a href={r('/register')} class="text-primary underline">{labels.register}</a>
				</p>
			</div>
		</Card.Footer>
	</Card.Root>
</div>
