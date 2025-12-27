<script lang="ts">
	/**
	 * MoreMenu - 更多功能菜单
	 * 包含截图、AB循环、滤镜、视频信息
	 */
	import { MoreVertical, Camera, RotateCcw, Sun } from '@lucide/svelte';

	interface Props {
		showMoreMenu: boolean;
		abLoop: { a: number | null; b: number | null };
		abLoopActive: boolean;
		showFilterPanel: boolean;
		brightness: number;
		contrast: number;
		saturate: number;
		videoWidth: number;
		videoHeight: number;
		duration: number;
		formatTime: (seconds: number) => string;
		onToggleMenu: (e: MouseEvent) => void;
		onCaptureScreenshot: () => void;
		onSetLoopPointA: () => void;
		onSetLoopPointB: () => void;
		onClearAbLoop: () => void;
		onToggleFilterPanel: () => void;
		onResetFilters: () => void;
		onBrightnessChange: (value: number) => void;
		onContrastChange: (value: number) => void;
		onSaturateChange: (value: number) => void;
	}

	let {
		showMoreMenu,
		abLoop,
		abLoopActive,
		showFilterPanel,
		brightness,
		contrast,
		saturate,
		videoWidth,
		videoHeight,
		duration,
		formatTime,
		onToggleMenu,
		onCaptureScreenshot,
		onSetLoopPointA,
		onSetLoopPointB,
		onClearAbLoop,
		onToggleFilterPanel,
		onResetFilters,
		onBrightnessChange,
		onContrastChange,
		onSaturateChange
	}: Props = $props();
</script>

<div class="relative">
	<button
		class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {showMoreMenu || abLoopActive ? 'bg-white/20' : ''}"
		onclick={onToggleMenu}
		title="更多功能"
		aria-label="更多功能"
	>
		<MoreVertical class="h-5 w-5 text-primary" />
	</button>

	{#if showMoreMenu}
		<div
			class="absolute bottom-full left-0 mb-2 w-48 rounded-lg bg-black/95 p-2 shadow-lg backdrop-blur-sm"
			onclick={(e) => e.stopPropagation()}
			onmousedown={(e) => e.stopPropagation()}
		>
			<!-- 截图 -->
			<button
				class="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-white hover:bg-white/10"
				onclick={onCaptureScreenshot}
			>
				<Camera class="h-4 w-4" />
				截图
			</button>

			<!-- AB循环 -->
			<div class="border-t border-white/10 pt-2 mt-2">
				<div class="px-3 py-1 text-xs text-white/50">AB循环</div>
				<div class="flex items-center gap-1 px-3 py-1">
					<button
						class="rounded px-3 py-1 text-xs transition-colors {abLoop.a !== null ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}"
						onclick={onSetLoopPointA}
					>
						A{abLoop.a !== null ? `: ${formatTime(abLoop.a)}` : ''}
					</button>
					<button
						class="rounded px-3 py-1 text-xs transition-colors {abLoop.b !== null ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}"
						onclick={onSetLoopPointB}
						disabled={abLoop.a === null}
					>
						B{abLoop.b !== null ? `: ${formatTime(abLoop.b)}` : ''}
					</button>
					{#if abLoopActive}
						<button
							class="rounded bg-white/10 p-1 text-xs text-white hover:bg-white/20"
							onclick={onClearAbLoop}
							title="清除"
						>
							<RotateCcw class="h-3 w-3" />
						</button>
					{/if}
				</div>
			</div>

			<!-- 滤镜 -->
			<div class="border-t border-white/10 pt-2 mt-2">
				<button
					class="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-sm text-white hover:bg-white/10"
					onclick={onToggleFilterPanel}
				>
					<span class="flex items-center gap-2">
						<Sun class="h-4 w-4" />
						视频滤镜
					</span>
					{#if brightness !== 100 || contrast !== 100 || saturate !== 100}
						<span class="text-xs text-primary">已调整</span>
					{/if}
				</button>
				
				{#if showFilterPanel}
					<div class="px-3 py-2 space-y-2">
						<div>
							<div class="flex justify-between text-xs text-white/70 mb-1">
								<span>亮度</span><span>{brightness}%</span>
							</div>
							<input type="range" min="0" max="200" step="5" value={brightness}
								oninput={(e) => onBrightnessChange(parseFloat((e.target as HTMLInputElement).value))}
								class="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer" />
						</div>
						<div>
							<div class="flex justify-between text-xs text-white/70 mb-1">
								<span>对比度</span><span>{contrast}%</span>
							</div>
							<input type="range" min="0" max="200" step="5" value={contrast}
								oninput={(e) => onContrastChange(parseFloat((e.target as HTMLInputElement).value))}
								class="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer" />
						</div>
						<div>
							<div class="flex justify-between text-xs text-white/70 mb-1">
								<span>饱和度</span><span>{saturate}%</span>
							</div>
							<input type="range" min="0" max="200" step="5" value={saturate}
								oninput={(e) => onSaturateChange(parseFloat((e.target as HTMLInputElement).value))}
								class="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer" />
						</div>
						<button
							class="w-full rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
							onclick={onResetFilters}
						>
							重置滤镜
						</button>
					</div>
				{/if}
			</div>

			<!-- 视频信息 -->
			<div class="border-t border-white/10 pt-2 mt-2">
				<div class="px-3 py-1 text-xs text-white/50">视频信息</div>
				<div class="px-3 py-1 space-y-1 text-xs text-white/80">
					{#if videoWidth > 0}
						<div class="flex justify-between">
							<span>分辨率</span>
							<span>{videoWidth}×{videoHeight}</span>
						</div>
						<div class="flex justify-between">
							<span>时长</span>
							<span>{formatTime(duration)}</span>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
