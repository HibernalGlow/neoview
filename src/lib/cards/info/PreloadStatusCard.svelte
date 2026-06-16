<script lang="ts">
/**
 * 预加载状态卡片
 * 预加载逻辑已迁移至后端，此卡片仅显示提示信息
 */
import { bookStore } from '$lib/stores/book.svelte';

const totalPages = $derived(bookStore.totalPages);
const currentPageIndex = $derived(bookStore.currentPageIndex);
</script>

<div class="space-y-3 text-xs">
	<div class="text-center text-muted-foreground py-4">
		<p class="text-sm">预加载状态已迁移至后端</p>
		<p class="text-[10px] mt-1">当前页: {currentPageIndex + 1} / {totalPages}</p>
	</div>
</div>
