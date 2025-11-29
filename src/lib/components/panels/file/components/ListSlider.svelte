<script lang="ts">
	/**
	 * ListSlider - 列表进度条/滑块组件
	 * 复刻 NeeView 的 PageSlider 功能
	 * - 显示当前位置百分比
	 * - 可拖拽跳转
	 * - 显示项目索引
	 */

	interface Props {
		/** 总项目数 */
		totalItems: number;
		/** 当前选中项索引 */
		currentIndex: number;
		/** 可见范围起始索引 */
		visibleStart: number;
		/** 可见范围结束索引 */
		visibleEnd: number;
		/** 滚动位置百分比 (0-1) */
		scrollProgress: number;
		/** 是否显示索引输入框 */
		showIndexInput?: boolean;
		/** 跳转到指定索引回调 */
		onJumpToIndex?: (index: number) => void;
		/** 滚动到指定百分比回调 */
		onScrollToProgress?: (progress: number) => void;
	}

	let {
		totalItems,
		currentIndex,
		visibleStart,
		visibleEnd,
		scrollProgress,
		showIndexInput = true,
		onJumpToIndex,
		onScrollToProgress
	}: Props = $props();

	let isDragging = $state(false);
	let sliderRef = $state<HTMLDivElement | null>(null);
	let inputValue = $state('');
	let showInput = $state(false);

	// 计算可见区域占总高度的比例
	const visibleRatio = $derived(() => {
		if (totalItems <= 0) return 1;
		const visibleCount = visibleEnd - visibleStart + 1;
		return Math.min(1, visibleCount / totalItems);
	});

	// 滑块位置（百分比）
	const thumbPosition = $derived(scrollProgress * 100);

	// 滑块高度（百分比，最小 20px 等效）
	const thumbHeight = $derived(Math.max(10, visibleRatio() * 100));

	function handleTrackClick(e: MouseEvent) {
		if (!sliderRef || isDragging) return;
		const rect = sliderRef.getBoundingClientRect();
		const y = e.clientY - rect.top;
		const progress = Math.max(0, Math.min(1, y / rect.height));
		onScrollToProgress?.(progress);
	}

	function handleThumbMouseDown(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = true;

		const handleMouseMove = (moveEvent: MouseEvent) => {
			if (!sliderRef) return;
			const rect = sliderRef.getBoundingClientRect();
			const y = moveEvent.clientY - rect.top;
			const progress = Math.max(0, Math.min(1, y / rect.height));
			onScrollToProgress?.(progress);
		};

		const handleMouseUp = () => {
			isDragging = false;
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleIndexClick() {
		if (!showIndexInput) return;
		inputValue = String(currentIndex + 1);
		showInput = true;
	}

	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			const index = parseInt(inputValue, 10) - 1;
			if (!isNaN(index) && index >= 0 && index < totalItems) {
				onJumpToIndex?.(index);
			}
			showInput = false;
		} else if (e.key === 'Escape') {
			showInput = false;
		}
	}

	function handleInputBlur() {
		showInput = false;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.05 : -0.05;
		const newProgress = Math.max(0, Math.min(1, scrollProgress + delta));
		onScrollToProgress?.(newProgress);
	}
</script>

<div class="list-slider-container flex flex-col items-center gap-1">
	<!-- 索引显示/输入 -->
	<div class="index-display text-[10px] text-muted-foreground">
		{#if showInput && showIndexInput}
			<input
				type="number"
				min="1"
				max={totalItems}
				class="w-12 h-5 text-center text-[10px] rounded border bg-background"
				bind:value={inputValue}
				onkeydown={handleInputKeydown}
				onblur={handleInputBlur}
				autofocus
			/>
		{:else}
			<button
				class="hover:text-foreground transition-colors cursor-pointer"
				onclick={handleIndexClick}
				title="点击输入索引跳转"
			>
				{currentIndex + 1}
			</button>
		{/if}
	</div>

	<!-- 滑块轨道 -->
	<div
		bind:this={sliderRef}
		class="slider-track relative w-3 flex-1 rounded-full bg-muted/50 cursor-pointer"
		onclick={handleTrackClick}
		onwheel={handleWheel}
		role="slider"
		aria-valuenow={currentIndex + 1}
		aria-valuemin={1}
		aria-valuemax={totalItems}
		tabindex="0"
	>
		<!-- 已读区域指示 -->
		<div
			class="absolute left-0 right-0 top-0 rounded-full bg-primary/20"
			style="height: {thumbPosition}%"
		></div>

		<!-- 滑块 -->
		<div
			class="slider-thumb absolute left-0 right-0 rounded-full transition-colors
				{isDragging ? 'bg-primary scale-110' : 'bg-primary/70 hover:bg-primary'}"
			style="top: {thumbPosition}%; height: {thumbHeight}%; min-height: 16px; transform: translateY(-50%);"
			onmousedown={handleThumbMouseDown}
			role="presentation"
		></div>

		<!-- 可见区域指示器 -->
		<div
			class="absolute left-0 right-0 border border-primary/40 rounded-full pointer-events-none"
			style="top: {(visibleStart / totalItems) * 100}%; height: {((visibleEnd - visibleStart + 1) / totalItems) * 100}%"
		></div>
	</div>

	<!-- 总数显示 -->
	<div class="total-display text-[10px] text-muted-foreground">
		{totalItems}
	</div>
</div>

<style>
	.list-slider-container {
		height: 100%;
		padding: 4px 0;
	}

	.slider-track {
		min-height: 100px;
	}

	.slider-thumb {
		cursor: grab;
	}

	.slider-thumb:active {
		cursor: grabbing;
	}
</style>
