<script lang="ts">
/**
 * ActionButtons - 功能按钮组
 * 多选、删除、文件树、搜索、迁移、标签、穿透、视图等按钮
 */
import {
	CheckSquare,
	Trash2,
	FolderTree,
	ListTree,
	Search,
	ClipboardPaste,
	Tags,
	CornerDownRight,
	List,
	Grid3x3,
	LayoutGrid,
	Image,
	Settings2,
	ArrowUp,
	ArrowDown,
	Pin,
	ALargeSmall,
	Calendar,
	HardDrive,
	FileType,
	Shuffle,
	Star,
	Heart
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import type { FolderViewStyle, FolderSortField } from '../../stores/folderPanelStore';
import type { SortConfig, SortLockSettings, FolderTreeConfig, VirtualMode } from './types';

interface Props {
	/** 虚拟模式 */
	virtualMode?: VirtualMode;
	/** 是否垂直布局 */
	vertical?: boolean;
	/** 是否显示工具栏提示 */
	showToolbarTooltip?: boolean;
	/** 多选模式 */
	multiSelectMode: boolean;
	/** 删除模式 */
	deleteMode: boolean;
	/** 删除策略 */
	deleteStrategy: 'trash' | 'permanent';
	/** 文件树配置 */
	folderTreeConfig: FolderTreeConfig;
	/** 内联树模式 */
	inlineTreeMode: boolean;
	/** 显示搜索栏 */
	showSearchBar: boolean;
	/** 显示迁移栏 */
	showMigrationBar: boolean;
	/** 显示随机标签栏 */
	showRandomTagBar?: boolean;
	/** 穿透模式 */
	penetrateMode: boolean;
	/** 新标签页打开模式 */
	openInNewTabMode: boolean;
	/** 排序配置 */
	sortConfig: SortConfig;
	/** 排序锁定设置 */
	sortLockSettings: SortLockSettings;
	/** 视图样式 */
	viewStyle: FolderViewStyle;
	/** 排序面板展开 */
	sortPanelExpanded: boolean;
	/** 视图面板展开 */
	viewPanelExpanded: boolean;
	/** 文件树面板展开 */
	treePanelExpanded: boolean;
	/** 更多设置展开 */
	showMoreSettings: boolean;
	/** 回调函数 */
	onToggleMultiSelectMode: () => void;
	onToggleDeleteMode: () => void;
	onToggleDeleteStrategy: (e: MouseEvent) => void;
	onToggleFolderTree?: () => void;
	onToggleTreePanel: () => void;
	onToggleShowSearchBar: () => void;
	onToggleShowMigrationBar: () => void;
	onToggleRandomTagBar?: () => void;
	onTogglePenetrateMode: () => void;
	onToggleShowPenetrateSettingsBar: () => void;
	onToggleSortPanel: () => void;
	onToggleSortLock: (e: MouseEvent) => void;
	onToggleViewPanel: () => void;
	onToggleMoreSettings: () => void;
}

let {
	virtualMode = null,
	vertical = false,
	showToolbarTooltip = false,
	multiSelectMode,
	deleteMode,
	deleteStrategy,
	folderTreeConfig,
	inlineTreeMode,
	showSearchBar,
	showMigrationBar,
	showRandomTagBar = false,
	penetrateMode,
	openInNewTabMode,
	sortConfig,
	sortLockSettings,
	viewStyle,
	sortPanelExpanded,
	viewPanelExpanded,
	treePanelExpanded,
	showMoreSettings,
	onToggleMultiSelectMode,
	onToggleDeleteMode,
	onToggleDeleteStrategy,
	onToggleFolderTree,
	onToggleTreePanel,
	onToggleShowSearchBar,
	onToggleShowMigrationBar,
	onToggleRandomTagBar,
	onTogglePenetrateMode,
	onToggleShowPenetrateSettingsBar,
	onToggleSortPanel,
	onToggleSortLock,
	onToggleViewPanel,
	onToggleMoreSettings
}: Props = $props();

// 获取当前排序图标
function getCurrentSortIcon() {
	const icons: Record<FolderSortField, typeof ALargeSmall> = {
		name: ALargeSmall,
		path: FolderTree,
		date: Calendar,
		size: HardDrive,
		type: FileType,
		random: Shuffle,
		rating: Star,
		collectTagCount: Heart
	};
	return icons[sortConfig.field] ?? ALargeSmall;
}

// 获取当前视图图标
function getCurrentViewIcon() {
	const icons: Record<FolderViewStyle, typeof List> = {
		list: List,
		content: LayoutGrid,
		banner: Image,
		thumbnail: Grid3x3
	};
	return icons[viewStyle] ?? List;
}
</script>

<!-- 排序按钮 -->
<Tooltip.Root disabled={!showToolbarTooltip}>
	<Tooltip.Trigger>
		<Button 
			variant={sortPanelExpanded ? 'default' : (sortLockSettings.hasTemporaryRule && !virtualMode ? 'secondary' : 'ghost')} 
			size="sm" 
			class="h-7 gap-0.5 px-1.5"
			onclick={onToggleSortPanel}
			oncontextmenu={onToggleSortLock}
		>
			{#if sortLockSettings.hasTemporaryRule && !virtualMode}
				<Pin class="h-3 w-3 text-amber-500" />
			{/if}
			{@const SortIcon = getCurrentSortIcon()}
			<SortIcon class="h-3.5 w-3.5" />
			{#if sortConfig.field !== 'random'}
				{#if sortConfig.order === 'asc'}
					<ArrowUp class="h-3 w-3" />
				{:else}
					<ArrowDown class="h-3 w-3" />
				{/if}
			{/if}
		</Button>
	</Tooltip.Trigger>
	<Tooltip.Content>
		<p>排序 {sortConfig.field !== 'random' ? (sortConfig.order === 'asc' ? '升序' : '降序') : ''}</p>
		{#if !virtualMode}
			<p class="text-muted-foreground text-xs">{sortLockSettings.hasTemporaryRule ? '📌 当前文件夹临时规则已启用（右键关闭）' : '右键：仅当前文件夹生效'}</p>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>

<!-- 弹性空间 -->
<div class={vertical ? "h-2" : "flex-1"}></div>

<!-- 功能按钮组 -->
<div class={vertical ? "flex flex-col items-center gap-0.5" : "flex items-center gap-0.5"}>
	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button
				variant={multiSelectMode ? 'default' : 'ghost'}
				size="icon"
				class="h-7 w-7"
				onclick={onToggleMultiSelectMode}
			>
				<CheckSquare class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>多选模式</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button
				variant={deleteMode ? 'default' : 'ghost'}
				size="icon"
				class="h-7 w-7 {deleteStrategy === 'permanent' && deleteMode ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}"
				onclick={onToggleDeleteMode}
				oncontextmenu={onToggleDeleteStrategy}
			>
				<Trash2 class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>删除模式 ({deleteStrategy === 'trash' ? '回收站' : '永久'})</p>
			<p class="text-muted-foreground text-xs">右键切换策略</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button 
				variant={folderTreeConfig.visible || inlineTreeMode || treePanelExpanded ? 'default' : 'ghost'} 
				size="icon" 
				class="h-7 w-7" 
				onclick={() => onToggleFolderTree?.()}
				oncontextmenu={(e: MouseEvent) => { e.preventDefault(); onToggleTreePanel(); }}
			>
				{#if inlineTreeMode}
					<ListTree class="h-4 w-4" />
				{:else}
					<FolderTree class="h-4 w-4" />
				{/if}
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>文件夹树 {folderTreeConfig.visible ? '(已显示)' : ''} {inlineTreeMode ? '(主视图树模式)' : ''}</p>
			<p class="text-muted-foreground text-xs">右键打开位置设置栏</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button
				variant={showSearchBar ? 'default' : 'ghost'}
				size="icon"
				class="h-7 w-7"
				onclick={onToggleShowSearchBar}
			>
				<Search class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>{showSearchBar ? '隐藏搜索栏' : '显示搜索栏'}</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button
				variant={showMigrationBar ? 'default' : 'ghost'}
				size="icon"
				class="h-7 w-7"
				onclick={onToggleShowMigrationBar}
			>
				<ClipboardPaste class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>{showMigrationBar ? '隐藏迁移栏' : '显示迁移栏'}</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button
				variant={showRandomTagBar ? 'default' : 'ghost'}
				size="icon"
				class="h-7 w-7"
				onclick={() => onToggleRandomTagBar?.()}
			>
				<Tags class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>{showRandomTagBar ? '隐藏标签推荐' : '显示标签推荐'}</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button
				variant={penetrateMode ? 'default' : 'ghost'}
				size="icon"
				class="h-7 w-7 {openInNewTabMode && penetrateMode ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}"
				onclick={onTogglePenetrateMode}
				oncontextmenu={(e: MouseEvent) => {
					e.preventDefault();
					onToggleShowPenetrateSettingsBar();
				}}
			>
				<CornerDownRight class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>{penetrateMode ? '穿透模式：当文件夹只有一个子文件时直接打开' : '穿透模式'}</p>
			<p class="text-muted-foreground text-xs">右键打开穿透设置栏</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<!-- 视图样式按钮 -->
	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button 
				variant={viewPanelExpanded ? 'default' : 'ghost'} 
				size="icon" 
				class="h-7 w-7"
				onclick={onToggleViewPanel}
			>
				{@const ViewIcon = getCurrentViewIcon()}
				<ViewIcon class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>视图样式</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<!-- 更多设置按钮 -->
	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button 
				variant={showMoreSettings ? 'secondary' : 'ghost'} 
				size="icon" 
				class="h-7 w-7"
				onclick={onToggleMoreSettings}
			>
				<Settings2 class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>{showMoreSettings ? '收起设置' : '展开设置'}</p>
		</Tooltip.Content>
	</Tooltip.Root>
</div>
