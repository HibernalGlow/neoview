<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive, mergeProps } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		children,
		label,
		...restProps
	}: ContextMenuPrimitive.ItemProps & {
		variant?: 'default' | 'destructive';
		label?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<Tooltip.Root delayDuration={400}>
	<Tooltip.Trigger>
		{#snippet child({ props: tooltipProps }: { props: Record<string, unknown> })}
			<ContextMenuPrimitive.Item
				bind:ref
				data-slot="context-menu-item-icon"
				data-variant={variant}
				class={cn(
					"data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:*:[svg]:text-destructive! [&_svg:not([class*='text-'])]:text-muted-foreground relative flex h-10 w-10 cursor-default items-center justify-center rounded-sm text-sm outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
					className
				)}
				{...mergeProps(restProps, tooltipProps)}
			>
				{@render children?.()}
			</ContextMenuPrimitive.Item>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="bottom">
		{label}
	</Tooltip.Content>
</Tooltip.Root>
