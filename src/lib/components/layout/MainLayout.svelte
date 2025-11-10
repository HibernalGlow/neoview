<script lang="ts">
	/**
	 * NeoView - Main Layout Component
	 * 主布局组件 - 集成自动隐藏功能
	 */
	import { sidebarOpen, sidebarWidth, rightSidebarOpen, rightSidebarWidth } from '$lib/stores';
	import { sidebars, setPanelSidebarSize, leftPanels, rightPanels, bottomPanels, activePanel } from '$lib/stores/panels.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import Sidebar from './Sidebar.svelte';
	import RightSidebar from './RightSidebar.svelte';
	import TopToolbar from './TopToolbar.svelte';
	import BottomThumbnailBar from './BottomThumbnailBar.svelte';
	import ImageViewer from '../viewer/ImageViewer.svelte';

	let { children } = $props();

	function handleSidebarResize(width: number) {
		sidebarWidth.set(width);
	}

	function handleRightSidebarResize(width: number) {
		rightSidebarWidth.set(width);
	}

	// 右侧边栏拖拽调整大小
	let isResizingRight = $state(false);
	let startRightX = 0;
	let startRightWidth = 0;

	function handleRightResizeStart(e: MouseEvent) {
		console.log('[MainLayout] Right resize start', e.clientX, $rightSidebarWidth);
		isResizingRight = true;
		startRightX = e.clientX;
		startRightWidth = $rightSidebarWidth;
		e.preventDefault();
	}

	function handleRightResizeMove(e: MouseEvent) {
		if (!isResizingRight) return;

		const delta = startRightX - e.clientX;
		const newWidth = Math.max(200, Math.min(600, startRightWidth + delta));
		
		console.log('[MainLayout] Right resize move', { 
			clientX: e.clientX, 
			startRightX, 
			delta, 
			startRightWidth, 
			newWidth 
		});
		
		rightSidebarWidth.set(newWidth);
		handleRightSidebarResize(newWidth);
	}

	function handleRightResizeEnd() {
		console.log('[MainLayout] Right resize end, was resizing:', isResizingRight);
		isResizingRight = false;
	}

	// 全局鼠标事件
	$effect(() => {
		document.addEventListener('mousemove', handleRightResizeMove);
		document.addEventListener('mouseup', handleRightResizeEnd);

		return () => {
			document.removeEventListener('mousemove', handleRightResizeMove);
			document.removeEventListener('mouseup', handleRightResizeEnd);
		};
	});
</script>

<div class="h-screen w-screen relative bg-background">
	<!-- 自动隐藏顶部工具栏（包含标题栏） -->
	<TopToolbar />

	<!-- 主内容区域（全屏） -->
	<div class="absolute inset-0 overflow-hidden">
		{#if bookStore.viewerOpen}
			<!-- 图片查看器 -->
			<ImageViewer />
		{:else}
			<!-- 默认内容 -->
			{@render children?.()}
		{/if}
	</div>

	<!-- 自动隐藏底部缩略图栏 -->
	<BottomThumbnailBar />

	<!-- 左侧边栏（悬浮，始终可用） -->
	<div class="absolute left-0 top-0 bottom-0 z-40 pointer-events-none">
		<div class="h-full pointer-events-auto">
			<Sidebar onResize={handleSidebarResize} bind:isVisible={$sidebarOpen} />
		</div>
	</div>

	<!-- 右侧边栏（悬浮，始终可用） -->
	<div class="absolute right-0 top-0 bottom-0 z-40 pointer-events-none">
		<div class="h-full pointer-events-auto">
			<RightSidebar onResize={handleRightSidebarResize} bind:isVisible={$rightSidebarOpen} />
		</div>
	</div>

	<!-- 右侧边栏拖拽区域 - 独立层 -->
	{#if $rightSidebarOpen}
		<div
			class="absolute top-0 bottom-0 z-[70] cursor-col-resize"
			style="right: {$rightSidebarWidth}px; width: 8px; background: rgba(59, 130, 246, 0.3); border-left: 2px solid red;"
			onmousedown={handleRightResizeStart}
			onmouseenter={() => console.log('[MainLayout] Mouse entered right resize handle')}
			onmouseleave={() => console.log('[MainLayout] Mouse left right resize handle')}
		></div>
	{/if}
</div>
