<script lang="ts">
	/**
	 * 卡片管理卡片
	 */
	import CardPanelManager from '$lib/components/settings/CardPanelManager.svelte';
</script>

<div class="settings-card-wrapper -mx-4 -my-2">
	<CardPanelManager />
</div>

<style>
	.settings-card-wrapper :global(.space-y-4.p-6) {
		padding: 0 !important;
	}
	.settings-card-wrapper :global(h3) {
		display: none;
	}
	.settings-card-wrapper :global(.space-y-2:first-child) {
		display: none;
	}
</style>
