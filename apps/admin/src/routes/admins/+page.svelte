<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { isAuthenticated, isLoading, user } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';
	import { Button } from '@babylon/ui/button';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import { Badge } from '@babylon/ui';
	import * as m from '$lib/paraglide/messages.js';

	const client = useConvexClient();

	const adminState = useQuery(api.admin.getMyAdminState, () => ($isAuthenticated ? {} : 'skip'));
	const isAdmin = $derived(adminState.data?.isAdmin ?? false);

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	const admins = useQuery(api.admin.listAdmins, () => (isAdmin ? {} : 'skip'));
	const myUserId = $derived($user?.id ?? null);

	let grantUserId = $state('');
	let granting = $state(false);
	let grantError = $state('');

	async function grant() {
		if (!grantUserId.trim() || granting) return;
		granting = true;
		grantError = '';
		try {
			await client.mutation(api.admin.grantAdmin, { userId: grantUserId.trim() });
			grantUserId = '';
		} catch (error) {
			grantError = error instanceof Error ? error.message : String(error);
		} finally {
			granting = false;
		}
	}

	let revokingId = $state('');
	let revokeError = $state('');

	async function revoke(userId: string) {
		if (revokingId) return;
		revokingId = userId;
		revokeError = '';
		try {
			await client.mutation(api.admin.revokeAdmin, { userId });
		} catch (error) {
			revokeError = error instanceof Error ? error.message : String(error);
		} finally {
			revokingId = '';
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header>
		<p class="info-kicker">{m.admin_home_kicker()}</p>
		<h1 class="text-5xl sm:text-6xl">{m.admin_admins_title()}</h1>
		<p class="meta-text mt-3 max-w-2xl">{m.admin_admins_desc()}</p>
	</header>

	{#if adminState.isLoading || $isLoading}
		<p class="meta-text">{m.state_loading()}</p>
	{:else if !isAdmin}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.admin_not_admin_title()}</Card.Title>
				<Card.Description>{m.admin_not_admin_body()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.admins_list_title()}</Card.Title>
				<Card.Description>{m.admins_list_desc()}</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#if admins.isLoading}
					<p class="meta-text">{m.state_loading()}</p>
				{:else if (admins.data ?? []).length === 0}
					<p class="meta-text">{m.admins_none()}</p>
				{:else}
					<ul class="space-y-2">
						{#each admins.data ?? [] as admin (admin.userId)}
							<li
								class="flex flex-wrap items-center justify-between gap-2 border border-border/60 px-3 py-2.5"
							>
								<div class="min-w-0">
									<p class="truncate font-mono text-sm">
										{admin.userId}
										{#if admin.userId === myUserId}
											<Badge variant="secondary">{m.admins_you()}</Badge>
										{/if}
									</p>
									<p class="meta-text">
										{m.admins_granted_by({ userId: admin.grantedBy })} ·
										{new Date(admin.createdAt).toLocaleDateString()}
									</p>
								</div>
								{#if admin.userId !== myUserId}
									<Button
										size="sm"
										variant="destructive"
										onclick={() => revoke(admin.userId)}
										disabled={!!revokingId}
									>
										{m.admins_revoke_btn()}
									</Button>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				{#if revokeError}
					<p class="text-sm text-destructive">{revokeError}</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.admins_grant_title()}</Card.Title>
				<Card.Description>{m.admins_grant_desc()}</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="grant-user-id">{m.admins_user_id_label()}</Label>
					<Input id="grant-user-id" bind:value={grantUserId} />
				</div>
				{#if grantError}
					<p class="text-sm text-destructive">{grantError}</p>
				{/if}
				<Button onclick={grant} disabled={granting || !grantUserId.trim()}>
					{granting ? m.admins_granting() : m.admins_grant_btn()}
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
