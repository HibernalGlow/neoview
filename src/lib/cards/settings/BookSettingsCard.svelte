<script lang="ts">
	/**
	 * 书籍设置卡片
	 */
	import BookSettingsPanel from '$lib/components/panels/BookSettingsPanel.svelte';
</script>

<div class="settings-card-wrapper -mx-4 -my-2">
	<BookSettingsPanel />
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
