<script lang="ts">
	/**
	 * 页面列表面板 - 纯容器版本
	 * 使用卡片系统渲染
	 */
	import { FileText } from '@lucide/svelte';
	import CardRenderer from '$lib/cards/CardRenderer.svelte';
	import { cardConfigStore } from '$lib/stores/cardConfig.svelte';

	const panelCards = $derived(cardConfigStore.getPanelCards('pageList'));
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- 面板头部 -->
	<div class="bg-muted/30 flex items-center gap-2 px-3 py-2">
		<FileText class="text-primary h-4 w-4" />
		<h2 class="text-sm font-semibold">页面列表</h2>
	</div>

	<!-- 卡片容器 - 使用 min-h-0 确保 flex 子元素正确收缩 -->
	<div class="flex min-h-0 flex-1 flex-col p-2">
		{#each panelCards as card (card.id)}
			<div class="flex min-h-0 flex-1 flex-col">
				<CardRenderer cardId={card.id} panelId="pageList" />
			</div>
		{/each}

		{#if panelCards.length === 0}
			<div class="text-muted-foreground py-8 text-center text-sm">
				<p>没有可显示的卡片</p>
			</div>
		{/if}
	</div>
</div>
