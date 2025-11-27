<script lang="ts">
	/**
	 * NeoView - Sidebar Node Component
	 * Flow 画布中的左侧边栏节点
	 */
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';

	type $$Props = NodeProps;
</script>

<div
	class="sidebar-node-wrapper bg-background rounded-md border shadow-md"
	style="width: fit-content; height: 100%;"
>
	<div class="nodrag h-full">
		<Sidebar />
	</div>

	<!-- 拖拽手柄 -->
	<div
		class="drag-handle bg-muted/50 absolute -top-6 left-0 flex h-6 w-full cursor-move items-center justify-center rounded-t-md"
	>
		<span class="text-muted-foreground text-xs">Left Sidebar</span>
	</div>

	<Handle type="source" position={Position.Right} class="bg-primary!" />
</div>

<style>
	.sidebar-node-wrapper {
		min-height: 400px;
	}
</style>
