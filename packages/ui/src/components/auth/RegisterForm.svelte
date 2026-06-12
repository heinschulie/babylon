<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Button } from '../button';
	import * as Card from '../card';
	import { Input } from '../input';
	import { Label } from '../label';

	interface RegisterFormLabels {
		kicker: string;
		title: string;
		description: string;
		nameLabel: string;
		emailLabel: string;
		passwordLabel: string;
		createAccount: string;
		creatingAccount: string;
		registrationFailed: string;
		haveAccount: string;
		signInLink: string;
	}

	interface RegisterAuthClient {
		signUp: {
			email: (input: {
				name: string;
				email: string;
				password: string;
			}) => Promise<{ error: { message?: string } | null }>;
		};
	}

	interface Props {
		authClient: RegisterAuthClient;
		/** Localized strings — this package has no i18n. */
		labels: RegisterFormLabels;
	}

	let { authClient, labels }: Props = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const r = resolve as (...args: any[]) => string;

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleRegister(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = '';

		const { error: err } = await authClient.signUp.email({
			name,
			email,
			password
		});

		if (err) {
			error = err.message ?? labels.registrationFailed;
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
			<form onsubmit={handleRegister} class="space-y-5">
				<div class="space-y-2">
					<Label for="name">{labels.nameLabel}</Label>
					<Input id="name" bind:value={name} required />
				</div>
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
					{loading ? labels.creatingAccount : labels.createAccount}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center">
			<p class="meta-text">
				{labels.haveAccount}
				<a href={r('/login')} class="text-primary underline">{labels.signInLink}</a>
			</p>
		</Card.Footer>
	</Card.Root>
</div>
