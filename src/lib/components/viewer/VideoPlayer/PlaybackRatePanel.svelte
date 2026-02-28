<script lang="ts">
	/**
	 * PlaybackRatePanel - 播放速度控制面板
	 */
	import { Gauge } from '@lucide/svelte';

	interface Props {
		playbackRate: number;
		showRatePanel: boolean;
		minRate: number;
		maxRate: number;
		rateStep: number;
		onSetRate: (rate: number) => void;
		onSliderChange: (e: Event) => void;
		onTogglePanel: (e: MouseEvent) => void;
	}

	let {
		playbackRate,
		showRatePanel,
		minRate,
		maxRate,
		rateStep,
		onSetRate,
		onSliderChange,
		onTogglePanel
	}: Props = $props();

	const presetRates = [0.5, 1, 1.5, 2];
</script>

<div class="relative">
	<button
		class="control-btn flex items-center gap-1 rounded-full px-2 py-1.5 transition-colors hover:bg-white/20 {showRatePanel ? 'bg-white/20' : ''}"
		onclick={onTogglePanel}
		aria-label="倍速控制"
		title="点击展开倍速调节"
	>
		<Gauge class="h-4 w-4 text-primary" />
		<span class="text-xs text-primary">{playbackRate.toFixed(2)}x</span>
	</button>
	{#if showRatePanel}
		<div class="absolute bottom-full right-0 mb-2 rounded-lg bg-black/95 p-3 shadow-lg"
			style="min-width: 160px;"
			role="dialog"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onmousedown={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}>
			<div class="flex items-center gap-2 mb-2">
				<input type="range" min={minRate} max={maxRate} step={rateStep}
					value={playbackRate} oninput={onSliderChange}
					class="w-24 h-1 bg-white/20 rounded appearance-none cursor-pointer" />
				<span class="text-xs text-white shrink-0">{playbackRate.toFixed(2)}x</span>
			</div>
			<div class="flex flex-wrap gap-1">
				{#each presetRates as rate}
					<button class="px-2 py-0.5 text-xs rounded {playbackRate === rate ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}"
						onclick={() => onSetRate(rate)}>{rate}x</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
