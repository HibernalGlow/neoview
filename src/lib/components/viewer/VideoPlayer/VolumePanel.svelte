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

	let { volume, isMuted, showVolumePanel, onToggleMute, onVolumeChange, onTogglePanel }: Props =
		$props();
</script>

<div class="relative">
	<button
		class="control-btn flex items-center gap-1 rounded-full px-2 py-1.5 transition-colors hover:bg-white/20 {showVolumePanel
			? 'bg-white/20'
			: ''}"
		onclick={onTogglePanel}
		aria-label="音量控制"
		title="点击展开音量调节"
	>
		{#if isMuted || volume === 0}
			<VolumeX class="text-primary h-4 w-4" />
		{:else}
			<Volume2 class="text-primary h-4 w-4" />
		{/if}
		<span class="text-primary text-xs">{Math.round(volume * 100)}%</span>
	</button>
	{#if showVolumePanel}
		<div
			class="absolute right-0 bottom-full mb-2 rounded-lg bg-black/95 p-3 shadow-lg"
			style="min-width: 140px;"
			role="dialog"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onmousedown={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="flex items-center gap-2">
				<button onclick={onToggleMute} class="shrink-0 rounded p-1 hover:bg-white/20">
					{#if isMuted || volume === 0}
						<VolumeX class="h-4 w-4 text-white" />
					{:else}
						<Volume2 class="h-4 w-4 text-white" />
					{/if}
				</button>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={volume}
					oninput={onVolumeChange}
					class="h-1 w-20 cursor-pointer appearance-none rounded bg-white/20"
				/>
			</div>
		</div>
	{/if}
</div>
