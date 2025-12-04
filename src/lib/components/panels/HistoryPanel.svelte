<script lang="ts">
/**
 * 历史记录面板 - 纯容器版本
 */
import CardRenderer from '$lib/cards/CardRenderer.svelte';
import { cardConfigStore } from '$lib/stores/cardConfig.svelte';

const panelCards = $derived(cardConfigStore.getPanelCards('history'));
</script>

<div class="h-full flex flex-col overflow-hidden p-2">
	{#each panelCards as card (card.id)}
		<CardRenderer cardId={card.id} panelId="history" />
	{/each}
</div>
