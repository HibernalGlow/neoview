<script lang="ts">
/**
 * FolderPanel - 纯容器版本
 * 使用卡片系统渲染
 */
import CardRenderer from '$lib/cards/CardRenderer.svelte';
import { cardConfigStore } from '$lib/stores/cardConfig.svelte';

const panelCards = $derived(cardConfigStore.getPanelCards('folder'));
</script>

<div class="h-full flex flex-col overflow-hidden">
	{#each panelCards as card (card.id)}
		<div class="flex-1 min-h-0 flex flex-col">
			<CardRenderer cardId={card.id} panelId="folder" />
		</div>
	{/each}
</div>
