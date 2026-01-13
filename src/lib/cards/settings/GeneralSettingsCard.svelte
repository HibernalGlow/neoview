<script lang="ts">
/**
 * 通用设置卡片
 * 包装 GeneralSettingsPanel 作为可嵌入侧边栏的卡片
 */
import GeneralSettingsPanel from '$lib/components/panels/GeneralSettingsPanel.svelte';
</script>

<div class="settings-card-wrapper">
	<GeneralSettingsPanel />
</div>

<style>
	.settings-card-wrapper {
		width: 100%;
		overflow-x: hidden;
	}
	/* 移除原面板的 padding */
	.settings-card-wrapper :global(.space-y-4.p-6) {
		padding: 0 !important;
	}
	/* 隐藏标题 */
	.settings-card-wrapper :global(> div > .space-y-2:first-child) {
		display: none;
	}
	/* 让所有输入框和选择框自适应宽度 */
	.settings-card-wrapper :global(.max-w-xs) {
		max-width: 100% !important;
	}
	.settings-card-wrapper :global(input),
	.settings-card-wrapper :global(select) {
		max-width: 100%;
	}
	/* Tab 列表自适应 */
	.settings-card-wrapper :global([role="tablist"]) {
		width: 100%;
	}
	/* 按钮组自适应 */
	.settings-card-wrapper :global(.flex.items-center.gap-2) {
		flex-wrap: wrap;
	}
</style>
