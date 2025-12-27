<script lang="ts">
	/**
	 * SubtitlePanel - 字幕设置面板
	 */
	import { Captions, CaptionsOff } from '@lucide/svelte';
	import type { SubtitleData } from '$lib/utils/subtitleUtils';

	interface Props {
		subtitle: SubtitleData | null;
		showSubtitleSettings: boolean;
		subtitleFontSize: number;
		subtitleColor: string;
		subtitleBgOpacity: number;
		subtitleBottom: number;
		onSelectSubtitle: () => void;
		onToggleSettings: (e: MouseEvent) => void;
		onFontSizeChange: (value: number) => void;
		onColorChange: (value: string) => void;
		onBgOpacityChange: (value: number) => void;
		onBottomChange: (value: number) => void;
		onReset: () => void;
		onSave: () => void;
		onApplyPreset: (preset: 'large-yellow') => void;
	}

	let {
		subtitle,
		showSubtitleSettings,
		subtitleFontSize,
		subtitleColor,
		subtitleBgOpacity,
		subtitleBottom,
		onSelectSubtitle,
		onToggleSettings,
		onFontSizeChange,
		onColorChange,
		onBgOpacityChange,
		onBottomChange,
		onReset,
		onSave,
		onApplyPreset
	}: Props = $props();

	const colorPresets = ['#ffffff', '#ffff00', '#00ff00', '#00ffff', '#ff9900'];
</script>

<div class="relative">
	<button
		class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {subtitle ? 'bg-white/20' : ''}"
		onclick={(event) => {
			event.stopPropagation();
			onSelectSubtitle();
		}}
		oncontextmenu={onToggleSettings}
		title={subtitle ? `字幕: ${subtitle.filename}（左键更换，右键设置）` : '左键选择字幕，右键设置'}
		aria-label={subtitle ? '更换字幕' : '选择字幕'}
	>
		{#if subtitle}
			<Captions class="h-5 w-5 text-primary" />
		{:else}
			<CaptionsOff class="h-5 w-5 text-primary opacity-40" />
		{/if}
	</button>

	<!-- 字幕设置面板 -->
	{#if showSubtitleSettings}
		<div
			class="absolute bottom-full right-0 mb-2 w-64 rounded-lg bg-black/90 p-4 shadow-lg backdrop-blur-sm"
			onclick={(e) => e.stopPropagation()}
			onmousedown={(e) => e.stopPropagation()}
		>
			<div class="mb-3 flex items-center justify-between">
				<span class="text-sm font-medium text-white">字幕设置</span>
				<button
					class="text-white/60 hover:text-white"
					onclick={onToggleSettings}
				>
					✕
				</button>
			</div>

			<!-- 字体大小 -->
			<div class="mb-3">
				<span class="mb-1 block text-xs text-white/70">字体大小</span>
				<div class="flex items-center gap-2">
					<input
						type="range"
						min="0.5"
						max="3"
						step="0.1"
						value={subtitleFontSize}
						oninput={(e) => onFontSizeChange(parseFloat((e.target as HTMLInputElement).value))}
						class="subtitle-slider h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20"
					/>
					<span class="w-10 text-right text-xs text-white">{subtitleFontSize.toFixed(1)}em</span>
				</div>
			</div>

			<!-- 字幕位置 -->
			<div class="mb-3">
				<span class="mb-1 block text-xs text-white/70">底部距离</span>
				<div class="flex items-center gap-2">
					<input
						type="range"
						min="0"
						max="30"
						step="1"
						value={subtitleBottom}
						oninput={(e) => onBottomChange(parseFloat((e.target as HTMLInputElement).value))}
						class="subtitle-slider h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20"
					/>
					<span class="w-10 text-right text-xs text-white">{subtitleBottom}%</span>
				</div>
			</div>

			<!-- 字幕颜色 -->
			<div class="mb-3">
				<span class="mb-1 block text-xs text-white/70">字幕颜色</span>
				<div class="flex gap-2">
					{#each colorPresets as color}
						<button
							class="h-6 w-6 rounded border-2 transition-transform hover:scale-110 {subtitleColor === color ? 'border-primary' : 'border-transparent'}"
							style="background-color: {color}"
							onclick={() => onColorChange(color)}
							title={color}
						></button>
					{/each}
				</div>
			</div>

			<!-- 背景透明度 -->
			<div class="mb-3">
				<span class="mb-1 block text-xs text-white/70">背景透明度</span>
				<div class="flex items-center gap-2">
					<input
						type="range"
						min="0"
						max="1"
						step="0.1"
						value={subtitleBgOpacity}
						oninput={(e) => onBgOpacityChange(parseFloat((e.target as HTMLInputElement).value))}
						class="subtitle-slider h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20"
					/>
					<span class="w-10 text-right text-xs text-white">{Math.round(subtitleBgOpacity * 100)}%</span>
				</div>
			</div>

			<!-- 预设和保存按钮 -->
			<div class="flex gap-2">
				<button
					class="flex-1 rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
					onclick={onReset}
					title="重置为默认值"
				>
					重置
				</button>
				<button
					class="flex-1 rounded bg-primary/50 px-2 py-1 text-xs text-white hover:bg-primary/70"
					onclick={onSave}
					title="保存设置"
				>
					保存
				</button>
			</div>
			<div class="mt-2 flex gap-2">
				<button
					class="flex-1 rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
					onclick={() => onApplyPreset('large-yellow')}
					title="大号黄色字幕"
				>
					大号黄色
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.subtitle-slider::-webkit-slider-thumb {
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--primary);
		cursor: pointer;
	}
</style>
