<script lang="ts">
/**
 * OtherTab - 其他设置标签页
 * 包含工具栏提示、同步文件夹、默认评分等设置
 */
import { Settings2, FolderSync, Star, MousePointerClick, ChevronUp } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { getDefaultRating, saveDefaultRating } from '$lib/stores/emm/storage';
import type { VirtualMode } from '../types';

interface Props {
	/** 虚拟模式 */
	virtualMode?: VirtualMode;
	/** 是否显示工具栏提示 */
	showToolbarTooltip?: boolean;
	/** 回调函数 */
	onToggleShowToolbarTooltip: () => void;
}

let {
	virtualMode = null,
	showToolbarTooltip = false,
	onToggleShowToolbarTooltip
}: Props = $props();
</script>

<div class="flex flex-wrap items-center gap-4 text-xs">
	<!-- 工具栏 Tooltip 开关（仅在历史/书签模式下显示） -->
	{#if virtualMode}
		<div class="flex items-center gap-2">
			<Settings2 class="h-3.5 w-3.5 text-muted-foreground" />
			<span class="text-muted-foreground">工具栏提示:</span>
			<Button 
				variant={showToolbarTooltip ? 'default' : 'outline'} 
				size="sm" 
				class="h-6 text-xs px-2"
				onclick={onToggleShowToolbarTooltip}
			>
				{showToolbarTooltip ? '开' : '关'}
			</Button>
			<span class="text-muted-foreground/60 text-[10px]">
				鼠标悬停时显示按钮提示
			</span>
		</div>
	{/if}

	<!-- 同步文件夹开关（仅在历史/书签模式下显示） -->
	{#if virtualMode}
		<div class="flex items-center gap-2">
			<FolderSync class="h-3.5 w-3.5 text-muted-foreground" />
			<span class="text-muted-foreground">同步文件夹:</span>
			<Button 
				variant={virtualMode === 'history' 
					? (historySettingsStore.syncFileTreeOnHistorySelect ? 'default' : 'outline')
					: (historySettingsStore.syncFileTreeOnBookmarkSelect ? 'default' : 'outline')} 
				size="sm" 
				class="h-6 text-xs px-2"
				onclick={() => {
					if (virtualMode === 'history') {
						historySettingsStore.setSyncFileTreeOnHistorySelect(!historySettingsStore.syncFileTreeOnHistorySelect);
					} else {
						historySettingsStore.setSyncFileTreeOnBookmarkSelect(!historySettingsStore.syncFileTreeOnBookmarkSelect);
					}
				}}
			>
				{#if virtualMode === 'history'}
					{historySettingsStore.syncFileTreeOnHistorySelect ? '开' : '关'}
				{:else}
					{historySettingsStore.syncFileTreeOnBookmarkSelect ? '开' : '关'}
				{/if}
			</Button>
			<span class="text-muted-foreground/60 text-[10px]">
				点击项目时自动在文件夹页签打开所在目录
			</span>
		</div>
	{/if}

	<!-- 默认评分 -->
	<div class="flex items-center gap-2">
		<Star class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">默认评分:</span>
		<input
			type="number"
			min="0"
			max="5"
			step="0.1"
			value={getDefaultRating()}
			onchange={(e) => {
				const value = parseFloat((e.target as HTMLInputElement).value);
				if (!isNaN(value) && value >= 0 && value <= 5) {
					saveDefaultRating(value);
				}
			}}
			class="w-14 h-6 bg-background border rounded text-xs px-2 text-center"
		/>
		<div class="flex gap-1">
			{#each [3.5, 4.0, 4.5, 5.0] as rating}
				<Button
					variant={getDefaultRating() === rating ? 'default' : 'outline'}
					size="sm"
					class="h-6 text-[10px] px-1.5"
					onclick={() => saveDefaultRating(rating)}
				>
					{rating}
				</Button>
			{/each}
		</div>
	</div>

	<!-- 双击空白处行为 -->
	<div class="flex items-center gap-2">
		<MousePointerClick class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">双击空白:</span>
		<select 
			class="h-6 bg-background border rounded text-xs px-1"
			value={$fileBrowserStore.doubleClickEmptyAction}
			onchange={(e) => fileBrowserStore.setDoubleClickEmptyAction((e.target as HTMLSelectElement).value as 'none' | 'goUp' | 'goBack')}
		>
			<option value="none">无操作</option>
			<option value="goUp">返回上级</option>
			<option value="goBack">后退</option>
		</select>
	</div>

	<div class="flex items-center gap-2">
		<MousePointerClick class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">单击空白:</span>
		<select 
			class="h-6 bg-background border rounded text-xs px-1"
			value={$fileBrowserStore.singleClickEmptyAction}
			onchange={(e) => fileBrowserStore.setSingleClickEmptyAction((e.target as HTMLSelectElement).value as 'none' | 'goUp' | 'goBack')}
		>
			<option value="none">无操作</option>
			<option value="goUp">返回上级</option>
			<option value="goBack">后退</option>
		</select>
	</div>

	<div class="flex items-center gap-2">
		<ChevronUp class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">返回按钮:</span>
		<Button 
			variant={$fileBrowserStore.showEmptyAreaBackButton ? 'default' : 'outline'} 
			size="sm" 
			class="h-6 text-xs px-2"
			onclick={() => fileBrowserStore.setShowEmptyAreaBackButton(!$fileBrowserStore.showEmptyAreaBackButton)}
		>
			{$fileBrowserStore.showEmptyAreaBackButton ? '显示' : '隐藏'}
		</Button>
		<span class="text-muted-foreground/60 text-[10px]">
			列表底部显示返回按钮
		</span>
	</div>
</div>
