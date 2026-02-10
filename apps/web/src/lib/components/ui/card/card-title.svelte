<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

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
	class={cn('font-display text-[2rem] uppercase leading-[0.9] tracking-[0.04em] sm:text-[2.2rem]', className)}
	{...restProps}
>
	{@render children?.()}
</div>
