<script lang="ts">
/**
 * 超分全局控制卡片
 * 仅包含全局自动超分开关和侧边预览开关
 * 预超分和条件超分已移至独立卡片
 */
import { Switch } from '$lib/components/ui/switch';
import { Label } from '$lib/components/ui/label';
import {
	autoUpscaleEnabled,
	showPanelPreview,
	saveSettings
} from '$lib/stores/upscale/upscalePanelStore.svelte';
import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';
import { showInfoToast } from '$lib/utils/toast';

function handleAutoUpscaleChange(checked: boolean) {
	autoUpscaleEnabled.value = checked;
	saveSettings();
	// 同步到后端
	upscaleStore.setEnabled(checked);
	showInfoToast(checked ? '自动超分已开启' : '自动超分已关闭');
}

function handlePreviewChange(checked: boolean) {
	showPanelPreview.value = checked;
	saveSettings();
	showInfoToast(checked ? '侧边预览已开启' : '侧边预览已关闭');
}
</script>

<div class="space-y-3 text-xs">
	<!-- 自动超分开关（全局主开关） -->
	<div class="flex items-center justify-between">
		<Label class="text-xs font-medium">自动超分</Label>
		<Switch
			checked={autoUpscaleEnabled.value}
			onCheckedChange={handleAutoUpscaleChange}
			class="scale-90"
		/>
	</div>
	<p class="text-[10px] text-muted-foreground -mt-1">
		切换图片时自动执行超分（全局主开关）
	</p>

	<!-- 侧边预览开关 -->
</div>
