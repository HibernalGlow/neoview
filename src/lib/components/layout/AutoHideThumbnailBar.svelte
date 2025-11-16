<script lang="ts">
	/**
	 * Auto-hide Thumbnail Bar
	 * 自动隐藏的底部缩略图栏
	 */
	import { Image as ImageIcon } from '@lucide/svelte';

	let isVisible = $state(false);
	let hideTimer: number | null = null;
	let currentPage = $state(15);

	// 缩略图数据（模拟）
	let thumbnails = $state(
		Array.from({ length: 200 }, (_, i) => ({
			index: i + 1,
			url: '', // 实际应从后端获取
			width: 1920,
			height: 1080
		}))
	);

	// 鼠标进入底部区域
	function handleMouseEnter() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		isVisible = true;
	}

	// 鼠标离开底部区域
	function handleMouseLeave() {
		hideTimer = setTimeout(() => {
			isVisible = false;
		}, 1000) as unknown as number;
	}

	// 跳转到指定页
	function goToPage(index: number) {
		currentPage = index;
		// TODO: 发送事件切换页面
		console.log('跳转到页面', index);
	}

	// 自动滚动到当前页
	$effect(() => {
		if (isVisible) {
			const container = document.getElementById('thumbnail-container');
			const currentThumb = document.getElementById(`thumb-${currentPage}`);
			if (container && currentThumb) {
				currentThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
			}
		}
	});
</script>

<!-- 鼠标触发区域（底部隐形条） -->
<div
	class="fixed bottom-0 left-0 right-0 h-4 z-40"
	onmouseenter={handleMouseEnter}
	role="presentation"
></div>

<!-- 缩略图栏容器 -->
<div
	class="fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 {isVisible
		? 'translate-y-0'
		: 'translate-y-full'}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="toolbar"
>
	<div class="bg-background/95 backdrop-blur-sm border-t shadow-lg">
		<div class="h-32 p-2">
			<!-- 缩略图滚动容器 -->
			<div
				id="thumbnail-container"
				class="h-full overflow-x-auto overflow-y-hidden flex gap-2 items-center"
			>
				{#each thumbnails as thumb}
					<button
						id="thumb-{thumb.index}"
						class="flex-shrink-0 h-full aspect-[3/4] rounded border-2 transition-all hover:border-primary {currentPage ===
						thumb.index
							? 'border-primary ring-2 ring-primary/30 scale-105'
							: 'border-transparent hover:border-muted-foreground/50'}"
						onclick={() => goToPage(thumb.index)}
					>
						<div
							class="w-full h-full rounded bg-muted flex flex-col items-center justify-center overflow-hidden"
						>
							{#if thumb.url}
								<img src={thumb.url} alt="Page {thumb.index}" class="w-full h-full object-cover" />
							{:else}
								<ImageIcon class="h-8 w-8 text-muted-foreground mb-1" />
								<span class="text-xs font-mono text-muted-foreground">{thumb.index}</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- 页码指示器 -->
		<div
			class="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full shadow-lg"
		>
			{currentPage} / {thumbnails.length}
		</div>
	</div>
</div>

<style>
	/* 自定义滚动条 */
	#thumbnail-container::-webkit-scrollbar {
		height: 6px;
	}

	#thumbnail-container::-webkit-scrollbar-track {
		background: transparent;
	}

	#thumbnail-container::-webkit-scrollbar-thumb {
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 3px;
	}

	#thumbnail-container::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--muted-foreground) / 0.5);
	}
</style>
