<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '../button';
	import * as Card from '../card';
	import { Input } from '../input';
	import { Label } from '../label';

	interface ForgotPasswordFormLabels {
		kicker: string;
		title: string;
		description: string;
		emailLabel: string;
		resetFailed: string;
		success: string;
		debugDescription: string;
		debugLink: string;
		submitting: string;
		submit: string;
		backToLogin: string;
	}

	interface ForgotPasswordAuthClient {
		requestPasswordReset: (input: {
			email: string;
			redirectTo: string;
		}) => Promise<{ error: { message?: string } | null }>;
	}

	interface Props {
		authClient: ForgotPasswordAuthClient;
		/** Fetches the latest password-reset debug link (dev only) — null when disabled. */
		getDebugLink: (email: string) => Promise<{ url: string } | null>;
		/** Localized strings — this package has no i18n. */
		labels: ForgotPasswordFormLabels;
	}

	let { authClient, getDebugLink, labels }: Props = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const r = resolve as (...args: any[]) => string;

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

		const redirectTo = `${window.location.origin}${r('/reset-password')}`;
		const { error: err } = await authClient.requestPasswordReset({
			email,
			redirectTo
		});

		if (err) {
			error = err.message ?? labels.resetFailed;
			loading = false;
			return;
		}

		submitted = true;
		try {
			const debugLink = await getDebugLink(email);
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
			<p class="info-kicker">{labels.kicker}</p>
			<Card.Title>{labels.title}</Card.Title>
			<Card.Description>{labels.description}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleSubmit} class="space-y-5">
				<div class="space-y-2">
					<Label for="email">{labels.emailLabel}</Label>
					<Input id="email" type="email" bind:value={email} required />
				</div>
				{#if error}
					<p class="text-sm text-red-500">{error}</p>
				{/if}
				{#if submitted}
					<p class="text-sm text-foreground/80">{labels.success}</p>
				{/if}
				{#if debugUrl}
					<div class="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
						<p class="text-sm text-foreground/80">{labels.debugDescription}</p>
						<a class="inline-flex text-sm text-primary underline" href={debugUrl}
							>{labels.debugLink}</a
						>
					</div>
				{/if}
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? labels.submitting : labels.submit}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center">
			<a href={r('/login')} class="meta-text text-primary underline">{labels.backToLogin}</a>
		</Card.Footer>
	</Card.Root>
</div>
