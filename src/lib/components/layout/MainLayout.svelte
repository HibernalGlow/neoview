<script lang="ts">
	/**
	 * NeoView - Main Layout Component
	 * 主布局组件
	 */
	import { sidebarOpen, sidebarWidth } from '$lib/stores';
	import TitleBar from './TitleBar.svelte';
	import StatusBar from './StatusBar.svelte';
	import Sidebar from './Sidebar.svelte';
	import ResizablePanel from '../ui/ResizablePanel.svelte';

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
			{@render children?.()}
		</div>
	</div>

	<!-- 状态栏 -->
	<StatusBar />
</div>
