<script lang="ts">
	/**
	 * MoreSettingsTabs - 更多设置栏
	 * 包含快捷操作、显示设置、其他设置三个标签页
	 * 已拆分为子组件以保持代码简洁
	 */
	import * as Tabs from '$lib/components/ui/tabs';
	import type { VirtualMode } from './types';

	// 子组件导入
	import ActionTab from './tabs/ActionTab.svelte';
	import DisplayTab from './tabs/DisplayTab.svelte';
	import OtherTab from './tabs/OtherTab.svelte';

	interface Props {
		/** 虚拟模式 */
		virtualMode?: VirtualMode;
		/** 是否显示工具栏提示 */
		showToolbarTooltip?: boolean;
		/** 多选模式 */
		multiSelectMode: boolean;
		/** 缩略图宽度百分比 */
		thumbnailWidthPercent: number;
		/** 横幅宽度百分比 */
		bannerWidthPercent: number;
		/** 文件数量 */
		itemCount: number;
		/** 回调函数 */
		onSetThumbnailWidthPercent: (value: number) => void;
		onSetBannerWidthPercent: (value: number) => void;
		onToggleShowToolbarTooltip: () => void;
		onRefresh?: () => void;
	}

	let {
		virtualMode = null,
		showToolbarTooltip = false,
		multiSelectMode,
		thumbnailWidthPercent,
		bannerWidthPercent,
		itemCount,
		onSetThumbnailWidthPercent,
		onSetBannerWidthPercent,
		onToggleShowToolbarTooltip,
		onRefresh
	}: Props = $props();

	// 当前标签页
	let settingsTab = $state<'action' | 'display' | 'other'>('action');
</script>

<div class="bg-muted/20 border-t">
	<Tabs.Root
		value={settingsTab}
		onValueChange={(v) => (settingsTab = v as typeof settingsTab)}
		class="w-full"
	>
		<div class="flex items-center px-2">
			<Tabs.List class="h-8 bg-transparent">
				<Tabs.Trigger value="action" class="h-7 px-3 py-1 text-xs">快捷操作</Tabs.Trigger>
				<Tabs.Trigger value="display" class="h-7 px-3 py-1 text-xs">显示设置</Tabs.Trigger>
				<Tabs.Trigger value="other" class="h-7 px-3 py-1 text-xs">其他</Tabs.Trigger>
			</Tabs.List>
			<div class="flex-1"></div>
			<span class="text-muted-foreground text-[10px]">文件数: {itemCount}</span>
		</div>

		<Tabs.Content value="action" class="mt-0 px-2 py-2">
			<ActionTab {multiSelectMode} {onRefresh} />
		</Tabs.Content>

		<Tabs.Content value="display" class="mt-0 px-2 py-2">
			<DisplayTab
				{thumbnailWidthPercent}
				{bannerWidthPercent}
				{onSetThumbnailWidthPercent}
				{onSetBannerWidthPercent}
			/>
		</Tabs.Content>

		<Tabs.Content value="other" class="mt-0 px-2 py-2">
			<OtherTab {virtualMode} {showToolbarTooltip} {onToggleShowToolbarTooltip} />
		</Tabs.Content>
	</Tabs.Root>
</div>
