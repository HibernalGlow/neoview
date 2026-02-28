<script lang="ts">
	/**
	 * Panel Context Menu Component
	 * 侧边栏面板右键菜单组件 - 可复用，支持 z-index 和悬停不消失
	 */
	import { onMount } from 'svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu';

	export type MenuItem = {
		label: string;
		action: () => void;
		icon?: any;
		disabled?: boolean;
		separator?: boolean;
		quickAction?: boolean;
	};

	let {
		items = [],
		zIndex = 10000,
		children,
		customItems,
		position = 'trigger' // 'trigger' | 'mouse'
	}: {
		items?: MenuItem[];
		zIndex?: number;
		children?: import('svelte').Snippet;
		customItems?: import('svelte').Snippet;
		position?: 'trigger' | 'mouse';
	} = $props();

	let quickActions = $derived(items.filter(item => item.quickAction && !item.separator));
	let regularItems = $derived(items.filter(item => !item.quickAction));

	let open = $state(false);
	let contextMenuElement: HTMLElement | null = $state(null);
	let mousePosition = $state<{ x: number; y: number } | null>(null);

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (position === 'mouse') {
			mousePosition = { x: e.clientX, y: e.clientY };
		}
		open = true;
	}

	function handleItemClick(item: MenuItem) {
		if (item.disabled) return;
		item.action();
		open = false;
	}

	function handleOpenChange(newOpen: boolean) {
		open = newOpen;
	}

	// 监听外部点击关闭菜单（悬停时不消失）
	onMount(() => {
		function handleClickOutside(e: MouseEvent) {
			if (contextMenuElement && !contextMenuElement.contains(e.target as Node) && open) {
				// 延迟关闭，允许菜单内部点击
				setTimeout(() => {
					if (open && contextMenuElement && !contextMenuElement.contains(e.target as Node)) {
						open = false;
					}
				}, 100);
			}
		}

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	});
</script>

<div
	oncontextmenu={handleContextMenu}
	class="w-full h-full"
	style="pointer-events: auto;"
	role="region"
	aria-label="面板内容区域"
>
	{#if children}
		{@render children()}
	{/if}
</div>

<ContextMenu.Root open={open} onOpenChange={handleOpenChange}>
	<ContextMenu.Trigger />
	<ContextMenu.Content
		bind:ref={contextMenuElement}
		class="min-w-45"
		style="z-index: {zIndex}; {position === 'mouse' && mousePosition ? `position: fixed; left: ${mousePosition.x}px; top: ${mousePosition.y}px;` : ''}"
	>
		{#if quickActions.length > 0}
			<ContextMenu.ItemRow>
				{#each quickActions as item (item.label)}
					<ContextMenu.ItemIcon
						label={item.label}
						disabled={item.disabled}
						onclick={() => handleItemClick(item)}
					>
						{#if item.icon}
							{@const IconComponent = item.icon}
							<IconComponent />
						{/if}
					</ContextMenu.ItemIcon>
				{/each}
			</ContextMenu.ItemRow>
			<ContextMenu.Separator />
		{/if}

		{#each regularItems as item (item.label)}
			{#if item.separator}
				<ContextMenu.Separator />
			{:else}
				<ContextMenu.Item
					disabled={item.disabled}
					onclick={() => handleItemClick(item)}
					class="cursor-pointer"
				>
					{#if item.icon}
						{@const IconComponent = item.icon}
						<IconComponent class="w-4 h-4 mr-2" />
					{/if}
					{item.label}
				</ContextMenu.Item>
			{/if}
		{/each}
		{#if customItems}
			{@render customItems()}
		{/if}
	</ContextMenu.Content>
</ContextMenu.Root>

