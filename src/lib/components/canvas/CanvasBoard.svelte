<script lang="ts">
	/**
	 * NeoView - Canvas Board Component
	 * 基于 @xyflow/svelte 的画布布局组件
	 * 支持拖拽布局的电视墙模式
	 */
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		type Node,
		type Edge
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import ImageNode from './nodes/ImageNode.svelte';
	import SidebarNode from './nodes/SidebarNode.svelte';
	import RightSidebarNode from './nodes/RightSidebarNode.svelte';
	import TopToolbarNode from './nodes/TopToolbarNode.svelte';
	import BottomThumbnailBarNode from './nodes/BottomThumbnailBarNode.svelte';
	import NewReaderNode from './nodes/NewReaderNode.svelte';
	import PipelineDebugNode from './nodes/PipelineDebugNode.svelte';

	// 注册自定义节点类型
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const nodeTypes: Record<string, any> = {
		imageNode: ImageNode,
		sidebarNode: SidebarNode,
		rightSidebarNode: RightSidebarNode,
		topToolbarNode: TopToolbarNode,
		bottomThumbnailBarNode: BottomThumbnailBarNode,
		newReaderNode: NewReaderNode,
		pipelineDebugNode: PipelineDebugNode
	};

	// 初始节点：包含主图片查看器和各个侧边栏
	let nodes = $state<Node[]>([
		{
			id: 'main-viewer',
			type: 'imageNode',
			position: { x: 400, y: 100 },
			data: { label: 'Main Viewer' },
			dragHandle: '.drag-handle',
			width: 800,
			height: 600
		},
		{
			id: 'left-sidebar',
			type: 'sidebarNode',
			position: { x: 50, y: 100 },
			data: { label: 'Left Sidebar' },
			dragHandle: '.drag-handle'
		},
		{
			id: 'right-sidebar',
			type: 'rightSidebarNode',
			position: { x: 1250, y: 100 },
			data: { label: 'Right Sidebar' },
			dragHandle: '.drag-handle'
		},
		{
			id: 'top-toolbar',
			type: 'topToolbarNode',
			position: { x: 400, y: 20 },
			data: { label: 'Top Toolbar' },
			dragHandle: '.drag-handle'
		},
		{
			id: 'bottom-bar',
			type: 'bottomThumbnailBarNode',
			position: { x: 400, y: 750 },
			data: { label: 'Bottom Bar' },
			dragHandle: '.drag-handle'
		},
		{
			id: 'new-reader',
			type: 'newReaderNode',
			position: { x: 1300, y: 100 },
			data: { label: 'New Reader' },
			dragHandle: '.drag-handle',
			width: 700,
			height: 500
		},
		{
			id: 'pipeline-debug',
			type: 'pipelineDebugNode',
			position: { x: 1300, y: 650 },
			data: { label: 'Pipeline Debug' },
			dragHandle: '.drag-handle'
		}
	]);

	let edges = $state<Edge[]>([]);

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		// 示例：处理拖拽放置逻辑
	}
</script>

<div class="canvas-wrapper h-full w-full bg-background">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		fitView
		class="bg-background"
		minZoom={0.1}
		maxZoom={4}
	>
		<Controls />
		<Background variant={BackgroundVariant.Dots} gap={12} size={1} />
		<MiniMap />
	</SvelteFlow>
</div>

<style>
	.canvas-wrapper {
		width: 100vw;
		height: 100vh;
	}
</style>
