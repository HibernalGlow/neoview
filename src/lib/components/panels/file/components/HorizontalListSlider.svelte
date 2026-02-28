<script lang="ts">
	/**
	 * HorizontalListSlider - 横向列表进度滑块组件
	 * 基于 ListSlider 改为横向布局
	 * - 显示当前位置/总数
	 * - 可拖拽滑块快速跳转
	 * - 支持点击轨道跳转
	 * - 支持鼠标滚轮
	 */
	import { ChevronsLeft, ChevronsRight } from '@lucide/svelte';
	import type { ReadingDirection } from '$lib/settings/settingsManager';

	interface Props {
		/** 总项目数 */
		totalItems: number;
		/** 当前选中项索引 */
		currentIndex: number;
		/** 进度百分比 (0-1) */
		progress: number;
		/** 是否显示索引输入框 */
		showIndexInput?: boolean;
		/** 阅读方向 */
		readingDirection?: ReadingDirection;
		/** 跳转到指定索引回调 */
		onJumpToIndex?: (index: number) => void;
		/** 滚动到指定百分比回调 */
		onScrollToProgress?: (progress: number) => void;
	}

	let {
		totalItems,
		currentIndex,
		progress,
		showIndexInput = true,
		readingDirection = 'left-to-right',
		onJumpToIndex,
		onScrollToProgress
	}: Props = $props();

	// 是否为右开模式
	const isRtl = $derived(readingDirection === 'right-to-left');

	let isDragging = $state(false);
	let sliderRef = $state<HTMLDivElement | null>(null);
	let inputValue = $state('');
	let showInput = $state(false);
	let dragProgress = $state(0); // 拖动时的临时进度

	// 滑块位置（百分比）- 拖动时用临时进度，否则用实际进度
	// 位置始终基于进度计算，右开模式通过 CSS 定位属性处理
	const rawProgress = $derived(isDragging ? dragProgress : progress);
	const thumbPosition = $derived(rawProgress * 100);

	function handleTrackClick(e: MouseEvent) {
		if (!sliderRef || isDragging) return;
		const rect = sliderRef.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const clickPosition = Math.max(0, Math.min(1, x / rect.width));
		// 右开模式：点击位置需要反转为进度（点击右边=进度0，点击左边=进度1）
		const newProgress = isRtl ? (1 - clickPosition) : clickPosition;
		onScrollToProgress?.(newProgress);
		// 同时跳转到对应索引
		const newIndex = Math.round(newProgress * (totalItems - 1));
		onJumpToIndex?.(newIndex);
	}

	function handleTrackKeydown(e: KeyboardEvent) {
		if (e.key === 'Home') {
			e.preventDefault();
			onScrollToProgress?.(0);
			onJumpToIndex?.(0);
			return;
		}
		if (e.key === 'End') {
			e.preventDefault();
			onScrollToProgress?.(1);
			onJumpToIndex?.(Math.max(0, totalItems - 1));
			return;
		}
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		const step = e.key === 'ArrowRight' ? 0.05 : -0.05;
		const adjustedStep = isRtl ? -step : step;
		onScrollToProgress?.(Math.max(0, Math.min(1, progress + adjustedStep)));
	}

	function handleThumbMouseDown(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = true;
		dragProgress = progress; // 初始化拖动进度

		const handleMouseMove = (moveEvent: MouseEvent) => {
			if (!sliderRef) return;
			const rect = sliderRef.getBoundingClientRect();
			const x = moveEvent.clientX - rect.left;
			const dragPosition = Math.max(0, Math.min(1, x / rect.width));
			// 右开模式：拖动位置需要反转为进度
			const newProgress = isRtl ? (1 - dragPosition) : dragPosition;
			dragProgress = newProgress;
			// 实时滚动列表
			onScrollToProgress?.(newProgress);
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
		// 右开模式：反转滚轮方向
		const delta = isRtl ? (e.deltaY > 0 ? -1 : 1) : (e.deltaY > 0 ? 1 : -1);
		const newIndex = Math.max(0, Math.min(totalItems - 1, currentIndex + delta));
		onJumpToIndex?.(newIndex);
	}
</script>

<div class="horizontal-slider-container group/slider flex items-center w-full h-4 gap-2 px-2 transition-all duration-200 {isRtl ? 'flex-row-reverse' : ''}">
	<!-- 回首按钮 -->
	<button
		class="w-0 overflow-hidden group-hover/slider:w-auto p-0 group-hover/slider:p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all shrink-0"
		onclick={() => { onScrollToProgress?.(0); onJumpToIndex?.(0); }}
		title="回到开始"
	>
		<ChevronsLeft class="h-3 w-3" />
	</button>

	<!-- 当前索引显示 -->
	<div class="w-0 overflow-hidden group-hover/slider:w-auto text-[9px] text-muted-foreground font-mono transition-all shrink-0">
		{#if showInput && showIndexInput}
			<input
				type="number"
				min="1"
				max={totalItems}
				class="w-8 h-4 text-center text-[8px] rounded border bg-background"
				bind:value={inputValue}
				onkeydown={handleInputKeydown}
				onblur={handleInputBlur}
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
			h-[3px] group-hover/slider:h-2.5"
		onclick={handleTrackClick}
		onwheel={handleWheel}
		onkeydown={handleTrackKeydown}
		role="slider"
		aria-valuenow={currentIndex + 1}
		aria-valuemin={1}
		aria-valuemax={totalItems}
		tabindex="0"
	>
		<!-- 已滚动区域 -->
		<div
			class="absolute top-0 bottom-0 bg-primary/30 {isRtl ? 'right-0 rounded-r-full' : 'left-0 rounded-l-full'}"
			style="width: {thumbPosition}%"
		></div>

		<!-- 滑块 -->
		<div
			class="slider-thumb absolute top-0 bottom-0 w-3 rounded-full transition-colors
				{isDragging ? 'bg-primary' : 'bg-primary/60 hover:bg-primary'}"
			style="{isRtl ? 'right' : 'left'}: {thumbPosition}%; transform: translateX({isRtl ? '50%' : '-50%'});"
			onmousedown={handleThumbMouseDown}
			role="presentation"
		></div>
	</div>

	<!-- 总数显示 -->
	<div class="w-0 overflow-hidden group-hover/slider:w-auto text-[9px] text-muted-foreground font-mono transition-all shrink-0">
		{totalItems}
	</div>

	<!-- 回尾按钮 -->
	<button
		class="w-0 overflow-hidden group-hover/slider:w-auto p-0 group-hover/slider:p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all shrink-0"
		onclick={() => { onScrollToProgress?.(1); onJumpToIndex?.(totalItems - 1); }}
		title="回到结束"
	>
		<ChevronsRight class="h-3 w-3" />
	</button>
</div>

<style>
	.horizontal-slider-container {
		padding: 0 2px;
	}

	.slider-track {
		min-width: 60px;
	}

	.slider-thumb {
		cursor: grab;
	}

	.slider-thumb:active {
		cursor: grabbing;
	}
</style>
