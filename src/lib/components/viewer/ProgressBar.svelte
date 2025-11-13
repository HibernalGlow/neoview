<script lang="ts">
	/**
	 * ProgressBar Component
	 * Viewer 底部进度条 - 支持实时超分进度
	 */
	import { bookStore } from '$lib/stores/book.svelte';
	import { 
		currentUpscaleTask, 
		upscaleTaskQueue 
	} from '$lib/stores/upscale/UpscaleMemoryCache.svelte';
	import { getTaskProgress, getTaskProgressColor } from '$lib/stores/upscale/UpscaleWorkflow.svelte';

	// Props (Svelte 5 Runes)
	interface Props {
		showProgressBar?: boolean;
		preUpscaleProgress?: number;
		totalPreUpscalePages?: number;
	}

	const { 
		showProgressBar = true, 
		preUpscaleProgress = 0, 
		totalPreUpscalePages = 0 
	} = $props();

	// 当前任务
	let currentTask = $state($currentUpscaleTask);
	let taskQueue = $state($upscaleTaskQueue);

	$effect(() => {
		currentTask = $currentUpscaleTask;
	});

	$effect(() => {
		taskQueue = $upscaleTaskQueue;
	});

	// 计算进度条宽度
	function calculatePageProgress(): number {
		if (!bookStore.currentBook) return 0;
		return ((bookStore.currentPageIndex + 1) / bookStore.currentBook.pages.length) * 100;
	}

	// 计算预超分进度
	function calculatePreUpscaleProgress(): number {
		if (!bookStore.currentBook || totalPreUpscalePages === 0) return 0;
		const baseProgress = (bookStore.currentPageIndex + 1) / bookStore.currentBook.pages.length;
		const preProgress = (preUpscaleProgress / 100) * (totalPreUpscalePages / bookStore.currentBook.pages.length);
		return (baseProgress + preProgress) * 100;
	}

	// 获取当前进度条颜色
	function getProgressColor(): string {
		if (!currentTask) return '#FDFBF7'; // 默认奶白色

		const color = getTaskProgressColor(currentTask.id);
		if (color === 'yellow') return '#FCD34D'; // 黄色 - 预超分
		if (color === 'green') return '#22c55e'; // 绿色 - 超分中/完成
		if (color === 'red') return '#ef4444'; // 红色 - 错误

		return '#FDFBF7';
	}

	// 判断是否应该闪烁
	function shouldBlink(): boolean {
		if (!currentTask) return false;
		return currentTask.status === 'upscaling' || currentTask.status === 'preupscaling';
	}

	// 获取进度条样式类
	function getProgressBarClass(): string {
		if (!currentTask) return '';
		if (currentTask.status === 'upscaling') return 'animate-pulse'; // 超分中闪烁
		if (currentTask.status === 'completed') return 'animate-none'; // 完成后不闪烁
		if (currentTask.status === 'preupscaling') return 'animate-pulse'; // 预超分中闪烁
		return '';
	}
</script>

<!-- Viewer 底部进度条 -->
{#if showProgressBar && bookStore.currentBook}
	<div class="absolute bottom-0 left-0 right-0 h-1 pointer-events-none z-10">
		<!-- 预超分进度条（黄色，底层） -->
		{#if preUpscaleProgress > 0 && totalPreUpscalePages > 0}
			<div 
				class="absolute bottom-0 left-0 h-full transition-all duration-500" 
				style="width: {calculatePreUpscaleProgress()}%; background-color: #FCD34D; opacity: 0.7;"
			></div>
		{/if}

		<!-- 当前页面进度条（奶白色/绿色/黄色/红色，顶层） -->
		<!-- 超分完成后显示绿色，不闪烁 -->
		<div 
			class="absolute bottom-0 left-0 h-full transition-all duration-300 {getProgressBarClass()}" 
			style="width: {calculatePageProgress()}%; background-color: {getProgressColor()}; opacity: 0.9; z-index: 100;"
		></div>

		<!-- 悬停提示 -->
		<div class="absolute bottom-2 left-0 text-xs text-white opacity-0 hover:opacity-100 transition-opacity pointer-events-auto">
			<div class="bg-black/80 px-2 py-1 rounded whitespace-nowrap">
				{#if currentTask}
					{currentTask.isPreupscale ? '预超分' : '超分'}: {currentTask.progress}% | {currentTask.model}
				{:else}
					第 {bookStore.currentPageIndex + 1} / {bookStore.currentBook.pages.length} 页
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.animate-pulse) {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 0.8;
		}
		50% {
			opacity: 0.4;
		}
	}
</style>
