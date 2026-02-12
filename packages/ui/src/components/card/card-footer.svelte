<script lang="ts">
	import { cn, type WithElementRef } from '@babylon/shared/utils';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card-footer"
	class={cn('flex items-center px-5 sm:px-6 [.border-t]:pt-6', className)}
	{...restProps}
>
	{@render children?.()}
</div>
