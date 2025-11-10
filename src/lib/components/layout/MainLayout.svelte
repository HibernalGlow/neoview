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
	import AreaOverlay from '../ui/AreaOverlay.svelte';

	let { children } = $props();

	function handleSidebarResize(width: number) {
		sidebarWidth.set(width);
	}

	function handleRightSidebarResize(width: number) {
		rightSidebarWidth.set(width);
	}

	// 左侧边栏拖拽调整大小
	let isResizingLeft = $state(false);
	let startLeftX = 0;
	let startLeftWidth = 0;

	// 右侧边栏拖拽调整大小
	let isResizingRight = $state(false);
	let startRightX = 0;
	let startRightWidth = 0;

	// 区域覆盖层状态
	let showAreaOverlay = $state(false);

	function handleLeftResizeStart(e: MouseEvent) {
		isResizingLeft = true;
		startLeftX = e.clientX;
		startLeftWidth = $sidebarWidth;
		e.preventDefault();
	}

	function handleLeftResizeMove(e: MouseEvent) {
		if (!isResizingLeft) return;

		const delta = e.clientX - startLeftX;
		const newWidth = Math.max(200, Math.min(600, startLeftWidth + delta));
		
		sidebarWidth.set(newWidth);
		handleSidebarResize(newWidth);
	}

	function handleLeftResizeEnd() {
		isResizingLeft = false;
	}

	function handleRightResizeStart(e: MouseEvent) {
		isResizingRight = true;
		startRightX = e.clientX;
		startRightWidth = $rightSidebarWidth;
		e.preventDefault();
	}

	function handleRightResizeMove(e: MouseEvent) {
		if (!isResizingRight) return;

		const delta = startRightX - e.clientX; // 右侧边栏，向左拖拽时delta为正（增加宽度）
		const newWidth = Math.max(200, Math.min(600, startRightWidth + delta));
		
		rightSidebarWidth.set(newWidth);
		handleRightSidebarResize(newWidth);
	}

	function handleRightResizeEnd() {
		isResizingRight = false;
	}

	// 监听区域覆盖层切换事件
	$effect(() => {
		const handleAreaOverlayToggle = (e: CustomEvent) => {
			showAreaOverlay = e.detail.show;
		};

		window.addEventListener('areaOverlayToggle', handleAreaOverlayToggle as EventListener);
		return () => {
			window.removeEventListener('areaOverlayToggle', handleAreaOverlayToggle as EventListener);
		};
	});

	// 处理区域操作事件
	function handleAreaAction(e: CustomEvent) {
		const { action } = e.detail;
		console.log('执行区域操作:', action);
		
		// 这里可以根据action执行相应的操作
		// 例如：翻页、缩放等
		switch (action) {
			case 'nextPage':
				bookStore.nextPage();
				break;
			case 'prevPage':
				bookStore.prevPage();
				break;
			case 'zoomIn':
				bookStore.zoomIn();
				break;
			case 'zoomOut':
				bookStore.zoomOut();
				break;
			// 其他操作...
		}
	}

	// 全局鼠标事件
	$effect(() => {
		document.addEventListener('mousemove', handleRightResizeMove);
		document.addEventListener('mousemove', handleLeftResizeMove);
		document.addEventListener('mouseup', handleRightResizeEnd);
		document.addEventListener('mouseup', handleLeftResizeEnd);

		return () => {
			document.removeEventListener('mousemove', handleRightResizeMove);
			document.removeEventListener('mousemove', handleLeftResizeMove);
			document.removeEventListener('mouseup', handleRightResizeEnd);
			document.removeEventListener('mouseup', handleLeftResizeEnd);
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
	<div class="absolute left-0 top-0 bottom-0 z-[55] {$sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}">
		<!-- 只在图标栏区域（约48px宽）响应悬停 -->
		<div class="absolute left-0 top-0 bottom-0 w-12 pointer-events-auto">
			<Sidebar onResize={handleSidebarResize} bind:isVisible={$sidebarOpen} />
		</div>
	</div>

	<!-- 左侧边栏拖拽区域 - 独立层 -->
	{#if $sidebarOpen}
		<div
			class="absolute top-0 bottom-0 z-[45] cursor-col-resize"
			style="left: {$sidebarWidth}px; width: 8px;"
			onmousedown={handleLeftResizeStart}
		></div>
	{/if}

	<!-- 右侧边栏（悬浮，始终可用） -->
	<div class="absolute right-0 top-0 bottom-0 z-[55] pointer-events-none">
		<!-- 只在图标栏区域（约48px宽）响应悬停 -->
		<div class="absolute right-0 top-0 bottom-0 w-12 pointer-events-auto">
			<RightSidebar onResize={handleRightSidebarResize} bind:isVisible={$rightSidebarOpen} />
		</div>
	</div>

	<!-- 右侧边栏拖拽区域 - 独立层 -->
	{#if $rightSidebarOpen}
		<div
			class="absolute top-0 bottom-0 z-[45] cursor-col-resize"
			style="right: {$rightSidebarWidth}px; width: 8px;"
			onmousedown={handleRightResizeStart}
		></div>
	{/if}

	<!-- 区域覆盖层 -->
	<AreaOverlay 
		bind:show={showAreaOverlay} 
		onareaAction={handleAreaAction} 
		sidebarOpen={$sidebarOpen}
		rightSidebarOpen={$rightSidebarOpen}
	/>
</div>
