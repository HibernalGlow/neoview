<script lang="ts">
	/**
	 * SlideshowPanel - 幻灯片设置面板
	 * 包含播放控制、间隔时间、循环和随机模式
	 */
	import { Button } from '$lib/components/ui/button';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Play, Pause } from '@lucide/svelte';
	import { slideshowStore } from '$lib/stores/slideshow.svelte';
	import { bookStore } from '$lib/stores/book.svelte';

	// Props
	interface Props {
		expanded: boolean;
	}
	let { expanded }: Props = $props();

	// 本地状态
	let slideshowInterval = $state(slideshowStore.interval);

	// 处理间隔时间变更
	function handleSlideshowIntervalChange() {
		slideshowStore.setInterval(slideshowInterval);
	}

	// 开始/暂停幻灯片
	function startSlideshow() {
		window.dispatchEvent(
			new CustomEvent('neoview-viewer-action', {
				detail: { action: 'slideshowToggle' }
			})
		);
	}
</script>

{#if expanded && bookStore.currentBook}
	<div class="flex flex-wrap items-center justify-center gap-2 border-t border-border/50 pt-1">
		<span class="text-muted-foreground mr-2 text-xs">幻灯片</span>
		
		<!-- 播放/暂停按钮 -->
		<Button
			variant={slideshowStore.isPlaying ? 'default' : 'outline'}
			size="sm"
			class="h-7 px-3"
			onclick={startSlideshow}
		>
			{#if slideshowStore.isPlaying}
				<Pause class="mr-1 h-3 w-3" />
				暂停
			{:else}
				<Play class="mr-1 h-3 w-3" />
				开始
			{/if}
		</Button>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<!-- 间隔时间 -->
		<span class="text-muted-foreground text-xs">间隔</span>
		<div class="flex items-center gap-1">
			<input
				type="range"
				min="1"
				max="30"
				step="1"
				bind:value={slideshowInterval}
				oninput={handleSlideshowIntervalChange}
				class="h-1 w-20 cursor-pointer appearance-none rounded-full bg-muted"
			/>
			<span class="w-8 text-center text-xs">{slideshowInterval}s</span>
		</div>

		<!-- 快速设置 -->
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			{#each [3, 5, 10, 15] as sec}
				<Button
					variant={slideshowInterval === sec ? 'default' : 'ghost'}
					size="sm"
					class="h-6 w-8 rounded-full px-1 text-xs"
					onclick={() => {
						slideshowInterval = sec;
						slideshowStore.setInterval(sec);
					}}
				>
					{sec}s
				</Button>
			{/each}
		</div>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<!-- 循环模式 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={slideshowStore.loop ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={() => slideshowStore.setLoop(!slideshowStore.loop)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>循环播放{slideshowStore.loop ? '（开）' : '（关）'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 随机模式 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={slideshowStore.random ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={() => slideshowStore.setRandom(!slideshowStore.random)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>随机播放{slideshowStore.random ? '（开）' : '（关）'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 进度显示 -->
		{#if slideshowStore.isPlaying}
			<Separator.Root orientation="vertical" class="mx-2 h-5" />
			<div class="flex items-center gap-1">
				<div class="relative h-6 w-6">
					<svg class="h-6 w-6 -rotate-90 transform" viewBox="0 0 36 36">
						<circle
							cx="18"
							cy="18"
							r="15"
							fill="none"
							stroke="currentColor"
							stroke-opacity="0.2"
							stroke-width="3"
						/>
						<circle
							cx="18"
							cy="18"
							r="15"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-dasharray="94.2"
							stroke-dashoffset={94.2 - (slideshowStore.progress / 100) * 94.2}
							stroke-linecap="round"
							class="text-primary transition-all duration-200"
						/>
					</svg>
				</div>
				<span class="text-xs">{Math.ceil(slideshowStore.remainingTime)}s</span>
			</div>
		{/if}
	</div>
{/if}
