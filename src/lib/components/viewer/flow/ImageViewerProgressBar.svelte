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
	const preUpscaledCount = $derived(furthestPreUpscaledIndex >= 0 ? furthestPreUpscaledIndex + 1 : 0);
	const preUpscaleExtent = $derived(totalPages > 0 && preUpscaledCount > 0 ? (preUpscaledCount / totalPages) * 100 : 0);
	const preUpscaleBarWidth = $derived(preUpscaleProgress > 0 ? preUpscaleProgress : preUpscaleExtent);

	// 根据当前页面状态和全局状态计算进度条状态
	const currentPageStatus = $derived(totalPages > 0 ? bookStore.getPageUpscaleStatus(currentPageIndex) : 'none');
	const isCurrentPageUpscaling = $derived(upscaleState.isUpscaling && upscaleState.currentImageHash !== null);
	
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
		} else {
			progressColor = '#FDFBF7'; // 奶白色
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
					class="preup-bar"
					style={`width: ${Math.min(preUpscaleBarWidth, 100)}%;`}
				></div>
			{/if}

			<!-- 上层：阅读进度 + 当前页状态 -->
			<div
				class={`reading-bar ${progressBlinking ? 'animate-pulse' : ''}`}
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
		height: 1.25rem;
		padding: 0.1rem 0.5rem 0.35rem;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
	}

	.bar-track {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.bar-track.rtl {
		transform: scaleX(-1);
		transform-origin: center;
	}

	.preup-bar {
		position: absolute;
		left: 0;
		bottom: 0.35rem;
		height: 0.15rem;
		background-color: rgba(250, 204, 21, 0.9);
		transition: width 0.4s ease;
		border-radius: 999px;
	}

	.reading-bar {
		position: absolute;
		left: 0;
		bottom: 0.35rem;
		height: 0.3rem;
		border-radius: 999px;
		transition: width 0.3s ease, background-color 0.3s ease;
	}

	.progress-info {
		position: absolute;
		left: 0.5rem;
		right: 0.5rem;
		bottom: 0;
		display: flex;
		justify-content: space-between;
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.85);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
		pointer-events: none;
	}

	.info-left, .info-right {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.status {
		padding: 0.05rem 0.35rem;
		border-radius: 999px;
		font-size: 0.6rem;
		text-shadow: none;
	}

	.status.in-progress {
		background: rgba(255, 255, 255, 0.9);
		color: #111;
	}

	.status.done {
		background: rgba(187, 247, 208, 0.9);
		color: #14532d;
	}

	.status.failed {
		background: rgba(248, 113, 113, 0.9);
		color: #450a0a;
	}

	.preup-label {
		background: rgba(250, 204, 21, 0.85);
		color: #78350f;
		border-radius: 999px;
		padding: 0.05rem 0.4rem;
		text-shadow: none;
		font-size: 0.6rem;
	}
</style>
