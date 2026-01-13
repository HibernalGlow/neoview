<script lang="ts">
	/**
	 * 通用设置卡片
	 * 包装 GeneralSettingsPanel 作为可嵌入侧边栏的卡片
	 */
	import GeneralSettingsPanel from '$lib/components/panels/GeneralSettingsPanel.svelte';
</script>

<div class="settings-card-wrapper -mx-4 -my-2">
	<GeneralSettingsPanel />
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
