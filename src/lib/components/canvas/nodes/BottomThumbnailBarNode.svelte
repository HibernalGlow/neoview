<script lang="ts">
	/**
	 * NeoView - Bottom Thumbnail Bar Node Component
	 * Flow 画布中的底部缩略图栏节点
	 */
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import BottomThumbnailBar from '$lib/components/layout/BottomThumbnailBar.svelte';

	type $$Props = NodeProps;
</script>

<div
	class="bottom-bar-node-wrapper bg-background rounded-md border shadow-md"
	style="width: 100%; min-width: 600px;"
>
	<div class="nodrag">
		<BottomThumbnailBar />
	</div>

	<!-- 拖拽手柄 -->
	<div
		class="drag-handle bg-muted/50 absolute -top-6 left-0 flex h-6 w-full cursor-move items-center justify-center rounded-t-md"
	>
		<span class="text-muted-foreground text-xs">Bottom Thumbnail Bar</span>
	</div>

	<Handle type="target" position={Position.Top} class="bg-primary!" />
</div>

<style>
	.bottom-bar-node-wrapper {
		min-height: 120px;
	}
</style>
