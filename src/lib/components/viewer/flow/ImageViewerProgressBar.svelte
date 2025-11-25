<script lang="ts">
	import { bookStore } from '$lib/stores/book.svelte';
	import { upscaleState } from '$lib/stores/upscale/upscaleState.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ReadingDirection } from '$lib/settings/settingsManager';

	let {
		showProgressBar = true,
		totalPages = 0,
		currentPageIndex = 0,
		preUpscaleProgress = 0,
		totalPreUpscalePages = 0
	} = $props();

	// 内部状态，不再从外部传入
	let progressColor = $state('#FDFBF7');
	let progressBlinking = $state(false);

	// 阅读方向
	let settings = $state(settingsManager.getSettings());
	let readingDirection: ReadingDirection = $derived(settings.book.readingDirection);

	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// 计算预超分覆盖范围
	const furthestPreUpscaledIndex = $derived(bookStore.getFurthestPreUpscaledIndex());
	const preUpscaledCount = $derived(
		furthestPreUpscaledIndex >= 0 ? furthestPreUpscaledIndex + 1 : 0
	);
	const preUpscaleExtent = $derived(
		totalPages > 0 && preUpscaledCount > 0 ? (preUpscaledCount / totalPages) * 100 : 0
	);
	const preUpscaleBarWidth = $derived(
		preUpscaleProgress > 0 ? preUpscaleProgress : preUpscaleExtent
	);

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
			progressColor = '#FFFFFF'; // 白色
			progressBlinking = true;
		} else if (currentPageStatus === 'done') {
			progressColor = '#bbf7d0'; // 淡绿色
			progressBlinking = false;
		} else if (currentPageStatus === 'failed') {
			progressColor = '#ef4444'; // 红色
			progressBlinking = false;
		} else if (isLastPage) {
			progressColor = 'var(--accent)'; // 辅助色
			progressBlinking = false;
		} else {
			progressColor = 'var(--accent)'; // 辅助色
			progressBlinking = false;
		}
	});
</script>

{#if showProgressBar && totalPages > 0}
	<div class="viewer-progress pointer-events-none">
		<div class={`bar-track ${readingDirection === 'right-to-left' ? 'rtl' : ''}`}>
			<!-- 下层：预超分覆盖进度条 -->
			{#if preUpscaleBarWidth > 0}
				<div
					class={`preup-bar ${readingDirection === 'right-to-left' ? 'rtl' : ''}`}
					style={`width: ${Math.min(preUpscaleBarWidth, 100)}%;`}
				></div>
			{/if}

			<!-- 上层：阅读进度 + 当前页状态 -->
			<div
				class={`reading-bar ${progressBlinking ? 'animate-pulse' : ''} ${readingDirection === 'right-to-left' ? 'rtl' : ''}`}
				style={`width: ${((currentPageIndex + 1) / totalPages) * 100}%; background-color: ${progressColor};`}
			></div>
		</div>
	</div>
{/if}

<style>
	.viewer-progress {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 1.8rem;
		background: transparent;
		transition: opacity 0.3s ease;
		z-index: 10;
	}

	.bar-track {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		height: 3px;
		background: color-mix(in srgb, var(--muted), transparent 50%);
	}

	.bar-track.rtl {
		direction: rtl;
	}

	.preup-bar {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 100%;
		background-color: rgba(250, 204, 21, 0.7);
		transition: width 0.4s ease;
		border-radius: 0 2px 2px 0;
	}

	.preup-bar.rtl {
		left: auto;
		right: 0;
		border-radius: 2px 0 0 2px;
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
	</style>
