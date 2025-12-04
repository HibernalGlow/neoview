<script lang="ts">
/**
 * 书签面板 - 纯容器版本
 */
import CardRenderer from '$lib/cards/CardRenderer.svelte';
import { cardConfigStore } from '$lib/stores/cardConfig.svelte';

const panelCards = $derived(cardConfigStore.getPanelCards('bookmark'));
</script>

<div class="h-full flex flex-col overflow-hidden p-2">
	{#each panelCards as card (card.id)}
		<CardRenderer cardId={card.id} panelId="bookmark" />
	{/each}
</div>
