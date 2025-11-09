<script lang="ts">
	/**
	 * NeoView - Main Layout Component
	 * 主布局组件 - 集成自动隐藏功能
	 */
	import { sidebarOpen, sidebarWidth, rightSidebarOpen, rightSidebarWidth } from '$lib/stores';
	import { sidebars, setPanelSidebarSize, leftPanels, rightPanels, bottomPanels, activePanel } from '$lib/stores/panels.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import TitleBar from './TitleBar.svelte';
	import StatusBar from './StatusBar.svelte';
	import Sidebar from './Sidebar.svelte';
	import RightSidebar from './RightSidebar.svelte';
	import AutoHideTopbar from './AutoHideTopbar.svelte';
	import AutoHideThumbnailBar from './AutoHideThumbnailBar.svelte';
	import ResizablePanel from '../ui/ResizablePanel.svelte';
	import ImageViewer from '../viewer/ImageViewer.svelte';

	let { children } = $props();

	function handleSidebarResize(width: number) {
		sidebarWidth.set(width);
	}

	function handleRightSidebarResize(width: number) {
		rightSidebarWidth.set(width);
	}
</script>

<div class="h-screen w-screen flex flex-col bg-background">
	<!-- 标题栏 -->
	<TitleBar />

	<!-- 主内容区域 -->
	<div class="flex-1 relative overflow-hidden">
		<!-- 主显示区域（全屏） -->
		<div class="absolute inset-0 overflow-hidden">
			{#if bookStore.viewerOpen}
				<!-- 自动隐藏顶部工具栏（面包屑 + 图片操作） -->
				<AutoHideTopbar />
				
				<!-- 图片查看器 -->
				<ImageViewer />
				
				<!-- 自动隐藏底部缩略图栏 -->
				<AutoHideThumbnailBar />
			{:else}
				<!-- 默认内容 -->
				{@render children?.()}
			{/if}
		</div>

		<!-- 左侧边栏（悬浮） -->
		{#if $sidebarOpen}
			<div class="absolute left-0 top-0 bottom-0 z-40" style="width: {$sidebarWidth}px;">
				<ResizablePanel
					minWidth={200}
					maxWidth={600}
					defaultWidth={$sidebarWidth}
					side="left"
					onResize={handleSidebarResize}
				>
					<Sidebar />
				</ResizablePanel>
			</div>
		{/if}

		<!-- 右侧边栏（悬浮） -->
		{#if $rightSidebarOpen}
			<div class="absolute right-0 top-0 bottom-0 z-40" style="width: {$rightSidebarWidth}px;">
				<ResizablePanel
					minWidth={200}
					maxWidth={600}
					defaultWidth={$rightSidebarWidth}
					side="right"
					onResize={handleRightSidebarResize}
				>
					<RightSidebar />
				</ResizablePanel>
			</div>
		{/if}
	</div>

	<!-- 状态栏 -->
	<StatusBar />
</div>
