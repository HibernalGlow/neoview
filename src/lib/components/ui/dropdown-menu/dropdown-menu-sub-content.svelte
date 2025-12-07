<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { settingsManager } from '$lib/settings/settingsManager';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: DropdownMenuPrimitive.SubContentProps = $props();

	let sidebarOpacity = $state(settingsManager.getSettings().panels.sidebarOpacity);
	let sidebarBlur = $state(settingsManager.getSettings().panels.sidebarBlur ?? 12);

	$effect(() => {
		const unsubscribe = settingsManager.addListener((s) => {
			sidebarOpacity = s.panels.sidebarOpacity;
			sidebarBlur = s.panels.sidebarBlur ?? 12;
		});
		return unsubscribe;
	});
</script>

<DropdownMenuPrimitive.SubContent
	bind:ref
	data-slot="dropdown-menu-sub-content"
	class={cn(
		'text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--bits-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg',
		className
	)}
	style="background-color: color-mix(in oklch, var(--popover) {sidebarOpacity}%, transparent); backdrop-filter: blur({sidebarBlur}px);"
	{...restProps}
/>
