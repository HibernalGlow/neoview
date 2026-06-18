<script lang="ts">
	/**
	 * VideoControls - 视频控制按钮组件
	 * 包含播放/暂停、快进/快退、循环模式等基本控制
	 */
	import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1 } from '@lucide/svelte';

	type LoopMode = 'none' | 'list' | 'single';

	interface Props {
		isPlaying: boolean;
		loopMode: LoopMode;
		onTogglePlay: () => void;
		onSkipBackward: () => void;
		onSkipForward: () => void;
		onCycleLoopMode: () => void;
	}

	let { isPlaying, loopMode, onTogglePlay, onSkipBackward, onSkipForward, onCycleLoopMode }: Props =
		$props();
</script>

<!-- 播放/暂停 -->
<button
	class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
	onclick={onTogglePlay}
	aria-label={isPlaying ? '暂停' : '播放'}
>
	{#if isPlaying}
		<Pause class="text-primary h-6 w-6" />
	{:else}
		<Play class="text-primary h-6 w-6" />
	{/if}
</button>

<!-- 快退 -->
<button
	class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
	onclick={onSkipBackward}
	aria-label="后退10秒"
>
	<SkipBack class="text-primary h-5 w-5" />
</button>

<!-- 快进 -->
<button
	class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
	onclick={onSkipForward}
	aria-label="前进10秒"
>
	<SkipForward class="text-primary h-5 w-5" />
</button>

<!-- 循环模式 -->
<button
	class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
	onclick={(event) => {
		event.stopPropagation();
		onCycleLoopMode();
	}}
	aria-label={loopMode === 'none' ? '不循环' : loopMode === 'single' ? '单个循环' : '列表循环'}
>
	{#if loopMode === 'single'}
		<Repeat1 class="text-primary h-5 w-5" />
	{:else if loopMode === 'list'}
		<Repeat class="text-primary h-5 w-5" />
	{:else}
		<Repeat class="text-primary h-5 w-5 opacity-40" />
	{/if}
</button>
