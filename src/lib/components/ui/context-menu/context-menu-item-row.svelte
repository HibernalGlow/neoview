<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		children,
		class: className,
		...restProps
	}: {
		children?: import('svelte').Snippet;
		class?: string;
	} & any = $props();
</script>

<div
	class={cn(
		"flex flex-row items-center justify-between gap-1 p-1",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
