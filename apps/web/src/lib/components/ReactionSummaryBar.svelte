<script>
	let { reactionData = [] } = $props();

	const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4'];

	let totalCount = $derived(reactionData.reduce((sum, reaction) => sum + reaction.count, 0));
</script>

{#if totalCount > 0}
	<div class="reaction-summary-bar">
		{#each reactionData as reaction, index (reaction.emoji)}
			<div
				data-testid="reaction-segment"
				class="segment"
				style="width: {totalCount > 0 ? (reaction.count / totalCount * 100) : 0}%; background-color: {colors[index % colors.length]}"
				title="{reaction.emoji} {reaction.count}"
			>
				{reaction.emoji}: {reaction.count}
			</div>
		{/each}
	</div>
{/if}

<style>
	.reaction-summary-bar {
		display: flex;
		height: 8px;
		background-color: #f0f0f0;
		border-radius: 4px;
		overflow: hidden;
	}

	.segment {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
	}
</style>