<script lang="ts">
/**
 * AI 面板 - 纯容器，使用 CardRenderer 渲染卡片
 */
import { Bot } from '@lucide/svelte';
import { cardConfigStore } from '$lib/stores/cardConfig.svelte';
import CardRenderer from '$lib/cards/CardRenderer.svelte';

// 从 cardConfigStore 获取可见卡片（已排序）
const visibleCards = $derived(cardConfigStore.getPanelCards('ai').filter(c => c.visible));
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- 滚动容器 -->
	<div class="flex-1 space-y-2 overflow-y-auto p-2">
		{#if visibleCards.length > 0}
			{#each visibleCards as card (card.id)}
				<div style="order: {card.order}">
					<CardRenderer cardId={card.id} panelId="ai" />
				</div>
			{/each}
		{:else}
			<div class="flex flex-col items-center justify-center py-8 text-center">
				<Bot class="h-12 w-12 text-muted-foreground/50" />
				<p class="mt-2 text-sm text-muted-foreground">暂无卡片</p>
				<p class="text-xs text-muted-foreground">请在面板设置中添加卡片</p>
			</div>
		{/if}
	</div>
</div>
