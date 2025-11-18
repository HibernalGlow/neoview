<script lang="ts">
	/**
	 * Comparison Mode Component
	 * 对比模式组件 - 滑动对比
	 */
	import { bookStore } from '$lib/stores/book.svelte';
	import { rotationAngle } from '$lib/stores';
	import { readable } from 'svelte/store';
	import { appState, type StateSelector } from '$lib/core/state/appState';

	type ComparisonViewerProps = {
		originalImageData?: string;
		upscaledImageData?: string;
		isVisible?: boolean;
		onClose?: () => void;
	};

	let {
		originalImageData = '',
		upscaledImageData = '',
		isVisible = false,
		onClose = () => {}
	}: ComparisonViewerProps = $props();

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);

	// 滑动对比相关状态
	let sliderPosition = $state(50); // 滑块位置 (0-100)
	let isDragging = $state(false);
	let sliderContainer = $state<HTMLDivElement | null>(null);

	// 鼠标事件处理
	function handleMouseDown(e: MouseEvent) {
		isDragging = true;
		updateSliderPosition(e);
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDragging) {
			updateSliderPosition(e);
		}
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function updateSliderPosition(e: MouseEvent) {
		if (!sliderContainer) return;
		
		const rect = sliderContainer.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const position = Math.max(0, Math.min(100, (x / rect.width) * 100));
		sliderPosition = position;
	}

	// 键盘事件处理
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		} else if (e.key === 'ArrowLeft') {
			sliderPosition = Math.max(0, sliderPosition - 5);
		} else if (e.key === 'ArrowRight') {
			sliderPosition = Math.min(100, sliderPosition + 5);
		}
	}

	// 全局事件监听
	$effect(() => {
		if (isVisible) {
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);
			window.addEventListener('keydown', handleKeydown);
			
			return () => {
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
				window.removeEventListener('keydown', handleKeydown);
			};
		}
	});

	// 获取裁剪样式
	function getClipPath() {
		return `inset(0 ${100 - sliderPosition}% 0 0)`;
	}
</script>

<svelte:window />

{#if isVisible && originalImageData && upscaledImageData}
	<div class="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center">
		<div class="relative w-full h-full max-w-7xl max-h-[90vh] m-4">
			<!-- 关闭按钮 -->
			<button
				onclick={onClose}
				class="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
				title="关闭对比 (ESC)"
			>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- 模式指示器 -->
			<div class="absolute top-4 left-4 z-10 bg-black/50 text-white px-3 py-2 rounded-lg">
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium">滑动对比</span>
					<span class="text-xs text-gray-300">({sliderPosition.toFixed(0)}%)</span>
				</div>
			</div>

			<!-- 对比容器 -->
			<div 
				bind:this={sliderContainer}
				class="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden"
				onmousedown={handleMouseDown}
				style="cursor: col-resize"
				role="presentation"
				tabindex="-1"
			>
				<!-- 滑动对比模式 -->
				<div class="relative w-full h-full">
					<!-- 原图（底层） -->
					<img 
						src={originalImageData}
						alt="原图"
						class="absolute inset-0 w-full h-full object-contain"
						style="transform: scale({$viewerState.zoom}) rotate({$rotationAngle}deg);"
					/>
					
					<!-- 超分图（顶层，裁剪显示） -->
					<div 
						class="absolute inset-0 w-full h-full"
						style="clip-path: {getClipPath()};"
					>
						<img 
							src={upscaledImageData}
							alt="超分图"
							class="w-full h-full object-contain"
							style="transform: scale({$viewerState.zoom}) rotate({$rotationAngle}deg);"
						/>
					</div>

					<!-- 滑块线 -->
					<div 
						class="absolute top-0 bottom-0 w-1 bg-white shadow-lg pointer-events-none"
						style="left: {sliderPosition}%"
					>
						<!-- 滑块手柄 -->
						<div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-1 shadow-lg">
							<svg class="w-4 h-4 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
							</svg>
						</div>
					</div>
				</div>
			</div>

			<!-- 操作提示 -->
			<div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-lg text-sm">
				拖动鼠标或使用方向键调整对比位置 | ESC 关闭
			</div>
		</div>
	</div>
{/if}