<!--
  透明度和模糊设置 Tab
  包含侧边栏、工具栏、底部栏的透明度和模糊程度设置
-->
<script lang="ts">
	import { Layers } from '@lucide/svelte';
	import { Label } from '$lib/components/ui/label';
	import { Slider } from '$lib/components/ui/slider';
	import { settingsManager } from '$lib/settings/settingsManager';

	// 透明度状态
	let sidebarOpacity = $state(settingsManager.getSettings().panels.sidebarOpacity);
	let topToolbarOpacity = $state(settingsManager.getSettings().panels.topToolbarOpacity);
	let bottomBarOpacity = $state(settingsManager.getSettings().panels.bottomBarOpacity);
	let settingsOpacity = $state(settingsManager.getSettings().panels.settingsOpacity ?? 85);

	// 模糊状态
	let sidebarBlur = $state(settingsManager.getSettings().panels.sidebarBlur ?? 12);
	let topToolbarBlur = $state(settingsManager.getSettings().panels.topToolbarBlur ?? 12);
	let bottomBarBlur = $state(settingsManager.getSettings().panels.bottomBarBlur ?? 12);
	let settingsBlur = $state(settingsManager.getSettings().panels.settingsBlur ?? 12);

	function updateSidebarOpacity(value: number) {
		sidebarOpacity = value;
		settingsManager.updateNestedSettings('panels', { sidebarOpacity: value });
	}

	function updateTopToolbarOpacity(value: number) {
		topToolbarOpacity = value;
		settingsManager.updateNestedSettings('panels', { topToolbarOpacity: value });
	}

	function updateBottomBarOpacity(value: number) {
		bottomBarOpacity = value;
		settingsManager.updateNestedSettings('panels', { bottomBarOpacity: value });
	}

	function updateSettingsOpacity(value: number) {
		settingsOpacity = value;
		settingsManager.updateNestedSettings('panels', { settingsOpacity: value });
	}

	function updateSidebarBlur(value: number) {
		sidebarBlur = value;
		settingsManager.updateNestedSettings('panels', { sidebarBlur: value });
	}

	function updateTopToolbarBlur(value: number) {
		topToolbarBlur = value;
		settingsManager.updateNestedSettings('panels', { topToolbarBlur: value });
	}

	function updateBottomBarBlur(value: number) {
		bottomBarBlur = value;
		settingsManager.updateNestedSettings('panels', { bottomBarBlur: value });
	}

	function updateSettingsBlur(value: number) {
		settingsBlur = value;
		settingsManager.updateNestedSettings('panels', { settingsBlur: value });
	}
</script>

<div class="space-y-4">
	<!-- 透明度设置 -->
	<div class="space-y-4">
		<h4 class="flex items-center gap-2 text-sm font-semibold">
			<Layers class="h-4 w-4" />
			透明度
		</h4>

		<div class="space-y-3">
			<Label class="text-sm">侧边栏透明度</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={sidebarOpacity}
					min={50}
					max={100}
					step={5}
					class="flex-1"
					onValueChange={updateSidebarOpacity}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{sidebarOpacity}%</span>
			</div>
			<p class="text-muted-foreground text-xs">调整侧边栏和面板的背景透明度，数值越低越透明</p>
		</div>

		<div class="space-y-3">
			<Label class="text-sm">顶部工具栏透明度</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={topToolbarOpacity}
					min={50}
					max={100}
					step={5}
					class="flex-1"
					onValueChange={updateTopToolbarOpacity}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{topToolbarOpacity}%</span>
			</div>
		</div>

		<div class="space-y-3">
			<Label class="text-sm">底部缩略图栏透明度</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={bottomBarOpacity}
					min={50}
					max={100}
					step={5}
					class="flex-1"
					onValueChange={updateBottomBarOpacity}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{bottomBarOpacity}%</span>
			</div>
		</div>

		<div class="space-y-3">
			<Label class="text-sm">设置界面透明度</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={settingsOpacity}
					min={50}
					max={100}
					step={5}
					class="flex-1"
					onValueChange={updateSettingsOpacity}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{settingsOpacity}%</span>
			</div>
		</div>
	</div>

	<!-- 模糊程度设置 -->
	<div class="space-y-4 border-t pt-4">
		<h4 class="text-sm font-semibold">模糊程度</h4>

		<div class="space-y-3">
			<Label class="text-sm">侧边栏模糊</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={sidebarBlur}
					min={0}
					max={20}
					step={2}
					class="flex-1"
					onValueChange={updateSidebarBlur}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{sidebarBlur}px</span>
			</div>
		</div>

		<div class="space-y-3">
			<Label class="text-sm">顶部工具栏模糊</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={topToolbarBlur}
					min={0}
					max={20}
					step={2}
					class="flex-1"
					onValueChange={updateTopToolbarBlur}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{topToolbarBlur}px</span>
			</div>
		</div>

		<div class="space-y-3">
			<Label class="text-sm">底部缩略图栏模糊</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={bottomBarBlur}
					min={0}
					max={20}
					step={2}
					class="flex-1"
					onValueChange={updateBottomBarBlur}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{bottomBarBlur}px</span>
			</div>
		</div>

		<div class="space-y-3">
			<Label class="text-sm">设置界面模糊程度</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={settingsBlur}
					min={0}
					max={20}
					step={2}
					class="flex-1"
					onValueChange={updateSettingsBlur}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{settingsBlur}px</span>
			</div>
		</div>
	</div>
</div>
