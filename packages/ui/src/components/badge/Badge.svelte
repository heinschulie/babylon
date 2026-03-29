<script lang="ts">
	import { cn } from '@babylon/shared/utils';

	interface BadgeProps {
		variant?: 'default' | 'secondary' | 'outline';
		class?: string;
		children?: import('svelte').Snippet;
	}

	let { variant = 'default', class: className, children, ...props }: BadgeProps = $props();

	const variants = {
		default: 'bg-blue-500 text-white',
		secondary: 'bg-gray-100 text-gray-800',
		outline: 'border border-gray-300 text-gray-700 bg-transparent'
	};
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
		variants[variant],
		className
	)}
	{...props}
>
	{#if children}
		{@render children()}
	{/if}
</span>