<script lang="ts">
	/**
	 * NeoView - Sidebar Component
	 * 侧边栏组件 - 垂直图标风格，支持拖拽排序和自动隐藏
	 */
	import { Folder, History, Bookmark, Info, Image as ImageIcon, List, GripVertical } from '@lucide/svelte';
	import { activePanel, setActivePanel, sidebarWidth } from '$lib/stores';
	import type { PanelType } from '$lib/stores';
	import FileBrowser from '$lib/components/panels/FileBrowser.svelte';
	import HistoryPanel from '$lib/components/panels/HistoryPanel.svelte';
	import BookmarkPanel from '$lib/components/panels/BookmarkPanel.svelte';
	import InfoPanel from '$lib/components/panels/InfoPanel.svelte';

	interface Props {
		onResize?: (width: number) => void;
	}

	let { onResize }: Props = $props();

	let isVisible = $state(false); // 默认隐藏
	let hideTimer: number | null = null;
	let isResizing = $state(false);
	let startX = 0;
	let startWidth = 0;

	let tabs = $state([
		{ value: 'folder', label: '文件夹', icon: Folder },
		{ value: 'history', label: '历史记录', icon: History },
		{ value: 'bookmark', label: '书签', icon: Bookmark },
		{ value: 'thumbnail', label: '缩略图', icon: ImageIcon },
		{ value: 'playlist', label: '播放列表', icon: List },
		{ value: 'info', label: '信息', icon: Info }
	]);

	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

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
			localStorage.setItem('sidebar-tabs-order', JSON.stringify(tabs.map(t => t.value)));
		}
		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		handleDragEnd();
	}

	// 鼠标进入侧边栏区域
	function handleMouseEnter() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		isVisible = true;
	}

	// 鼠标离开侧边栏区域
	function handleMouseLeave() {
		if (!isResizing) {
			hideTimer = setTimeout(() => {
				isVisible = false;
			}, 500) as unknown as number;
		}
	}

	// 拖拽调整宽度
	function handleResizeStart(e: MouseEvent) {
		isResizing = true;
		startX = e.clientX;
		startWidth = $sidebarWidth;
		
		document.addEventListener('mousemove', handleResizeMove);
		document.addEventListener('mouseup', handleResizeEnd);
		e.preventDefault();
	}

	function handleResizeMove(e: MouseEvent) {
		if (!isResizing) return;
		
		const deltaX = e.clientX - startX;
		const newWidth = Math.max(200, Math.min(600, startWidth + deltaX));
		
		if (onResize) {
			onResize(newWidth);
		}
	}

	function handleResizeEnd() {
		isResizing = false;
		document.removeEventListener('mousemove', handleResizeMove);
		document.removeEventListener('mouseup', handleResizeEnd);
	}

	// 从 localStorage 加载排序
	$effect(() => {
		const savedOrder = localStorage.getItem('sidebar-tabs-order');
		if (savedOrder) {
			try {
				const order = JSON.parse(savedOrder) as string[];
				const orderedTabs = order
					.map(value => tabs.find(t => t.value === value))
					.filter(Boolean) as typeof tabs;
				if (orderedTabs.length === tabs.length) {
					tabs = orderedTabs;
				}
			} catch (e) {
				console.error('Failed to load sidebar order:', e);
			}
		}
	});
</script>

<!-- 鼠标触发区域（左侧隐形条） -->
{#if !isVisible}
	<div
		class="fixed left-0 top-0 bottom-0 w-2 z-40"
		onmouseenter={handleMouseEnter}
		role="presentation"
	></div>
{/if}

<div 
	class="h-full flex bg-background transition-transform duration-300 {isVisible ? 'translate-x-0' : '-translate-x-full'}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<!-- 垂直图标标签栏（可拖拽） -->
	<div class="w-12 flex flex-col border-r bg-secondary/30">
		{#each tabs as tab, index (tab.value)}
			{@const IconComponent = tab.icon}
			<button
				draggable={true}
				ondragstart={(e) => handleDragStart(e, index)}
				ondragover={(e) => handleDragOver(e, index)}
				ondragend={handleDragEnd}
				ondrop={handleDrop}
				class="relative group h-14 flex items-center justify-center hover:bg-accent transition-colors cursor-move {$activePanel ===
				tab.value
					? 'bg-accent border-l-2 border-primary'
					: ''} {dragOverIndex === index && draggedIndex !== index
					? 'border-t-2 border-blue-500'
					: ''}"
				onclick={() => setActivePanel(tab.value as PanelType)}
				title={tab.label}
			>
				<!-- 拖拽手柄 -->
				<div class="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-50 bg-muted-foreground transition-opacity"></div>
				
				<IconComponent class="h-5 w-5" />
				
				<!-- 悬停提示 -->
				<div
					class="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-sm rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50"
				>
					{tab.label}
				</div>
			</button>
		{/each}
	</div>

	<!-- 面板内容 -->
	<div class="flex-1 overflow-hidden">
		{#if $activePanel === 'folder'}
			<FileBrowser />
		{:else if $activePanel === 'history'}
			<HistoryPanel />
		{:else if $activePanel === 'bookmark'}
			<BookmarkPanel />
		{:else if $activePanel === 'thumbnail'}
			<div class="p-4">
				<h3 class="text-lg font-semibold mb-2">缩略图</h3>
				<p class="text-sm text-muted-foreground">即将推出...</p>
			</div>
		{:else if $activePanel === 'playlist'}
			<div class="p-4">
				<h3 class="text-lg font-semibold mb-2">播放列表</h3>
				<p class="text-sm text-muted-foreground">即将推出...</p>
			</div>
		{:else if $activePanel === 'info'}
			<InfoPanel />
		{/if}
	</div>

	<!-- 可拖拽的调整条（跟随侧边栏一起隐藏） -->
	<div
		class="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize group {isResizing ? 'bg-primary' : 'hover:bg-primary/50 bg-border'} transition-colors"
		onmousedown={handleResizeStart}
		role="separator"
		aria-label="调整侧边栏宽度"
		tabindex="0"
	></div>
</div>
