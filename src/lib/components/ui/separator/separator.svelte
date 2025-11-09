<script lang="ts">
	import { Separator as SeparatorPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		orientation = "horizontal",
		decorative = true,
		...restProps
	}: WithoutChildrenOrChild<SeparatorPrimitive.RootProps> = $props();
</script>

<SeparatorPrimitive.Root
	bind:ref
	{orientation}
	{decorative}
	class={cn(
		"shrink-0 bg-border",
		orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
		className
	)}
	{...restProps}
/>
