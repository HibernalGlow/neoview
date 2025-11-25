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

		<div class="progress-info">
			<div class="info-left">
				<span>第 {currentPageIndex + 1}/{totalPages} 页</span>
				{#if isCurrentPageUpscaling}
					<span class="status in-progress">超分中 {Math.round(upscaleState.progress)}%</span>
				{:else if currentPageStatus === 'done'}
					<span class="status done">超分完成</span>
				{:else if currentPageStatus === 'failed'}
					<span class="status failed">超分失败</span>
				{/if}
			</div>
			{#if preUpscaleBarWidth > 0}
				<div class="info-right">
					<span class="preup-label">
						预超分 {preUpscaledCount}/{totalPreUpscalePages || Math.max(preUpscaledCount, 0)}
					</span>
				</div>
			{/if}
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

	.progress-info {
		position: absolute;
		left: 0.8rem;
		right: 0.8rem;
		bottom: 6px;
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.9);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
		pointer-events: none;
		align-items: center;
	}

	.info-left,
	.info-right {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.status {
		padding: 0.05rem 0.4rem;
		border-radius: 4px;
		font-size: 0.65rem;
		text-shadow: none;
		font-weight: 500;
	}

	.status.in-progress {
		background: rgba(255, 255, 255, 0.8);
		color: #111;
		backdrop-filter: blur(4px);
	}

	.status.done {
		background: rgba(187, 247, 208, 0.8);
		color: #14532d;
		backdrop-filter: blur(4px);
	}

	.status.failed {
		background: rgba(248, 113, 113, 0.8);
		color: #450a0a;
		backdrop-filter: blur(4px);
	}

	.preup-label {
		background: rgba(250, 204, 21, 0.7);
		color: #422006;
		border-radius: 4px;
		padding: 0.05rem 0.4rem;
		text-shadow: none;
		font-size: 0.65rem;
		font-weight: 500;
		backdrop-filter: blur(4px);
	}
</style>
