<script lang="ts">
	/**
	 * NeoView - Status Bar Component
	 * 状态栏组件
	 */
	import { currentBook, currentPageIndex, totalPages } from '$lib/stores';
	import { zoomLevel } from '$lib/stores';
</script>

<div class="h-6 bg-secondary/30 flex items-center justify-between px-3 text-xs border-t">
	<!-- 左侧：书籍信息 -->
	<div class="flex items-center gap-4">
		{#if $currentBook}
			<span class="font-medium">{$currentBook.name}</span>
			<span class="text-muted-foreground">
				Page {$currentPageIndex + 1} / {$totalPages}
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
