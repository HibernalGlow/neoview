<script lang="ts">
	/**
	 * 系统设置卡片
	 */
	import SystemSettingsPanel from '$lib/components/panels/SystemSettingsPanel.svelte';
</script>

<div class="settings-card-wrapper -mx-4 -my-2">
	<SystemSettingsPanel />
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
