<script lang="ts">
	import * as Card from '@babylon/ui/card';
	import { Badge } from '@babylon/ui';
	import * as m from '$lib/paraglide/messages.js';
	import { formatRelativeTime } from '$lib/format';

	interface Achievement {
		_id: string;
		type: string;
		title: string;
		userId: string;
		unlockedAt: number;
	}

	let { achievement }: { achievement: Achievement } = $props();

	// Map achievement types to emoji icons
	const achievementIcons: Record<string, string> = {
		emoji_starter: '🌟',
		emoji_pro: '🏆',
		democracy: '🗳️',
		social_butterfly: '🦋',
		poll_creator: '📊',
	};
</script>

<Card.Root class="p-4">
	<div class="flex items-center gap-3">
		<div class="text-3xl" aria-hidden="true">
			{achievementIcons[achievement.type] || '🏅'}
		</div>
		<div class="flex-1">
			<h3 class="font-semibold text-lg">{achievement.title}</h3>
			<p class="text-sm text-gray-600">
				{formatRelativeTime(achievement.unlockedAt)}
			</p>
		</div>
		<Badge variant="secondary" class="ml-auto">
			{achievement.type}
		</Badge>
	</div>
</Card.Root>