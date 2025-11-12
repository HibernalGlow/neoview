<script lang="ts">
	/**
	 * Comparison Mode Component
	 * 对比模式组件 - 支持滑动对比和分屏对比
	 */
	import { createEventDispatcher } from 'svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { zoomLevel, rotationAngle } from '$lib/stores';

	let {
		originalImageData = '',
		upscaledImageData = '',
		mode = 'slider',
		isVisible = false,
		onClose = () => {}
	} = $props();

	const dispatch = createEventDispatcher();

	// 滑动对比相关状态
	let sliderPosition = $state(50); // 滑块位置 (0-100)
	let isDragging = $state(false);
	let sliderContainer = $state<HTMLDivElement | null>(null);

	// 分屏对比相关状态
	let splitRatio = $state(50); // 分屏比例 (0-100)

	// 鼠标事件处理
	function handleMouseDown(e: MouseEvent) {
		if (mode === 'slider') {
			isDragging = true;
			updateSliderPosition(e);
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDragging && mode === 'slider') {
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
		} else if (e.key === 'ArrowLeft' && mode === 'slider') {
			sliderPosition = Math.max(0, sliderPosition - 5);
		} else if (e.key === 'ArrowRight' && mode === 'slider') {
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
		if (mode === 'slider') {
			return `inset(0 ${100 - sliderPosition}% 0 0)`;
		}
		return '';
	}

	// 获取分屏样式
	function getSplitStyle(side: 'left' | 'right') {
		if (mode === 'split_screen') {
			const width = side === 'left' ? splitRatio : (100 - splitRatio);
			return {
				width: `${width}%`,
				height: '100%'
			};
		}
		return {};
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
					<span class="text-sm font-medium">
						{mode === 'slider' ? '滑动对比' : '分屏对比'}
					</span>
					{#if mode === 'slider'}
						<span class="text-xs text-gray-300">({sliderPosition.toFixed(0)}%)</span>
					{/if}
				</div>
			</div>

			<!-- 对比容器 -->
			<div 
				bind:this={sliderContainer}
				class="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden"
				onmousedown={handleMouseDown}
				style="cursor: {mode === 'slider' ? 'col-resize' : 'default'}"
			>
				{#if mode === 'slider'}
					<!-- 滑动对比模式 -->
					<div class="relative w-full h-full">
						<!-- 原图（底层） -->
						<img 
							src={originalImageData}
							alt="原图"
							class="absolute inset-0 w-full h-full object-contain"
							style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg);"
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
								style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg);"
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

				{:else if mode === 'split_screen'}
					<!-- 分屏对比模式 -->
					<div class="flex w-full h-full">
						<!-- 左侧：原图 -->
						<div class="flex items-center justify-center bg-gray-800" style={getSplitStyle('left')}>
							<div class="text-center">
								<div class="text-white text-sm mb-2">原图</div>
								<img 
									src={originalImageData}
									alt="原图"
									class="max-w-full max-h-full object-contain"
									style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg);"
								/>
							</div>
						</div>

						<!-- 分隔线 -->
						<div class="w-1 bg-gray-600 cursor-col-resize" />

						<!-- 右侧：超分图 -->
						<div class="flex items-center justify-center bg-gray-800" style={getSplitStyle('right')}>
							<div class="text-center">
								<div class="text-white text-sm mb-2">超分图</div>
								<img 
									src={upscaledImageData}
									alt="超分图"
									class="max-w-full max-h-full object-contain"
									style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg);"
								/>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- 操作提示 -->
			<div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-lg text-sm">
				{#if mode === 'slider'}
					拖动鼠标或使用方向键调整对比位置 | ESC 关闭
				{:else}
					ESC 关闭对比
				{/if}
			</div>
		</div>
	</div>
{/if}