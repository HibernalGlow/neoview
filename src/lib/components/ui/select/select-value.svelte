<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn, type WithoutChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		placeholder,
		children,
		...restProps
	}: WithoutChild<SelectPrimitive.ValueProps> = $props();
</script>

<SelectPrimitive.Value
	bind:ref
	data-slot="select-value"
	class={cn("flex-1 text-left", className)}
	{placeholder}
	{...restProps}
>
	{@render children?.()}
</SelectPrimitive.Value>