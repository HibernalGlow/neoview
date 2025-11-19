<script lang="ts">
	import { writable } from 'svelte/store';
	import {
		SvelteFlow,
		Controls,
		Background,
		BackgroundVariant,
		MiniMap,
		useSvelteFlow,
		type Node,
		type Edge
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import ImageNode from './nodes/ImageNode.svelte';

	// 注册自定义节点类型
	const nodeTypes = {
		imageNode: ImageNode
	};

	// 初始节点：包含一个主图片查看器
	let nodes = writable<Node[]>([
		{
			id: 'main-viewer',
			type: 'imageNode',
			position: { x: 100, y: 100 },
			data: { label: 'Main Viewer' },
			dragHandle: '.drag-handle', // 如果需要特定拖拽区域，可以在 ImageNode 中添加 class="drag-handle"
			width: 800,
			height: 600
		}
	]);

	let edges = writable<Edge[]>([]);

	const { screenToFlowPosition } = useSvelteFlow();

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();

		if (!event.dataTransfer) return;

		// 示例：处理拖拽放置逻辑
		// const type = event.dataTransfer.getData('application/neoview-node');
		// const position = screenToFlowPosition({
		// 	x: event.clientX,
		// 	y: event.clientY
		// });
		// ... 创建新节点逻辑
	}
</script>

<div class="canvas-wrapper w-full h-full bg-background">
	<SvelteFlow
		{nodes}
		{edges}
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
