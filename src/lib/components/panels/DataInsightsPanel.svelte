<script lang="ts">
/**
 * NeoView - Data Insights Panel Component
 * 数据洞察面板 - 纯容器，使用 CardRenderer 渲染卡片
 */
import { BarChart3 } from '@lucide/svelte';
import { cardConfigStore } from '$lib/stores/cardConfig.svelte';
import CardRenderer from '$lib/cards/CardRenderer.svelte';

// 从 cardConfigStore 获取可见卡片（已排序）
const visibleCards = $derived(cardConfigStore.getPanelCards('insights').filter(c => c.visible));
</script>

<div 
	class="h-full flex flex-col"
	role="region"
	aria-label="数据洞察面板"
>
	<!-- 标题栏 -->
	<div class="px-4 pt-3 pb-2">
		<div class="flex items-center gap-2">
			<BarChart3 class="h-5 w-5" />
			<div>
				<h3 class="font-semibold">数据洞察</h3>
				<p class="text-xs text-muted-foreground">历史 · 书签 · 标签</p>
			</div>
		</div>
	</div>

	<div class="flex-1 overflow-auto">
		<div class="px-4 pb-4 flex flex-col space-y-3">
			{#if visibleCards.length > 0}
				{#each visibleCards as card (card.id)}
					<div style="order: {card.order}">
						<CardRenderer cardId={card.id} panelId="insights" />
					</div>
				{/each}
			{:else}
				<!-- 空状态 -->
				<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<div class="relative mb-4">
						<BarChart3 class="h-16 w-16 opacity-20" />
					</div>
					<div class="text-center space-y-2">
						<p class="text-lg font-medium">暂无数据</p>
						<p class="text-sm opacity-70">阅读更多内容后显示洞察数据</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
