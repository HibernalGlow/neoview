<script lang="ts">
	/**
	 * NeoView - Image Node Component
	 * Flow 画布中的图片查看器节点
	 */
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import ImageViewer from '$lib/components/viewer/ImageViewer.svelte';

	type $$Props = NodeProps;
</script>

<div
	class="image-node-wrapper nodrag"
	style="width: 100%; height: 100%; min-width: 400px; min-height: 300px;"
>
	<div class="bg-background h-full w-full overflow-hidden rounded-md border shadow-sm">
		<ImageViewer />
	</div>

	<!-- 拖拽手柄 -->
	<div
		class="drag-handle bg-muted/50 absolute -top-6 left-0 flex h-6 w-full cursor-move items-center justify-center rounded-t-md"
	>
		<span class="text-muted-foreground text-xs">Main Viewer</span>
	</div>

	<Handle type="source" position={Position.Bottom} class="bg-primary!" />
	<Handle type="target" position={Position.Top} class="bg-primary!" />
</div>

<style>
	.image-node-wrapper {
		height: 100%;
		width: 100%;
	}
</style>
