<script lang="ts">
	/**
	 * NeoView - Benchmark Panel Component
	 * 基准测试面板 - 纯容器，使用 CardRenderer 渲染卡片
	 */
	import { Timer } from '@lucide/svelte';
	import { cardConfigStore } from '$lib/stores/cardConfig.svelte';
	import CardRenderer from '$lib/cards/CardRenderer.svelte';

	// 从 cardConfigStore 获取可见卡片（已排序）
	const visibleCards = $derived(cardConfigStore.getPanelCards('benchmark').filter(c => c.visible));
</script>

<div 
	class="h-full flex flex-col"
	role="region"
	aria-label="基准测试面板"
>
	<!-- 标题栏 -->
	<div class="px-4 py-3">
		<div class="flex items-center gap-2">
			<Timer class="h-5 w-5" />
			<h3 class="font-semibold">基准测试</h3>
		</div>
	</div>

	<div class="flex-1 overflow-auto">
		<div class="px-4 py-3 flex flex-col space-y-3">
			{#if visibleCards.length > 0}
				{#each visibleCards as card (card.id)}
					<div style="order: {card.order}">
						<CardRenderer cardId={card.id} panelId="benchmark" />
					</div>
				{/each}
			{:else}
				<!-- 空状态 -->
				<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<div class="relative mb-4">
						<Timer class="h-16 w-16 opacity-20" />
					</div>
					<div class="text-center space-y-2">
						<p class="text-lg font-medium">暂无测试</p>
						<p class="text-sm opacity-70">选择卡片后开始基准测试</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
