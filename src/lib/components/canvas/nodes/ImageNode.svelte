<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import ImageViewer from '$lib/components/viewer/ImageViewer.svelte';

	type $$Props = NodeProps;
</script>

<div class="image-node-wrapper nodrag" style="width: 100%; height: 100%; min-width: 400px; min-height: 300px;">
	<!-- 
		nodrag class is important! 
		It prevents the flow from handling drags inside this component, 
		allowing the ImageViewer's internal interactions (if any) to work.
		However, for the node itself to be draggable, the user needs to drag the handle or a specific drag handle area if configured.
		By default, clicking and dragging the node body moves the node. 
		If ImageViewer captures mouse events, we might need a specific drag handle.
	-->
	<div class="h-full w-full rounded-md border bg-background shadow-sm overflow-hidden">
		<ImageViewer />
	</div>

	<Handle type="source" position={Position.Bottom} class="!bg-primary" />
	<Handle type="target" position={Position.Top} class="!bg-primary" />
</div>

<style>
	.image-node-wrapper {
		/* Ensure the node has some dimensions */
		height: 100%;
		width: 100%;
	}
</style>
