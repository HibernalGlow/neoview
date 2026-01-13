<script lang="ts">
	/**
	 * 影像设置卡片
	 */
	import ImageSettingsPanel from '$lib/components/panels/ImageSettingsPanel.svelte';
	import ViewerSettingsPanel from '$lib/components/dialogs/ViewerSettingsPanel.svelte';
</script>

<div class="settings-card-wrapper -mx-4 -my-2 space-y-4">
	<ImageSettingsPanel />
	<ViewerSettingsPanel />
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
