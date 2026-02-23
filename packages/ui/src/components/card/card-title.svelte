<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '@babylon/shared/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card-title"
	class={cn('font-display text-heading uppercase leading-heading tracking-heading sm:text-heading-sm', className)}
	{...restProps}
>
	{@render children?.()}
</div>
