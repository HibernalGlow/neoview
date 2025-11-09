<script lang="ts">
	/**
	 * NeoView - Status Bar Component
	 * 状态栏组件 (Svelte 5 Runes)
	 */
	import { bookStore } from '$lib/stores/book.svelte';
	import { zoomLevel } from '$lib/stores';
</script>

<div class="h-6 bg-secondary/30 flex items-center justify-between px-3 text-xs border-t">
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
