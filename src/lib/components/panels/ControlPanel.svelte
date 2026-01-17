<script lang="ts">
	/**
	 * NeoView - Control Panel Component
	 * 控制面板 - 渲染控制相关的卡片
	 */
	import { Settings2 } from '@lucide/svelte';
	import { cardConfigStore } from '$lib/stores/cardConfig.svelte';
	import CardRenderer from '$lib/cards/CardRenderer.svelte';

	// 从 cardConfigStore 获取可见卡片（已排序）
	const visibleCards = $derived(cardConfigStore.getPanelCards('control').filter(c => c.visible));
</script>

<div 
	class="h-full flex flex-col"
	role="region"
	aria-label="控制面板"
>
	<!-- 标题栏 -->
	<div class="px-4 py-3">
		<div class="flex items-center gap-2">
			<h3 class="font-semibold">控制</h3>
		</div>
	</div>

	<div class="flex-1 overflow-auto">
		<div class="px-4 py-3 flex flex-col space-y-3">
			{#if visibleCards.length > 0}
				{#each visibleCards as card (card.id)}
					<div style="order: {card.order}">
						<CardRenderer cardId={card.id} panelId="control" />
					</div>
				{/each}
			{:else}
				<!-- 空状态 -->
				<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<div class="relative mb-4">
						<Settings2 class="h-16 w-16 opacity-20" />
					</div>
					<div class="text-center space-y-2">
						<p class="text-lg font-medium">暂无控制内容</p>
						<p class="text-sm opacity-70">在卡片管理中添加控制卡片</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
