<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '../button';
	import * as Card from '../card';
	import { Input } from '../input';
	import { Label } from '../label';

	interface ResetPasswordFormLabels {
		kicker: string;
		title: string;
		description: string;
		newPasswordLabel: string;
		confirmPasswordLabel: string;
		invalidToken: string;
		passwordMismatch: string;
		resetFailed: string;
		success: string;
		submitting: string;
		submit: string;
		backToLogin: string;
	}

	interface ResetPasswordAuthClient {
		resetPassword: (input: {
			newPassword: string;
			token: string;
		}) => Promise<{ error: { message?: string } | null }>;
	}

	interface Props {
		authClient: ResetPasswordAuthClient;
		/** Localized strings — this package has no i18n. */
		labels: ResetPasswordFormLabels;
	}

	let { authClient, labels }: Props = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const r = resolve as (...args: any[]) => string;

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
			error = labels.invalidToken;
			return;
		}

		if (password !== confirmPassword) {
			error = labels.passwordMismatch;
			return;
		}

		loading = true;
		const { error: err } = await authClient.resetPassword({
			newPassword: password,
			token
		});

		if (err) {
			error = err.message ?? labels.resetFailed;
			loading = false;
			return;
		}

		success = true;
		loading = false;
		setTimeout(() => {
			goto(r('/login'));
		}, 1200);
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
			<form onsubmit={handleSubmit} class="space-y-5">
				<div class="space-y-2">
					<Label for="password">{labels.newPasswordLabel}</Label>
					<Input id="password" type="password" bind:value={password} required minlength={8} />
				</div>
				<div class="space-y-2">
					<Label for="confirmPassword">{labels.confirmPasswordLabel}</Label>
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
						{linkError ? labels.invalidToken : error}
					</p>
				{/if}
				{#if success}
					<p class="text-sm text-foreground/80">{labels.success}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={loading || !token || !!linkError}>
					{loading ? labels.submitting : labels.submit}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center">
			<a href={r('/login')} class="meta-text text-primary underline">{labels.backToLogin}</a>
		</Card.Footer>
	</Card.Root>
</div>
