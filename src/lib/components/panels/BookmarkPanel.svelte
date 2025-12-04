<script lang="ts">
/**
 * 书签面板 - 纯容器版本
 */
import CardRenderer from '$lib/cards/CardRenderer.svelte';
import { cardConfigStore } from '$lib/stores/cardConfig.svelte';

const panelCards = $derived(cardConfigStore.getPanelCards('bookmark'));
</script>

<div class="h-full flex flex-col overflow-hidden p-2 space-y-2">
	{#each panelCards as card (card.id)}
		<div class="flex-1 min-h-0 flex flex-col">
			<CardRenderer cardId={card.id} panelId="bookmark" />
		</div>
	{/each}
</div>
