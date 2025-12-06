<script lang="ts">
/**
 * 超分全局控制卡片
 */
import { Switch } from '$lib/components/ui/switch';
import { Label } from '$lib/components/ui/label';
import {
	autoUpscaleEnabled,
	preUpscaleEnabled,
	conditionalUpscaleEnabled,
	showPanelPreview,
	preloadPages,
	backgroundConcurrency,
	saveSettings
} from '$lib/stores/upscale/upscalePanelStore.svelte';
import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';

function handleAutoUpscaleChange(checked: boolean) {
	autoUpscaleEnabled.value = checked;
	saveSettings();
	// 同步到后端
	upscaleStore.setEnabled(checked);
}

function handlePreUpscaleChange(checked: boolean) {
	preUpscaleEnabled.value = checked;
	saveSettings();
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

	<!-- 预超分开关 -->
	<div class="flex items-center justify-between">
		<Label class="text-xs font-medium">预超分</Label>
		<Switch
			checked={preUpscaleEnabled.value}
			onCheckedChange={handlePreUpscaleChange}
			class="scale-90"
		/>
	</div>
	<p class="text-[10px] text-muted-foreground -mt-1">
		预加载相邻 {preloadPages.value} 页并后台超分
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

	<!-- 预加载配置 -->
	<div class="pt-2 border-t">
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">预加载页数</span>
			<select
				class="h-6 px-2 text-xs bg-muted rounded border-0"
				value={preloadPages.value}
				onchange={(e) => {
					preloadPages.value = parseInt(e.currentTarget.value);
					saveSettings();
				}}
			>
				{#each [1, 2, 3, 5, 10] as n}
					<option value={n}>{n} 页</option>
				{/each}
			</select>
		</div>
		<div class="flex items-center justify-between mt-2">
			<span class="text-xs text-muted-foreground">后台并发数</span>
			<select
				class="h-6 px-2 text-xs bg-muted rounded border-0"
				value={backgroundConcurrency.value}
				onchange={(e) => {
					backgroundConcurrency.value = parseInt(e.currentTarget.value);
					saveSettings();
				}}
			>
				{#each [1, 2, 3, 4] as n}
					<option value={n}>{n}</option>
				{/each}
			</select>
		</div>
	</div>
</div>
