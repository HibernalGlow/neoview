<script lang="ts">
	/**
	 * VolumePanel - 音量控制面板
	 */
	import { Volume2, VolumeX } from '@lucide/svelte';

	interface Props {
		volume: number;
		isMuted: boolean;
		showVolumePanel: boolean;
		onToggleMute: () => void;
		onVolumeChange: (e: Event) => void;
		onTogglePanel: (e: MouseEvent) => void;
	}

	let {
		volume,
		isMuted,
		showVolumePanel,
		onToggleMute,
		onVolumeChange,
		onTogglePanel
	}: Props = $props();
</script>

<div class="relative">
	<button
		class="control-btn flex items-center gap-1 rounded-full px-2 py-1.5 transition-colors hover:bg-white/20 {showVolumePanel ? 'bg-white/20' : ''}"
		onclick={onTogglePanel}
		aria-label="音量控制"
		title="点击展开音量调节"
	>
		{#if isMuted || volume === 0}
			<VolumeX class="h-4 w-4 text-primary" />
		{:else}
			<Volume2 class="h-4 w-4 text-primary" />
		{/if}
		<span class="text-xs text-primary">{Math.round(volume * 100)}%</span>
	</button>
	{#if showVolumePanel}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute bottom-full right-0 mb-2 rounded-lg bg-black/95 p-3 shadow-lg"
			style="min-width: 140px;"
			onclick={(e) => e.stopPropagation()}
			onmousedown={(e) => e.stopPropagation()}>
			<div class="flex items-center gap-2">
				<button onclick={onToggleMute} class="shrink-0 p-1 hover:bg-white/20 rounded">
					{#if isMuted || volume === 0}
						<VolumeX class="h-4 w-4 text-white" />
					{:else}
						<Volume2 class="h-4 w-4 text-white" />
					{/if}
				</button>
				<input type="range" min="0" max="1" step="0.05" value={volume}
					oninput={onVolumeChange}
					class="w-20 h-1 bg-white/20 rounded appearance-none cursor-pointer" />
			</div>
		</div>
	{/if}
</div>
