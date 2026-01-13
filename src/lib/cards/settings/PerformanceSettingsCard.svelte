<script lang="ts">
/**
 * 性能设置卡片
 */
import PerformanceSettingsPanel from '$lib/components/panels/PerformanceSettingsPanel.svelte';
</script>

<div class="settings-card-wrapper">
	<PerformanceSettingsPanel />
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
	/* 隐藏性能面板底部的保存按钮区域 */
	.settings-card-wrapper :global(.border-t.border-border\/40) {
		display: none;
	}
</style>
