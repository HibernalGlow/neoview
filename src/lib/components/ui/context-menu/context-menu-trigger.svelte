<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		asChild = false,
		...restProps
	}: ContextMenuPrimitive.TriggerProps = $props();
</script>

<ContextMenuPrimitive.Trigger
	bind:ref
	data-slot="context-menu-trigger"
	{asChild}
	{...restProps}
>
	<slot />
</ContextMenuPrimitive.Trigger>
