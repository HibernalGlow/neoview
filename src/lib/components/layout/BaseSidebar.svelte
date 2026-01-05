<script lang="ts">
	/**
	 * NeoView - Base Sidebar Component
	 * 可复用的侧边栏基础组件 - 支持钉住、拖拽调整、Tab排序
	 */
	import { Pin, PinOff, ExternalLink, GripVertical } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import type { Writable } from 'svelte/store';
	import type { Snippet } from 'svelte';

	interface Tab {
		value: string;
		label: string;
		icon: any;
	}

	interface Props {
		// 位置配置
		position: 'left' | 'right';

		// 状态管理
		isVisible: boolean;
		pinnedStore: Writable<boolean>;
		widthStore: Writable<number>;
		activeTabStore: Writable<string | null>;
		tabs: Tab[];

		// 回调函数
		onResize?: (width: number) => void;
		onTabChange: (value: string) => void;
		onVisibilityChange: (visible: boolean) => void;
		onOpenInNewWindow?: (panel: string) => void;

		// 插槽内容
		children: Snippet;

		// 配置
		minWidth?: number;
		maxWidth?: number;
		defaultWidth?: number;
		storageKey?: string;
	}

	let {
		position,
		isVisible = $bindable(false),
		pinnedStore,
		widthStore,
		activeTabStore,
		tabs = $bindable([]),
		onResize,
		onTabChange,
		onVisibilityChange,
		onOpenInNewWindow,
		children,
		minWidth = 200,
		maxWidth = 600,
		defaultWidth = 250,
		storageKey
	}: Props = $props();

	let isResizing = $state(false);
	let startX = 0;
	let startWidth = 0;
	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let contextMenuVisible = $state(false);
	let contextMenuPosition = $state({ x: 0, y: 0 });
	let selectedTab = $state<Tab | null>(null);

	const isPinned = $derived($pinnedStore);
	const width = $derived($widthStore);
	const activeTab = $derived($activeTabStore || '');

	// 响应钉住状态
	$effect(() => {
		if (isPinned) {
			isVisible = true;
		}
	});

	// 加载 Tab 顺序
	$effect(() => {
		if (!storageKey) return;

		const savedOrder = localStorage.getItem(`${storageKey}-tabs-order`);
		if (savedOrder) {
			try {
				const order = JSON.parse(savedOrder) as string[];
				const orderedTabs = order
					.map((value) => tabs.find((t) => t.value === value))
					.filter(Boolean) as Tab[];
				if (orderedTabs.length === tabs.length) {
					tabs = orderedTabs;
				}
			} catch (e) {
				console.error('Failed to load tab order:', e);
			}
		}
	});

	// 鼠标进入（保留最基础的开启逻辑）
	function handleMouseEnter() {
		isVisible = true;
		if (onVisibilityChange) {
			onVisibilityChange(true);
		}
	}

	// 移除了 handleMouseLeave 和所有的全局定时器判定，交给外层 HoverWrapper 处理

	// 拖拽调整宽度
	function handleResizeStart(e: MouseEvent) {
		isResizing = true;
		startX = e.clientX;
		startWidth = width;

		document.addEventListener('mousemove', handleResizeMove);
		document.addEventListener('mouseup', handleResizeEnd);
		e.preventDefault();
	}

	function handleResizeMove(e: MouseEvent) {
		if (!isResizing) return;

		const deltaX = position === 'left' ? e.clientX - startX : startX - e.clientX;
		const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));

		widthStore.set(newWidth);
		if (onResize) {
			onResize(newWidth);
		}
	}

	function handleResizeEnd() {
		isResizing = false;
		document.removeEventListener('mousemove', handleResizeMove);
		document.removeEventListener('mouseup', handleResizeEnd);
	}

	// 切换钉住
	function togglePin() {
		pinnedStore.update((p) => !p);
	}

	function handlePinContextMenu(e: MouseEvent) {
		e.preventDefault();
		pinnedStore.set(false);
		isVisible = false;
		if (onVisibilityChange) {
			onVisibilityChange(false);
		}
	}

	// 在新窗口中打开
	function openInNewWindow(panel: string) {
		if (onOpenInNewWindow) {
			onOpenInNewWindow(panel);
		}
	}

	// 右键菜单处理
	function handleContextMenu(e: MouseEvent, tab: Tab) {
		e.preventDefault();
		selectedTab = tab;
		contextMenuPosition = { x: e.clientX, y: e.clientY };
		contextMenuVisible = true;
	}

	// 关闭右键菜单
	function closeContextMenu() {
		contextMenuVisible = false;
		selectedTab = null;
	}

	// 在新窗口中打开标签页
	function openTabInNewWindow() {
		if (selectedTab && onOpenInNewWindow) {
			onOpenInNewWindow(`${position}-${selectedTab.value}`);
		}
		closeContextMenu();
	}

	// 全局点击事件监听
	$effect(() => {
		function handleClickOutside() {
			closeContextMenu();
		}

		if (contextMenuVisible) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});

	// Tab 拖拽排序
	function handleDragStart(e: DragEvent, index: number) {
		draggedIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(index));
		}
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		dragOverIndex = index;
	}

	function handleDragEnd() {
		if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
			const newTabs = [...tabs];
			const [draggedItem] = newTabs.splice(draggedIndex, 1);
			newTabs.splice(dragOverIndex, 0, draggedItem);
			tabs = newTabs;

			// 保存到 localStorage
			if (storageKey) {
				localStorage.setItem(`${storageKey}-tabs-order`, JSON.stringify(tabs.map((t) => t.value)));
			}
		}
		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		handleDragEnd();
	}

	// 计算样式
	const triggerClass = $derived(
		position === 'left'
			? 'fixed left-0 top-0 bottom-0 w-[4px] z-50 hover:bg-primary/20 transition-colors'
			: 'fixed right-0 top-0 bottom-0 w-[4px] z-50 hover:bg-primary/20 transition-colors'
	);

	const containerClass = $derived(
		position === 'left'
			? `h-full flex bg-background/80 backdrop-blur-md sidebar-animate ${isVisible ? 'translate-x-0 opacity-100 scale-100' : '-translate-x-full opacity-0 scale-95 pointer-events-none'} border-0`
			: `h-full flex bg-background/80 backdrop-blur-md sidebar-animate ${isVisible ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-full opacity-0 scale-95 pointer-events-none'} border-0`
	);

	const iconBarClass = $derived(
		position === 'left'
			? 'w-12 flex flex-col border-r bg-secondary/30'
			: 'w-12 flex flex-col border-l bg-secondary/30'
	);

	const activeTabBorderClass = $derived(
		position === 'left' ? 'border-l-2 border-primary' : 'border-r-2 border-primary'
	);
</script>

<!-- 鼠标触发区域 -->
{#if !isVisible && !isPinned}
	<div
		class={triggerClass}
		onmouseenter={handleMouseEnter}
		role="presentation"
		aria-label={position === 'left' ? '显示左侧边栏' : '显示右侧边栏'}
	></div>
{/if}

<div
	class={containerClass}
	style="width: {width}px;"
	onmouseenter={handleMouseEnter}
	role="complementary"
>
	{#if position === 'left'}
		<!-- 左侧布局：图标栏 | 内容 | 拖拽条 -->
		<div class={iconBarClass}>
			<!-- 钉住按钮 -->
			<div class="space-y-1 border-b p-1">
				<Button
					variant={isPinned ? 'default' : 'ghost'}
					size="icon"
					class="h-10 w-10"
					onclick={togglePin}
					oncontextmenu={handlePinContextMenu}
					title={isPinned ? '松开侧边栏（自动隐藏）' : '钉住侧边栏（始终显示）'}
				>
					{#if isPinned}
						<Pin class="h-4 w-4" />
					{:else}
						<PinOff class="h-4 w-4" />
					{/if}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="h-10 w-10"
					onclick={() => openInNewWindow(position)}
					title="在独立窗口中打开"
				>
					<ExternalLink class="h-4 w-4" />
				</Button>
			</div>

			<!-- Tab 图标 -->
			{#each tabs as tab, index (tab.value)}
				{@const IconComponent = tab.icon}
				<button
					draggable={true}
					ondragstart={(e) => handleDragStart(e, index)}
					ondragover={(e) => handleDragOver(e, index)}
					ondragend={handleDragEnd}
					ondrop={handleDrop}
					class="hover:bg-accent group relative flex h-14 cursor-move items-center justify-center transition-colors {activeTab ===
					tab.value
						? `bg-accent ${activeTabBorderClass}`
						: ''} {dragOverIndex === index && draggedIndex !== index
						? 'border-t-2 border-blue-500'
						: ''}"
					onclick={() => onTabChange(tab.value)}
					oncontextmenu={(e) => handleContextMenu(e, tab)}
					title={tab.label}
				>
					<div
						class="bg-muted-foreground absolute top-0 bottom-0 left-0 w-1 opacity-0 transition-opacity group-hover:opacity-50"
					></div>
					<IconComponent class="h-5 w-5" />
					<div
						class="bg-popover text-popover-foreground pointer-events-none absolute left-full z-50 ml-2 rounded px-2 py-1 text-sm whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover:opacity-100"
					>
						{tab.label}
					</div>
				</button>
			{/each}
		</div>

		<div class="flex-1 overflow-hidden">
			{#if children}
				{@render children()}
			{/if}
		</div>

		<button
			type="button"
			class="hover:bg-accent text-muted-foreground absolute top-1/2 right-0 z-50 -translate-y-1/2 cursor-ew-resize rounded-l-md p-1 opacity-0 transition-all hover:opacity-100"
			onmousedown={handleResizeStart}
			oncontextmenu={handlePinContextMenu}
			aria-label="调整侧边栏宽度"
		>
			<GripVertical class="h-4 w-4" />
		</button>
	{:else}
		<!-- 右侧布局：拖拽条 | 内容 | 图标栏 -->
		<button
			type="button"
			class="hover:bg-accent text-muted-foreground absolute top-1/2 left-0 z-50 -translate-y-1/2 cursor-ew-resize rounded-r-md p-1 opacity-0 transition-all hover:opacity-100"
			onmousedown={handleResizeStart}
			oncontextmenu={handlePinContextMenu}
			aria-label="调整侧边栏宽度"
		>
			<GripVertical class="h-4 w-4" />
		</button>

		<div class="flex-1 overflow-hidden">
			{#if children}
				{@render children()}
			{/if}
		</div>

		<div class={iconBarClass}>
			<!-- 钉住按钮 -->
			<div class="space-y-1 border-b p-1">
				<Button
					variant={isPinned ? 'default' : 'ghost'}
					size="icon"
					class="h-10 w-10"
					onclick={togglePin}
					oncontextmenu={handlePinContextMenu}
					title={isPinned ? '松开右侧边栏（自动隐藏）' : '钉住右侧边栏（始终显示）'}
				>
					{#if isPinned}
						<Pin class="h-4 w-4" />
					{:else}
						<PinOff class="h-4 w-4" />
					{/if}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="h-10 w-10"
					onclick={() => openInNewWindow(position)}
					title="在独立窗口中打开"
				>
					<ExternalLink class="h-4 w-4" />
				</Button>
			</div>

			<!-- Tab 图标 -->
			{#each tabs as tab, index (tab.value)}
				{@const IconComponent = tab.icon}
				<button
					draggable={true}
					ondragstart={(e) => handleDragStart(e, index)}
					ondragover={(e) => handleDragOver(e, index)}
					ondragend={handleDragEnd}
					ondrop={handleDrop}
					class="hover:bg-accent group relative flex h-14 cursor-move items-center justify-center transition-colors {activeTab ===
					tab.value
						? `bg-accent ${activeTabBorderClass}`
						: ''} {dragOverIndex === index && draggedIndex !== index
						? 'border-t-2 border-blue-500'
						: ''}"
					onclick={() => onTabChange(tab.value)}
					oncontextmenu={(e) => handleContextMenu(e, tab)}
					title={tab.label}
				>
					<div
						class="bg-muted-foreground absolute top-0 right-0 bottom-0 w-1 opacity-0 transition-opacity group-hover:opacity-50"
					></div>
					<IconComponent class="h-5 w-5" />
					<div
						class="bg-popover text-popover-foreground pointer-events-none absolute right-full z-50 mr-2 rounded px-2 py-1 text-sm whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover:opacity-100"
					>
						{tab.label}
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* 侧边栏平滑动画 */
	.sidebar-animate {
		transition:
			transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
			opacity 0.3s ease-out,
			scale 0.3s ease-out;
		transform-origin: left center;
	}

	/* 右侧边栏动画原点 */
	:global([class*='translate-x-full']).sidebar-animate {
		transform-origin: right center;
	}
</style>
