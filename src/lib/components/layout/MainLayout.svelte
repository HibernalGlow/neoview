<script lang="ts">
	/**
	 * NeoView - Main Layout Component
	 * 主布局组件
	 */
	import { sidebarOpen, sidebarWidth } from '$lib/stores';
	import { bookStore } from '$lib/stores/book.svelte';
	import TitleBar from './TitleBar.svelte';
	import StatusBar from './StatusBar.svelte';
	import Sidebar from './Sidebar.svelte';
	import ResizablePanel from '../ui/ResizablePanel.svelte';
	import ImageViewer from '../viewer/ImageViewer.svelte';

	let { children } = $props();

	function handleSidebarResize(width: number) {
		sidebarWidth.set(width);
	}
</script>

<div class="h-screen w-screen flex flex-col bg-background">
	<!-- 标题栏 -->
	<TitleBar />

	<!-- 主内容区域 -->
	<div class="flex-1 flex overflow-hidden">
		<!-- 可调整大小的侧边栏 -->
		{#if $sidebarOpen}
			<ResizablePanel
				minWidth={200}
				maxWidth={600}
				defaultWidth={$sidebarWidth}
				side="left"
				onResize={handleSidebarResize}
			>
				<Sidebar />
			</ResizablePanel>
		{/if}

		<!-- 主显示区域 -->
		<div class="flex-1 overflow-hidden">
			{#if bookStore.viewerOpen}
				<!-- 图片查看器 -->
				<ImageViewer />
			{:else}
				<!-- 默认内容 -->
				{@render children?.()}
			{/if}
		</div>
	</div>

	<!-- 状态栏 -->
	<StatusBar />
</div>
