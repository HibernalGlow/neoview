<script lang="ts">
	/**
	 * VideoProgressBar - 视频进度条组件
	 * 包含进度条、预览缩略图、时间显示
	 */

	interface Props {
		currentTime: number;
		duration: number;
		onSeek: (e: MouseEvent) => void;
		previewVisible: boolean;
		previewTime: number;
		previewX: number;
		formatTime: (seconds: number) => string;
		onProgressHover: (e: MouseEvent) => void;
		onProgressLeave: () => void;
	}

	let {
		currentTime,
		duration,
		onSeek,
		previewVisible,
		previewTime,
		previewX,
		formatTime,
		onProgressHover,
		onProgressLeave
	}: Props = $props();

	let progressBarRef = $state<HTMLDivElement | null>(null);
	let previewCanvas = $state<HTMLCanvasElement | null>(null);

	// 导出 canvas 引用供父组件使用
	export function getPreviewCanvas(): HTMLCanvasElement | null {
		return previewCanvas;
	}

	export function getProgressBarRef(): HTMLDivElement | null {
		return progressBarRef;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	bind:this={progressBarRef}
	class="progress-bar relative mb-4 h-1 w-full cursor-pointer rounded-full bg-primary/40 transition-all hover:h-1.5"
	onclick={onSeek}
	onmousemove={onProgressHover}
	onmouseleave={onProgressLeave}
	role="presentation"
>
	<div
		class="progress-fill h-full rounded-full bg-primary"
		style="width: {duration > 0 ? (currentTime / duration) * 100 : 0}%"
	></div>
	
	<!-- 进度条预览提示 -->
	{#if previewVisible && duration > 0}
		<div
			class="preview-tooltip absolute bottom-full mb-2 -translate-x-1/2 transform"
			style="left: {Math.max(80, Math.min(previewX, (progressBarRef?.offsetWidth ?? 0) - 80))}px;"
		>
			<!-- 预览缩略图 -->
			<div class="preview-frame mb-1 overflow-hidden rounded border border-white/20 bg-black shadow-lg">
				<canvas
					bind:this={previewCanvas}
					class="preview-canvas"
					width="160"
					height="90"
				></canvas>
			</div>
			<!-- 时间显示 -->
			<div class="preview-time rounded bg-black/80 px-2 py-0.5 text-center text-xs text-white">
				{formatTime(previewTime)}
			</div>
		</div>
	{/if}
</div>

<style>
	.progress-bar {
		position: relative;
	}

	.progress-fill {
		pointer-events: none;
	}

	.preview-tooltip {
		pointer-events: none;
		z-index: 100;
	}

	.preview-canvas {
		display: block;
		width: 160px;
		height: auto;
		min-height: 60px;
		background: #000;
	}
</style>
