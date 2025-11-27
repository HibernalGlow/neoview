<script lang="ts">
	/**
	 * NeoView - Top Toolbar Node Component
	 * Flow 画布中的顶部工具栏节点
	 */
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import TopToolbar from '$lib/components/layout/TopToolbar.svelte';

	type $$Props = NodeProps;
</script>

<div
	class="top-toolbar-node-wrapper bg-background rounded-md border shadow-md"
	style="width: 100%; min-width: 600px;"
>
	<div class="nodrag">
		<TopToolbar />
	</div>

	<!-- 拖拽手柄 -->
	<div
		class="drag-handle bg-muted/50 absolute -top-6 left-0 flex h-6 w-full cursor-move items-center justify-center rounded-t-md"
	>
		<span class="text-muted-foreground text-xs">Top Toolbar</span>
	</div>

	<Handle type="source" position={Position.Bottom} class="bg-primary!" />
</div>

<style>
	.top-toolbar-node-wrapper {
		min-height: 48px;
	}
</style>
