<script lang="ts">
	/**
	 * 历史记录面板 - 纯容器版本
	 */
	import CardRenderer from '$lib/cards/CardRenderer.svelte';
	import { cardConfigStore } from '$lib/stores/cardConfig.svelte';

	const panelCards = $derived(cardConfigStore.getPanelCards('history'));
</script>

<div class="flex h-full flex-col space-y-2 overflow-hidden p-2">
	{#each panelCards as card (card.id)}
		<div class="flex min-h-0 flex-1 flex-col">
			<CardRenderer cardId={card.id} panelId="history" />
		</div>
	{/each}
</div>
