<script lang="ts">
	/**
	 * NeoView - Status Bar Component
	 * 状态栏组件 - 自动隐藏 (Svelte 5 Runes)
	 */
	import { bookStore } from '$lib/stores/book.svelte';
	import { zoomLevel } from '$lib/stores';

	let isVisible = $state(false);
	let hideTimeout: number | undefined;

	function showStatusBar() {
		isVisible = true;
		if (hideTimeout) clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			isVisible = false;
		}, 2000) as unknown as number;
	}

	function handleMouseEnter() {
		showStatusBar();
	}

	function handleMouseLeave() {
		if (hideTimeout) clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			isVisible = false;
		}, 500) as unknown as number;
	}
</script>

<div
	class="absolute bottom-0 left-0 right-0 z-50 transition-transform duration-300 {isVisible
		? 'translate-y-0'
		: 'translate-y-full'}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<div class="h-6 bg-secondary/95 backdrop-blur-sm flex items-center justify-between px-3 text-xs border-t">
		<!-- 左侧：书籍信息 -->
		<div class="flex items-center gap-4">
			{#if bookStore.currentBook}
				<span class="font-medium">{bookStore.currentBook.name}</span>
				<span class="text-muted-foreground">
					Page {bookStore.currentPageIndex + 1} / {bookStore.totalPages}
				</span>
			{:else}
				<span class="text-muted-foreground">No book opened</span>
			{/if}
		</div>

		<!-- 右侧：缩放信息 -->
		<div class="flex items-center gap-4">
			<span class="text-muted-foreground">Zoom: {($zoomLevel * 100).toFixed(0)}%</span>
		</div>
	</div>
</div>

<!-- 触发区域（独立于状态栏，始终存在） -->
<div
	class="fixed bottom-0 left-0 right-0 h-4 z-[49]"
	onmouseenter={handleMouseEnter}
	role="presentation"
	aria-label="底部状态栏触发区域"
></div>
