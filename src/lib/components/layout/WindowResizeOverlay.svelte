<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

	let { zIndex = 2147483646 } = $props<{ zIndex?: number }>();

	const appWindow = getCurrentWebviewWindow();

	type ResizeDirection =
		| 'East'
		| 'West'
		| 'North'
		| 'South'
		| 'NorthEast'
		| 'NorthWest'
		| 'SouthEast'
		| 'SouthWest';

	async function handleResizeMouseDown(direction: ResizeDirection, event: MouseEvent): Promise<void> {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();

		const isFullscreen = await appWindow.isFullscreen();
		if (isFullscreen) return;

		const isMaximized = await appWindow.isMaximized();
		if (isMaximized) {
			await appWindow.unmaximize();
			await new Promise((resolve) => setTimeout(resolve, 16));
		}

		try {
			await appWindow.startResizeDragging(direction);
		} catch {
			await appWindow.setResizable(true);
			await appWindow.startResizeDragging(direction);
		}
	}

	function handleResizeOverlayMouseDown(event: MouseEvent): void {
		const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(
			'[data-resize-direction]'
		);
		const direction = element?.dataset.resizeDirection as ResizeDirection | undefined;
		if (!direction) return;
		void handleResizeMouseDown(direction, event);
	}

	onMount(() => {
		void appWindow.setResizable(true).catch((error) => {
			console.warn('Failed to ensure window is resizable:', error);
		});
	});
</script>

<!-- 无边框窗口的自定义缩放手柄（覆盖全窗口边缘） -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="pointer-events-none fixed inset-0 select-none"
	style={`z-index: ${zIndex};`}
	aria-hidden="true"
	onmousedown={handleResizeOverlayMouseDown}
>
	<div data-resize-direction="West" class="pointer-events-auto absolute left-0 top-0 h-full w-2 cursor-w-resize"></div>
	<div data-resize-direction="East" class="pointer-events-auto absolute right-0 top-0 h-full w-2 cursor-e-resize"></div>
	<div data-resize-direction="North" class="pointer-events-auto absolute left-0 top-0 h-2 w-full cursor-n-resize"></div>
	<div data-resize-direction="South" class="pointer-events-auto absolute bottom-0 left-0 h-2 w-full cursor-s-resize"></div>

	<div data-resize-direction="NorthWest" class="pointer-events-auto absolute left-0 top-0 h-3 w-3 cursor-nw-resize"></div>
	<div data-resize-direction="NorthEast" class="pointer-events-auto absolute right-0 top-0 h-3 w-3 cursor-ne-resize"></div>
	<div data-resize-direction="SouthWest" class="pointer-events-auto absolute bottom-0 left-0 h-3 w-3 cursor-sw-resize"></div>
	<div data-resize-direction="SouthEast" class="pointer-events-auto absolute bottom-0 right-0 h-3 w-3 cursor-se-resize"></div>
</div>