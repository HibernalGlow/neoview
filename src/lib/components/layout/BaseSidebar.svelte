<script lang="ts">
	/**
	 * NeoView - Base Sidebar Component
	 * 可复用的侧边栏基础组件 - 支持自动隐藏、钉住、拖拽调整、Tab排序
	 */
	import { Pin, PinOff } from '@lucide/svelte';
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
		children,
		minWidth = 200,
		maxWidth = 600,
		defaultWidth = 250,
		storageKey
	}: Props = $props();

	let hideTimer: number | null = null;
	let isResizing = $state(false);
	let startX = 0;
	let startWidth = 0;
	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	const isPinned = $derived($pinnedStore);
	const width = $derived($widthStore);
	const activeTab = $derived($activeTabStore || '');

	// 响应钉住状态
	$effect(() => {
		if (isPinned) {
			isVisible = true;
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
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
					.map(value => tabs.find(t => t.value === value))
					.filter(Boolean) as Tab[];
				if (orderedTabs.length === tabs.length) {
					tabs = orderedTabs;
				}
			} catch (e) {
				console.error('Failed to load tab order:', e);
			}
		}
	});

	// 鼠标进入
	function handleMouseEnter() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		isVisible = true;
		if (onVisibilityChange) {
			onVisibilityChange(true);
		}
	}

	// 鼠标离开
	function handleMouseLeave() {
		if (!isResizing && !isPinned) {
			hideTimer = setTimeout(() => {
				isVisible = false;
				if (onVisibilityChange) {
					onVisibilityChange(false);
				}
			}, 500) as unknown as number;
		}
	}

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
		
		const deltaX = position === 'left' 
			? e.clientX - startX 
			: startX - e.clientX;
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
		pinnedStore.update(p => !p);
	}

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
				localStorage.setItem(
					`${storageKey}-tabs-order`,
					JSON.stringify(tabs.map(t => t.value))
				);
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
			? `h-full flex bg-background transition-transform duration-300 ${isVisible ? 'translate-x-0' : '-translate-x-full'}`
			: `h-full flex bg-background transition-transform duration-300 ${isVisible ? 'translate-x-0' : 'translate-x-full'}`
	);

	const resizeHandleClass = $derived(
		position === 'left'
			? `absolute top-0 bottom-0 right-0 w-1 cursor-col-resize group ${isResizing ? 'bg-primary' : 'hover:bg-primary/50 bg-border'} transition-colors`
			: `absolute top-0 bottom-0 left-0 w-1 cursor-col-resize group ${isResizing ? 'bg-primary' : 'hover:bg-primary/50 bg-border'} transition-colors`
	);

	const iconBarClass = $derived(
		position === 'left'
			? 'w-12 flex flex-col border-r bg-secondary/30'
			: 'w-12 flex flex-col border-l bg-secondary/30'
	);

	const activeTabBorderClass = $derived(
		position === 'left'
			? 'border-l-2 border-primary'
			: 'border-r-2 border-primary'
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
	onmouseleave={handleMouseLeave}
	role="complementary"
>
	{#if position === 'left'}
		<!-- 左侧布局：图标栏 | 内容 | 拖拽条 -->
		<div class={iconBarClass}>
			<!-- 钉住按钮 -->
			<div class="p-1 border-b">
				<Button
					variant={isPinned ? 'default' : 'ghost'}
					size="icon"
					class="h-10 w-10"
					onclick={togglePin}
					title={isPinned ? '松开侧边栏（自动隐藏）' : '钉住侧边栏（始终显示）'}
				>
					{#if isPinned}
						<Pin class="h-4 w-4" />
					{:else}
						<PinOff class="h-4 w-4" />
					{/if}
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
					class="relative group h-14 flex items-center justify-center hover:bg-accent transition-colors cursor-move {activeTab === tab.value ? `bg-accent ${activeTabBorderClass}` : ''} {dragOverIndex === index && draggedIndex !== index ? 'border-t-2 border-blue-500' : ''}"
					onclick={() => onTabChange(tab.value)}
					title={tab.label}
				>
					<div class="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-50 bg-muted-foreground transition-opacity"></div>
					<IconComponent class="h-5 w-5" />
					<div class="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-sm rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
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

		<div
			class={resizeHandleClass}
			onmousedown={handleResizeStart}
			role="separator"
			aria-label="调整侧边栏宽度"
		></div>
	{:else}
		<!-- 右侧布局：拖拽条 | 内容 | 图标栏 -->
		<div
			class={resizeHandleClass}
			onmousedown={handleResizeStart}
			role="separator"
			aria-label="调整侧边栏宽度"
		></div>

		<div class="flex-1 overflow-hidden">
			{#if children}
				{@render children()}
			{/if}
		</div>

		<div class={iconBarClass}>
			<!-- 钉住按钮 -->
			<div class="p-1 border-b">
				<Button
					variant={isPinned ? 'default' : 'ghost'}
					size="icon"
					class="h-10 w-10"
					onclick={togglePin}
					title={isPinned ? '松开右侧边栏（自动隐藏）' : '钉住右侧边栏（始终显示）'}
				>
					{#if isPinned}
						<Pin class="h-4 w-4" />
					{:else}
						<PinOff class="h-4 w-4" />
					{/if}
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
					class="relative group h-14 flex items-center justify-center hover:bg-accent transition-colors cursor-move {activeTab === tab.value ? `bg-accent ${activeTabBorderClass}` : ''} {dragOverIndex === index && draggedIndex !== index ? 'border-t-2 border-blue-500' : ''}"
					onclick={() => onTabChange(tab.value)}
					title={tab.label}
				>
					<div class="absolute right-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-50 bg-muted-foreground transition-opacity"></div>
					<IconComponent class="h-5 w-5" />
					<div class="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-sm rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
						{tab.label}
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
