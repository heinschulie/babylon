<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';
	import { cn, type WithElementRef } from '@babylon/shared/utils';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground flex h-10 w-full min-w-0 border-0 border-b-2 border-border rounded-none bg-transparent px-0 pt-2 text-base tracking-[0.01em] transition-[color,border-color] outline-none disabled:cursor-not-allowed disabled:opacity-50',
			'focus-visible:border-b-primary',
			'aria-invalid:border-b-destructive',
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground flex h-10 w-full min-w-0 border-0 border-b-2 border-border rounded-none bg-transparent px-0 py-2 text-base tracking-[0.01em] transition-[color,border-color] outline-none disabled:cursor-not-allowed disabled:opacity-50',
			'focus-visible:border-b-primary',
			'aria-invalid:border-b-destructive',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
