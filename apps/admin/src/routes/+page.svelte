<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';
	import * as m from '$lib/paraglide/messages.js';

	const adminState = useQuery(api.admin.getMyAdminState, () => ($isAuthenticated ? {} : 'skip'));

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	const isAdmin = $derived(adminState.data?.isAdmin ?? false);
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header class="page-stack">
		<div>
			<p class="info-kicker">{m.admin_home_kicker()}</p>
			<h1 class="text-5xl sm:text-6xl">{m.admin_home_title()}</h1>
			<p class="meta-text mt-3 max-w-2xl">
				{m.admin_home_desc()}
			</p>
		</div>
	</header>

	{#if adminState.isLoading}
		<p class="meta-text">{m.state_loading()}</p>
	{:else if !isAdmin}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.admin_not_admin_title()}</Card.Title>
				<Card.Description>{m.admin_not_admin_body()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2">
			<a href={resolve('/curriculum')} class="block">
				<Card.Root class="h-full border border-border/60 bg-background/85 backdrop-blur-sm">
					<Card.Header>
						<Card.Title>{m.admin_curriculum_title()}</Card.Title>
						<Card.Description>{m.admin_curriculum_desc()}</Card.Description>
					</Card.Header>
				</Card.Root>
			</a>
			<a href={resolve('/admins')} class="block">
				<Card.Root class="h-full border border-border/60 bg-background/85 backdrop-blur-sm">
					<Card.Header>
						<Card.Title>{m.admin_admins_title()}</Card.Title>
						<Card.Description>{m.admin_admins_desc()}</Card.Description>
					</Card.Header>
				</Card.Root>
			</a>
		</div>
	{/if}
</div>
