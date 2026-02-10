<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { authClient } from '$lib/auth-client';
	import { isAuthenticated } from '$lib/stores/auth';

	async function handleLogout() {
		await authClient.signOut();
		goto(resolve('/login'));
	}
</script>

<header class="app-header">
	<div class="page-shell page-shell--narrow !py-3 sm:!py-4">
		<div class="app-header__stack">
			<div class="app-header__top">
				<a href={resolve('/')} class="app-header__brand">
					<span class="info-kicker">Rapid Review Desk</span>
					<span class="app-header__title">Recall Verifier</span>
				</a>
			</div>

			{#if $isAuthenticated}
				<div class="app-header__rail">
					<nav class="app-header__nav" aria-label="Primary">
						<a href={resolve('/')} class="app-header__link" data-active={true}>Queue</a>
					</nav>
					<Button variant="outline" size="sm" onclick={handleLogout} class="app-header__action">
						Logout
					</Button>
				</div>
			{/if}
		</div>
	</div>
</header>
