<script lang="ts">
/**
 * 系统设置卡片
 */
import SystemSettingsPanel from '$lib/components/panels/SystemSettingsPanel.svelte';
</script>

<div class="settings-card-wrapper">
	<SystemSettingsPanel />
</div>

<style>
	.settings-card-wrapper {
		width: 100%;
		overflow-x: hidden;
	}
	.settings-card-wrapper :global(.space-y-4.p-6) {
		padding: 0 !important;
	}
	.settings-card-wrapper :global(> div > .space-y-2:first-child) {
		display: none;
	}
	.settings-card-wrapper :global(.max-w-xs) {
		max-width: 100% !important;
	}
	.settings-card-wrapper :global(input),
	.settings-card-wrapper :global(select) {
		max-width: 100%;
	}
	.settings-card-wrapper :global([role="tablist"]) {
		width: 100%;
	}
	.settings-card-wrapper :global(.flex.items-center.gap-2) {
		flex-wrap: wrap;
	}
</style>
