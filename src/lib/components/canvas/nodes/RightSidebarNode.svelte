<script lang="ts">
	/**
	 * NeoView - Right Sidebar Node Component
	 * Flow 画布中的右侧边栏节点
	 */
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import RightSidebar from '$lib/components/layout/RightSidebar.svelte';

	type $$Props = NodeProps;
</script>

<div
	class="right-sidebar-node-wrapper bg-background rounded-md border shadow-md"
	style="width: fit-content; height: 100%;"
>
	<div class="nodrag h-full">
		<RightSidebar />
	</div>

	<!-- 拖拽手柄 -->
	<div
		class="drag-handle bg-muted/50 absolute -top-6 left-0 flex h-6 w-full cursor-move items-center justify-center rounded-t-md"
	>
		<span class="text-muted-foreground text-xs">Right Sidebar</span>
	</div>

	<Handle type="target" position={Position.Left} class="bg-primary!" />
</div>

<style>
	.right-sidebar-node-wrapper {
		min-height: 400px;
	}
</style>
