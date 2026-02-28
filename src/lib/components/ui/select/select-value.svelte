<script lang="ts">
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		placeholder,
		children,
		...restProps
	} = $props<any>();
</script>

<span
	bind:this={ref}
	data-slot="select-value"
	class={cn("flex-1 text-left", className)}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else}
		{placeholder}
	{/if}
</span>