<script lang="ts">
	/**
	 * ListSlider - 列表进度条/滑块组件
	 * - 显示当前位置/总数
	 * - 可拖拽滑块快速跳转
	 * - 支持点击轨道跳转
	 * - 支持鼠标滚轮
	 * - 回顶/回底按钮
	 */
	import { ChevronsUp, ChevronsDown } from '@lucide/svelte';

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

<div class="list-slider-container group flex flex-col items-center">
	<!-- 回顶按钮（悬停显示） -->
	<button
		class="hidden group-hover:block p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
		onclick={() => { onScrollToProgress?.(0); onJumpToIndex?.(0); }}
		title="回到顶部"
	>
		<ChevronsUp class="h-3 w-3" />
	</button>

	<!-- 索引显示（悬停显示） -->
	<div class="hidden group-hover:block text-[9px] text-muted-foreground font-mono py-0.5">
		{#if showInput && showIndexInput}
			<input
				type="number"
				min="1"
				max={totalItems}
				class="w-8 h-4 text-center text-[8px] rounded border bg-background"
				bind:value={inputValue}
				onkeydown={handleInputKeydown}
				onblur={handleInputBlur}
				autofocus
			/>
		{:else}
			<button
				class="hover:text-foreground transition-colors"
				onclick={handleIndexClick}
				title="点击输入跳转"
			>
				{currentIndex + 1}
			</button>
		{/if}
	</div>

	<!-- 滑块轨道 -->
	<div
		bind:this={sliderRef}
		class="slider-track relative flex-1 rounded-full bg-muted/40 cursor-pointer transition-all duration-200
			w-1 group-hover:w-3"
		onclick={handleTrackClick}
		onwheel={handleWheel}
		role="slider"
		aria-valuenow={currentIndex + 1}
		aria-valuemin={1}
		aria-valuemax={totalItems}
		tabindex="0"
	>
		<!-- 已滚动区域 -->
		<div
			class="absolute left-0 right-0 top-0 rounded-t-full bg-primary/30"
			style="height: {thumbPosition}%"
		></div>

		<!-- 滑块 -->
		<div
			class="slider-thumb absolute left-0 right-0 rounded-full transition-colors
				{isDragging ? 'bg-primary' : 'bg-primary/60 hover:bg-primary'}"
			style="top: {thumbPosition}%; height: {Math.max(6, thumbHeight)}%; min-height: 12px; transform: translateY(-50%);"
			onmousedown={handleThumbMouseDown}
			role="presentation"
		></div>
	</div>

	<!-- 总数显示（悬停显示） -->
	<div class="hidden group-hover:block text-[9px] text-muted-foreground font-mono py-0.5">
		{totalItems}
	</div>

	<!-- 回底按钮（悬停显示） -->
	<button
		class="hidden group-hover:block p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
		onclick={() => { onScrollToProgress?.(1); onJumpToIndex?.(totalItems - 1); }}
		title="回到底部"
	>
		<ChevronsDown class="h-3 w-3" />
	</button>
</div>

<style>
	.list-slider-container {
		height: 100%;
		padding: 2px 0;
	}

	.slider-track {
		min-height: 80px;
	}

	.slider-thumb {
		cursor: grab;
	}

	.slider-thumb:active {
		cursor: grabbing;
	}
</style>
