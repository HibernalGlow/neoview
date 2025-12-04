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

<div class="h-full flex flex-col overflow-hidden">
	<!-- 面板头部 -->
	<div class="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
		<FileText class="h-4 w-4 text-primary" />
		<h2 class="text-sm font-semibold">页面列表</h2>
	</div>

	<!-- 卡片容器 -->
	<div class="flex-1 overflow-y-auto p-2 space-y-2">
		{#each panelCards as card (card.id)}
			<CardRenderer cardId={card.id} panelId="pageList" />
		{/each}

		{#if panelCards.length === 0}
			<div class="text-center py-8 text-muted-foreground text-sm">
				<p>没有可显示的卡片</p>
			</div>
		{/if}
	</div>
</div>
