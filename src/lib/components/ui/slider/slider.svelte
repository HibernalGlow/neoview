<script lang="ts">
	import { Slider as SliderPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		orientation = "horizontal",
		class: className,
		...restProps
	}: {
		ref?: HTMLElement | null;
		value?: number | number[];
		orientation?: "horizontal" | "vertical";
		class?: string;
		[key: string]: any;
	} = $props();

	// Svelte 5 内部代理状态，处理 bits-ui 必须使用数组的问题
	let proxyValue = $state(Array.isArray(value) ? value : [value ?? 0]);

	// 监听外部 prop 变化同步到内部代理
	$effect(() => {
		const target = Array.isArray(value) ? value : [value ?? 0];
		// 仅在值真正不同时更新，避免死循环
		if (JSON.stringify(proxyValue) !== JSON.stringify(target)) {
			proxyValue = target;
		}
	});

	// 监听内部代理变化同步回外部 prop
	$effect(() => {
		if (Array.isArray(value)) {
			value = proxyValue;
		} else if (typeof value === "number" || value === undefined) {
			if (value !== proxyValue[0]) {
				value = proxyValue[0];
			}
		}
	});
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<SliderPrimitive.Root
	bind:ref
	bind:value={proxyValue as never}
	data-slot="slider"
	type="single"
	{orientation}
	class={cn(
		"relative flex w-full touch-none select-none items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-disabled:opacity-50",
		className
	)}
	{...restProps}
>
	{#snippet children({ thumbs })}
		<span
			data-orientation={orientation}
			data-slot="slider-track"
			class={cn(
				"bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-1.5"
			)}
		>
			<SliderPrimitive.Range
				data-slot="slider-range"
				class={cn(
					"bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
				)}
			/>
		</span>
		{#each thumbs as thumb (thumb)}
			<SliderPrimitive.Thumb
				data-slot="slider-thumb"
				index={thumb}
				class="border-primary bg-background ring-ring/50 focus-visible:outline-hidden block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50"
			/>
		{/each}
	{/snippet}
</SliderPrimitive.Root>
