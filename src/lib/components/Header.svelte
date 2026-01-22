<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { authClient } from '$lib/auth-client';
	import { isAuthenticated, user } from '$lib/stores/auth';

	async function handleLogout() {
		await authClient.signOut();
		goto(resolve('/login'));
	}
</script>

<header class="border-b bg-background">
	<div class="container mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
		<a href={resolve('/')} class="text-lg font-semibold">Recall</a>

		{#if $isAuthenticated}
			<nav class="flex items-center gap-4">
				<span class="text-sm text-muted-foreground">{$user?.name ?? $user?.email}</span>
				<a href={resolve('/settings')} class="text-sm hover:underline">Settings</a>
				<Button variant="outline" size="sm" onclick={handleLogout}>Logout</Button>
			</nav>
		{/if}
	</div>
</header>
