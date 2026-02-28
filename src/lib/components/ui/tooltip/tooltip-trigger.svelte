<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";

	let { ref = $bindable(null), ...restProps } = $props<any>();
</script>

<TooltipPrimitive.Trigger bind:ref data-slot="tooltip-trigger" {...restProps} />
