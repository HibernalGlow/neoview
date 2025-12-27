<script lang="ts">
/**
 * SortPanel - 排序面板
 * 排序字段选择和排序锁定设置
 */
import {
	ArrowUp,
	ArrowDown,
	Lock,
	Unlock,
	ALargeSmall,
	Calendar,
	HardDrive,
	FileType,
	Shuffle,
	Star,
	Heart,
	FolderTree
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import type { FolderSortField } from '../../stores/folderPanelStore.svelte';
import type { SortConfig, SortLockSettings, SortFieldDef, VirtualMode } from './types';

interface Props {
	/** 排序配置 */
	sortConfig: SortConfig;
	/** 排序锁定设置 */
	sortLockSettings: SortLockSettings;
	/** 虚拟模式 */
	virtualMode?: VirtualMode;
	/** 设置排序字段 */
	onSetSort: (field: FolderSortField) => void;
	/** 切换排序顺序 */
	onToggleSortOrder: () => void;
	/** 设置排序锁定 */
	onSetSortLocked: (locked: boolean) => void;
	/** 设置排序策略 */
	onSetSortStrategy: (strategy: 'default' | 'inherit') => void;
}

let {
	sortConfig,
	sortLockSettings,
	virtualMode = null,
	onSetSort,
	onToggleSortOrder,
	onSetSortLocked,
	onSetSortStrategy
}: Props = $props();

// 排序字段定义 - 虚拟模式下 date 显示为"添加时间"
const sortFields = $derived.by((): SortFieldDef[] => {
	const dateLabel = virtualMode ? '添加时间' : '日期';
	return [
		{ value: 'name' as FolderSortField, label: '名称', icon: ALargeSmall },
		{ value: 'path' as FolderSortField, label: '路径', icon: FolderTree },
		{ value: 'date' as FolderSortField, label: dateLabel, icon: Calendar },
		{ value: 'size' as FolderSortField, label: '大小', icon: HardDrive },
		{ value: 'type' as FolderSortField, label: '类型', icon: FileType },
		{ value: 'random' as FolderSortField, label: '随机', icon: Shuffle },
		{ value: 'rating' as FolderSortField, label: '评分', icon: Star },
		{ value: 'collectTagCount' as FolderSortField, label: '收藏标签', icon: Heart }
	];
});
</script>

<div class="flex flex-wrap items-center gap-1 border-t border-border/50 px-2 py-1">
	<span class="text-muted-foreground text-xs mr-1">排序</span>
	<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
		{#each sortFields as field}
			{@const Icon = field.icon}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={sortConfig.field === field.value ? 'default' : 'ghost'}
						size="icon"
						class="h-6 w-6 rounded-full"
						onclick={() => onSetSort(field.value)}
					>
						<Icon class="h-3 w-3" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{field.label}{sortConfig.field === field.value ? (sortConfig.order === 'asc' ? ' ↑' : ' ↓') : ''}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	</div>
	
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				onclick={onToggleSortOrder}
			>
				{#if sortConfig.order === 'asc'}
					<ArrowUp class="h-3 w-3" />
				{:else}
					<ArrowDown class="h-3 w-3" />
				{/if}
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>{sortConfig.order === 'asc' ? '升序' : '降序'}（点击切换）</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<!-- 排序锁定设置（仅非虚拟模式） -->
	{#if !virtualMode}
		<div class="bg-border mx-1 h-4 w-px"></div>
		
		<!-- 锁定按钮 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={sortLockSettings.locked ? 'default' : 'ghost'}
					size="icon"
					class="h-6 w-6 {sortLockSettings.locked ? 'text-amber-500' : ''}"
					onclick={() => onSetSortLocked(!sortLockSettings.locked)}
				>
					{#if sortLockSettings.locked}
						<Lock class="h-3 w-3" />
					{:else}
						<Unlock class="h-3 w-3" />
					{/if}
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{sortLockSettings.locked ? '点击解锁排序' : '点击锁定当前排序'}</p>
				<p class="text-muted-foreground text-xs">锁定后新标签页将使用锁定的排序方式</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 策略选择（仅当未锁定时显示） -->
		{#if !sortLockSettings.locked}
			<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner ml-1">
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={sortLockSettings.strategy === 'default' ? 'default' : 'ghost'}
							size="sm"
							class="h-5 px-2 rounded-full text-[10px]"
							onclick={() => onSetSortStrategy('default')}
						>
							默认
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>新标签页使用默认排序（名称升序）</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={sortLockSettings.strategy === 'inherit' ? 'default' : 'ghost'}
							size="sm"
							class="h-5 px-2 rounded-full text-[10px]"
							onclick={() => onSetSortStrategy('inherit')}
						>
							继承
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>新标签页继承上一个标签页的排序</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
		{/if}
	{/if}
</div>
