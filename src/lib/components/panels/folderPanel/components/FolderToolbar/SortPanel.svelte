<script lang="ts">
/**
 * SortPanel - 排序面板
 * 排序字段选择和排序锁定设置
 */
import {
	ArrowUp,
	ArrowDown,
	Settings2,
	Pin,
	PinOff,
	ALargeSmall,
	Calendar,
	HardDrive,
	FileType,
	Shuffle,
	Star,
	Heart,
	FolderTree,
	Globe,
	PanelLeftOpen,
	Database,
	Gauge
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import * as Dialog from '$lib/components/ui/dialog';
import * as Table from '$lib/components/ui/table';
import { Badge } from '$lib/components/ui/badge';
import type { FolderSortField } from '../../stores/folderPanelStore';
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
	/** 设置默认排序作用域 */
	onSetDefaultSortScope: (scope: 'global' | 'tab') => void;
	/** 将当前排序设置为默认 */
	onSetCurrentSortAsDefault: (scope?: 'global' | 'tab') => void;
	/** 清除文件夹排序记忆 */
	onClearFolderSortMemory: (path?: string) => void;
}

let {
	sortConfig,
	sortLockSettings,
	virtualMode = null,
	onSetSort,
	onToggleSortOrder,
	onSetSortLocked,
	onSetDefaultSortScope,
	onSetCurrentSortAsDefault,
	onClearFolderSortMemory
}: Props = $props();

let showSortRuleDialog = $state(false);

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

<div class="flex items-center gap-1 border-t border-border/50 px-2 py-1 overflow-x-auto whitespace-nowrap">
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

	<!-- 排序规则设置（仅非虚拟模式） -->
	{#if !virtualMode}
		<div class="bg-border mx-1 h-4 w-px"></div>

		<!-- 临时规则按钮（仅当前文件夹） -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={sortLockSettings.hasTemporaryRule ? 'default' : 'ghost'}
					size="icon"
					class="h-6 w-6 {sortLockSettings.hasTemporaryRule ? 'text-amber-500' : ''}"
					onclick={() => onSetSortLocked(!sortLockSettings.hasTemporaryRule)}
				>
					{#if sortLockSettings.hasTemporaryRule}
						<Pin class="h-3 w-3" />
					{:else}
						<PinOff class="h-3 w-3" />
					{/if}
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{sortLockSettings.hasTemporaryRule ? '关闭当前文件夹临时规则' : '仅当前文件夹生效'}</p>
				<p class="text-muted-foreground text-xs">优先级最高，仅匹配当前目录</p>
			</Tooltip.Content>
		</Tooltip.Root>
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button size="icon" variant="ghost" class="h-6 w-6" onclick={() => (showSortRuleDialog = true)}>
					<Settings2 class="h-3.5 w-3.5" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>排序规则设置</p>
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}
</div>

{#if !virtualMode}
	<Dialog.Root bind:open={showSortRuleDialog}>
		<Dialog.Content class="sm:max-w-130">
			<Dialog.Header>
				<Dialog.Title>排序规则设置</Dialog.Title>
				<Dialog.Description>优先级：临时规则（当前文件夹） &gt; 文件夹记忆 &gt; 标签默认/全局默认</Dialog.Description>
			</Dialog.Header>

			<div class="space-y-3">
				<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
					<Button
						variant={sortLockSettings.defaultScope === 'tab' ? 'default' : 'ghost'}
						size="sm"
						class="h-6 px-2 rounded-full text-xs"
						onclick={() => onSetDefaultSortScope('tab')}
					>
						<PanelLeftOpen class="h-3 w-3 mr-1" />标签默认
					</Button>
					<Button
						variant={sortLockSettings.defaultScope === 'global' ? 'default' : 'ghost'}
						size="sm"
						class="h-6 px-2 rounded-full text-xs"
						onclick={() => onSetDefaultSortScope('global')}
					>
						<Globe class="h-3 w-3 mr-1" />全局默认
					</Button>
				</div>

				<div class="flex flex-wrap gap-2">
					<Button size="sm" variant="ghost" class="h-7" onclick={() => onSetCurrentSortAsDefault()}>
						<Gauge class="h-3 w-3 mr-1" />将当前排序设为默认
					</Button>
					<Button size="sm" variant="ghost" class="h-7" onclick={() => onSetCurrentSortAsDefault('global')}>
						<Globe class="h-3 w-3 mr-1" />设为全局默认
					</Button>
					<Button size="sm" variant="ghost" class="h-7" onclick={() => onClearFolderSortMemory()}>
						<Database class="h-3 w-3 mr-1" />清空文件夹记忆
					</Button>
				</div>

				<div class="border-t border-border/50 pt-2 text-xs">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="h-7">优先级</Table.Head>
								<Table.Head class="h-7">来源</Table.Head>
								<Table.Head class="h-7">状态</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							<Table.Row>
								<Table.Cell>1</Table.Cell>
								<Table.Cell>临时规则（当前文件夹）</Table.Cell>
								<Table.Cell><Badge variant={sortLockSettings.hasTemporaryRule ? 'default' : 'secondary'}>{sortLockSettings.hasTemporaryRule ? '启用' : '未启用'}</Badge></Table.Cell>
							</Table.Row>
							<Table.Row>
								<Table.Cell>2</Table.Cell>
								<Table.Cell>文件夹记忆</Table.Cell>
								<Table.Cell><Badge variant={sortLockSettings.sortSource === 'memory' ? 'default' : 'secondary'}>{sortLockSettings.sortSource === 'memory' ? '当前命中' : '按路径命中'}</Badge></Table.Cell>
							</Table.Row>
							<Table.Row>
								<Table.Cell>3</Table.Cell>
								<Table.Cell>{sortLockSettings.defaultScope === 'tab' ? '标签默认' : '全局默认'}</Table.Cell>
								<Table.Cell><Badge variant={sortLockSettings.sortSource === 'tab-default' || sortLockSettings.sortSource === 'global-default' ? 'default' : 'secondary'}>{sortLockSettings.sortSource}</Badge></Table.Cell>
							</Table.Row>
						</Table.Body>
					</Table.Root>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
