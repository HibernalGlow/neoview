<!--
  SlideshowControl - 幻灯片播放控制组件
  显示在查看器上方，提供播放/暂停/停止控制和设置
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Play,
		Pause,
		Square,
		SkipForward,
		Settings,
		Repeat,
		Shuffle,
		Timer,
		X
	} from '@lucide/svelte';
	import { slideshowStore } from '$lib/stores/slideshow.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { fade, fly } from 'svelte/transition';

	// 获取阅读方向
	let settings = $state(settingsManager.getSettings());
	let isRTL = $derived(settings.book.readingDirection === 'right-to-left');
	
	// 监听设置变化
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	const {
		onNextPage,
		onRandomPage,
		getTotalPages,
		getCurrentIndex,
		visible = false,
		onClose
	}: {
		onNextPage: () => void;
		onRandomPage?: (index: number) => void;
		getTotalPages?: () => number;
		getCurrentIndex?: () => number;
		visible?: boolean;
		onClose?: () => void;
	} = $props();

	let showSettings = $state(false);
	let intervalInput = $state(slideshowStore.interval);

	// 注册回调
	onMount(() => {
		slideshowStore.registerCallbacks({
			nextPage: onNextPage,
			randomPage: onRandomPage,
			getTotalPages,
			getCurrentIndex
		});
	});

	onDestroy(() => {
		slideshowStore.destroy();
	});

	function handleIntervalChange() {
		slideshowStore.setInterval(intervalInput);
	}

	function formatTime(seconds: number): string {
		if (seconds <= 0) return '0s';
		if (seconds < 60) return `${Math.ceil(seconds)}s`;
		const mins = Math.floor(seconds / 60);
		const secs = Math.ceil(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

{#if visible}
	<div
		class="slideshow-control fixed left-1/2 top-4 z-50 -translate-x-1/2 transform"
		transition:fly={{ y: -20, duration: 200 }}
	>
		<!-- 主控制栏 -->
		<div
			class="flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 shadow-lg backdrop-blur-sm"
		>
			<!-- 播放/暂停 -->
			<button
				class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
				onclick={() => slideshowStore.toggle()}
				title={slideshowStore.isPlaying ? '暂停 (Space)' : '播放 (Space)'}
			>
				{#if slideshowStore.isPlaying}
					<Pause class="h-5 w-5 text-white" />
				{:else}
					<Play class="h-5 w-5 text-white" />
				{/if}
			</button>

			<!-- 停止 -->
			<button
				class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
				onclick={() => slideshowStore.stop()}
				title="停止"
				disabled={slideshowStore.isStopped}
				class:opacity-40={slideshowStore.isStopped}
			>
				<Square class="h-4 w-4 text-white" />
			</button>

			<!-- 跳过 -->
			<button
				class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
				onclick={() => slideshowStore.skip()}
				title="跳过当前"
				disabled={slideshowStore.isStopped}
				class:opacity-40={slideshowStore.isStopped}
			>
				<SkipForward class="h-4 w-4 text-white" />
			</button>

			<!-- 分隔线 -->
			<div class="mx-1 h-6 w-px bg-white/30"></div>

			<!-- 进度显示 -->
			{#if slideshowStore.showTimer && !slideshowStore.isStopped}
				<div class="flex items-center gap-2">
					<!-- 环形进度 -->
					<div class="relative h-8 w-8">
						<svg class="h-8 w-8 -rotate-90 transform" viewBox="0 0 36 36">
							<!-- 背景圆 -->
							<circle
								cx="18"
								cy="18"
								r="15"
								fill="none"
								stroke="rgba(255,255,255,0.2)"
								stroke-width="3"
							/>
							<!-- 进度圆 -->
							<circle
								cx="18"
								cy="18"
								r="15"
								fill="none"
								stroke="var(--primary, #3b82f6)"
								stroke-width="3"
								stroke-dasharray="94.2"
								stroke-dashoffset={94.2 - (slideshowStore.progress / 100) * 94.2}
								stroke-linecap="round"
								class="transition-all duration-200"
							/>
						</svg>
						<!-- 中心时间 -->
						<div
							class="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white"
						>
							{Math.ceil(slideshowStore.remainingTime)}
						</div>
					</div>
				</div>
			{/if}

			<!-- 循环模式 -->
			<button
				class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {slideshowStore.loop
					? 'bg-white/20'
					: ''}"
				onclick={() => slideshowStore.setLoop(!slideshowStore.loop)}
				title={slideshowStore.loop ? '循环播放已开启' : '循环播放已关闭'}
			>
				<Repeat class="h-4 w-4 text-white {slideshowStore.loop ? '' : 'opacity-50'}" />
			</button>

			<!-- 随机模式 -->
			<button
				class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {slideshowStore.random
					? 'bg-white/20'
					: ''}"
				onclick={() => slideshowStore.setRandom(!slideshowStore.random)}
				title={slideshowStore.random ? '随机播放已开启' : '随机播放已关闭'}
			>
				<Shuffle class="h-4 w-4 text-white {slideshowStore.random ? '' : 'opacity-50'}" />
			</button>

			<!-- 设置 -->
			<button
				class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {showSettings
					? 'bg-white/20'
					: ''}"
				onclick={() => (showSettings = !showSettings)}
				title="幻灯片设置"
			>
				<Settings class="h-4 w-4 text-white" />
			</button>

			<!-- 关闭 -->
			{#if onClose}
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={() => {
						slideshowStore.stop();
						onClose?.();
					}}
					title="关闭幻灯片"
				>
					<X class="h-4 w-4 text-white" />
				</button>
			{/if}
		</div>

		<!-- 设置面板 -->
		{#if showSettings}
			<div
				class="settings-panel absolute left-1/2 mt-2 w-64 -translate-x-1/2 transform rounded-lg bg-black/90 p-4 shadow-lg backdrop-blur-sm"
				transition:fade={{ duration: 150 }}
			>
				<h3 class="mb-3 flex items-center gap-2 text-sm font-medium text-white">
					<Timer class="h-4 w-4" />
					幻灯片设置
				</h3>

				<!-- 间隔时间 -->
				<div class="mb-4">
					<label for="slideshow-interval" class="mb-1 block text-xs text-white/70">切换间隔（秒）</label>
					<div class="flex items-center gap-2">
						<input
							id="slideshow-interval"
							type="range"
							min="1"
							max="30"
							step="1"
							bind:value={intervalInput}
							oninput={handleIntervalChange}
							class="slider h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20"
						/>
						<span class="w-8 text-right text-sm text-white">{intervalInput}s</span>
					</div>
				</div>

				<!-- 快速设置 -->
				<div class="mb-4">
					<p class="mb-1 block text-xs text-white/70">快速设置</p>
					<div class="flex gap-1">
						{#each [3, 5, 10, 15, 30] as sec}
							<button
								class="flex-1 rounded bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20 {intervalInput === sec ? 'bg-primary/50' : ''}"
								onclick={() => {
									intervalInput = sec;
									slideshowStore.setInterval(sec);
								}}
							>
								{sec}s
							</button>
						{/each}
					</div>
				</div>

				<!-- 淡入淡出 -->
				<label class="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={slideshowStore.fadeTransition}
						onchange={() => slideshowStore.setFadeTransition(!slideshowStore.fadeTransition)}
						class="h-4 w-4 rounded border-white/30 bg-white/10"
					/>
					<span class="text-sm text-white">淡入淡出过渡</span>
				</label>

				<!-- 显示计时器 -->
				<label class="mt-2 flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={slideshowStore.showTimer}
						onchange={() => slideshowStore.setShowTimer(!slideshowStore.showTimer)}
						class="h-4 w-4 rounded border-white/30 bg-white/10"
					/>
					<span class="text-sm text-white">显示计时器</span>
				</label>
			</div>
		{/if}
	</div>

	<!-- 底部进度条（可选）- 跟随阅读方向 -->
	{#if slideshowStore.isPlaying && slideshowStore.showTimer}
		<div
			class="slideshow-progress fixed bottom-0 left-0 right-0 z-40 h-0.5 bg-white/20"
			transition:fade={{ duration: 100 }}
		>
			<div
				class="h-full bg-primary transition-all duration-1000 ease-linear"
				style="width: {slideshowStore.progress}%; {isRTL ? 'margin-left: auto;' : ''}"
			></div>
		</div>
	{/if}
{/if}

<style>
	.slider::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--primary, #3b82f6);
		cursor: pointer;
	}

	.slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--primary, #3b82f6);
		cursor: pointer;
		border: none;
	}
</style>
