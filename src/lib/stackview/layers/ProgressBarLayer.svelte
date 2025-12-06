<!--
  ProgressBarLayer - 进度条层
  从 ImageViewerProgressBar 移植，集成到 StackView 层系统
  z-index: 65
-->
<script lang="ts">
	import { bookStore } from '$lib/stores/book.svelte';
	import { upscaleState } from '$lib/stores/upscale/upscaleState.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ReadingDirection } from '$lib/settings/settingsManager';
	import { LayerZIndex } from '../types/layer';

	let {
		showProgressBar = true
	}: {
		showProgressBar?: boolean;
	} = $props();

	// 从 bookStore 获取数据
	let totalPages = $derived(bookStore.totalPages);
	let currentPageIndex = $derived(bookStore.currentPageIndex);

	// 内部状态
	let progressColor = $state('#FDFBF7');
	let progressBlinking = $state(false);

	// 阅读方向
	let settings = $state(settingsManager.getSettings());
	let readingDirection: ReadingDirection = $derived(settings.book.readingDirection);

	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// 根据当前页面状态和全局状态计算进度条状态
	const currentPageStatus = $derived(
		totalPages > 0 ? bookStore.getPageUpscaleStatus(currentPageIndex) : 'none'
	);
	const isCurrentPageUpscaling = $derived(
		upscaleState.isUpscaling && upscaleState.currentImageHash !== null
	);
	const isLastPage = $derived(totalPages > 0 && currentPageIndex === totalPages - 1);

	// 更新进度条状态
	$effect(() => {
		if (isCurrentPageUpscaling) {
			progressColor = '#FFFFFF';
			progressBlinking = true;
		} else if (currentPageStatus === 'done') {
			progressColor = '#bbf7d0';
			progressBlinking = false;
		} else if (currentPageStatus === 'failed') {
			progressColor = '#ef4444';
			progressBlinking = false;
		} else if (isLastPage) {
			progressColor = 'var(--primary)';
			progressBlinking = false;
		} else {
			progressColor = 'var(--accent)';
			progressBlinking = false;
		}
	});
</script>

{#if showProgressBar && totalPages > 0}
	<div
		class="progress-bar-layer"
		data-layer="ProgressBarLayer"
		data-layer-id="progress-bar"
		style:z-index={LayerZIndex.INFO - 5}
	>
		<div class="bar-track" class:rtl={readingDirection === 'right-to-left'}>
			<!-- 阅读进度 + 当前页状态 -->
			<div
				class="reading-bar"
				class:animate-pulse={progressBlinking}
				class:rtl={readingDirection === 'right-to-left'}
				style:width="{((currentPageIndex + 1) / totalPages) * 100}%"
				style:background-color={progressColor}
			></div>
		</div>
	</div>
{/if}

<style>
	.progress-bar-layer {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 1.8rem;
		background: transparent;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.bar-track {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		height: 4px;
		background: color-mix(in srgb, var(--muted), transparent 50%);
	}

	.bar-track.rtl {
		direction: rtl;
	}

	.reading-bar {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 100%;
		border-radius: 0 2px 2px 0;
		transition:
			width 0.3s ease,
			background-color 0.3s ease;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
	}

	.reading-bar.rtl {
		left: auto;
		right: 0;
		border-radius: 2px 0 0 2px;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>
