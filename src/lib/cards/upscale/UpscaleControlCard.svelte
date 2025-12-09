<script lang="ts">
/**
 * 超分全局控制卡片
 */
import { Switch } from '$lib/components/ui/switch';
import { Label } from '$lib/components/ui/label';
import {
	autoUpscaleEnabled,
	conditionalUpscaleEnabled,
	showPanelPreview,
	saveSettings
} from '$lib/stores/upscale/upscalePanelStore.svelte';
import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';

function handleAutoUpscaleChange(checked: boolean) {
	autoUpscaleEnabled.value = checked;
	saveSettings();
	// 同步到后端
	upscaleStore.setEnabled(checked);
}

async function handleConditionalChange(checked: boolean) {
	conditionalUpscaleEnabled.value = checked;
	saveSettings();
	// 同步条件设置到后端
	await upscaleStore.syncConditionSettings();
}

function handlePreviewChange(checked: boolean) {
	showPanelPreview.value = checked;
	saveSettings();
}
</script>

<div class="space-y-3 text-xs">
	<!-- 自动超分开关 -->
	<div class="flex items-center justify-between">
		<Label class="text-xs font-medium">自动超分</Label>
		<Switch
			checked={autoUpscaleEnabled.value}
			onCheckedChange={handleAutoUpscaleChange}
			class="scale-90"
		/>
	</div>
	<p class="text-[10px] text-muted-foreground -mt-1">
		切换图片时自动执行超分
	</p>

	<!-- 条件超分开关 -->
	<div class="flex items-center justify-between">
		<Label class="text-xs font-medium">条件超分</Label>
		<Switch
			checked={conditionalUpscaleEnabled.value}
			onCheckedChange={handleConditionalChange}
			class="scale-90"
		/>
	</div>
	<p class="text-[10px] text-muted-foreground -mt-1">
		根据图片尺寸等条件决定是否超分
	</p>

	<!-- 侧边预览开关 -->
	<div class="flex items-center justify-between">
		<Label class="text-xs font-medium">侧边预览</Label>
		<Switch
			checked={showPanelPreview.value}
			onCheckedChange={handlePreviewChange}
			class="scale-90"
		/>
	</div>
	<p class="text-[10px] text-muted-foreground -mt-1">
		在面板中显示超分前后对比
	</p>
</div>
