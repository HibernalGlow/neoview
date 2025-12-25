<script lang="ts">
/**
 * FolderToolbar - 文件面板工具栏
 * 参考 NeeView 的 FolderListView 工具栏设计
 */
import {
	Home,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	RefreshCw,
	FolderTree,
	List,
	Grid3x3,
	LayoutGrid,
	Image,
	CheckSquare,
	Trash2,
	MoreVertical,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	Search,
	CornerDownRight,
	ClipboardPaste,
	ListTree,
	Flame,
	Eye,
	Tags,
	RotateCcw,
	PanelRight,
	PanelLeft,
	PanelTop,
	PanelBottom,
	// 排序图标
	ALargeSmall,
	Calendar,
	HardDrive,
	FileType,
	Shuffle,
	Star,
	Heart,
	Package,
	Settings2,
	ChevronDown,
	ChevronUp as ChevronUpIcon,
	FolderSync,
	FilterX,
	Lock,
	Unlock,
	MousePointerClick
} from '@lucide/svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { unifiedHistoryStore } from '$lib/stores/unifiedHistory.svelte';
import { hoverPreviewSettings, hoverPreviewEnabled, hoverPreviewDelayMs } from '$lib/stores/hoverPreviewSettings.svelte';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import { virtualPanelSettingsStore, type TreePosition } from '$lib/stores/virtualPanelSettings.svelte';
import { getDefaultRating, saveDefaultRating } from '$lib/stores/emm/storage';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { folderThumbnailLoader, type WarmupProgress } from '$lib/utils/thumbnail';
import { addExcludedPath, isPathExcluded, removeExcludedPath, getExcludedPaths } from '$lib/stores/excludedPaths.svelte';
import { directoryTreeCache } from '../utils/directoryTreeCache';
import { reloadThumbnail, hasThumbnail } from '$lib/stores/thumbnailStoreV3.svelte';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import * as Progress from '$lib/components/ui/progress';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import * as Tabs from '$lib/components/ui/tabs';
import { get } from 'svelte/store';
import {
	folderTabActions,
	tabCanGoBack,
	tabCanGoForward,
	tabCanGoUp,
	tabSelectedItems,
	tabItems,
	tabCanGoBackTab,
	tabCanGoForwardTab,
	tabViewStyle,
	tabMultiSelectMode,
	tabDeleteMode,
	tabSortConfig,
	tabItemCount,
	tabShowSearchBar,
	tabShowMigrationBar,
	tabShowPenetrateSettingsBar,
	tabPenetrateMode,
	tabOpenInNewTabMode,
	tabDeleteStrategy,
	tabInlineTreeMode,
	tabCurrentPath,
	tabThumbnailWidthPercent,
	tabBannerWidthPercent,
	tabFolderTreeConfig,
	type SharedSortSettings,
	type SortInheritStrategy
} from '../stores/folderTabStore.svelte';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import type { FolderViewStyle, FolderSortField } from '../stores/folderPanelStore.svelte';

// 全局 store 别名（非虚拟模式使用）
const currentPathStore = tabCurrentPath;
const globalCanGoBack = tabCanGoBack;
const globalCanGoForward = tabCanGoForward;
const globalCanGoUp = tabCanGoUp;
const globalCanGoBackTab = tabCanGoBackTab;
const globalCanGoForwardTab = tabCanGoForwardTab;
const globalViewStyle = tabViewStyle;
const globalFolderTreeConfig = tabFolderTreeConfig;

// 文件树位置配置
const treePositionLabels: Record<TreePosition, string> = {
	left: '左侧',
	right: '右侧',
	top: '顶部',
	bottom: '底部'
};
const treePositionIcons: Record<TreePosition, typeof PanelLeft> = {
	left: PanelLeft,
	right: PanelRight,
	top: PanelTop,
	bottom: PanelBottom
};
const globalMultiSelectMode = tabMultiSelectMode;
const globalDeleteMode = tabDeleteMode;
const globalSortConfig = tabSortConfig;
const globalItemCount = tabItemCount;
const globalShowSearchBar = tabShowSearchBar;
const globalShowMigrationBar = tabShowMigrationBar;
const globalShowPenetrateSettingsBar = tabShowPenetrateSettingsBar;
const globalPenetrateMode = tabPenetrateMode;
const globalOpenInNewTabMode = tabOpenInNewTabMode;
const globalDeleteStrategy = tabDeleteStrategy;
const globalInlineTreeMode = tabInlineTreeMode;
const globalThumbnailWidthPercent = tabThumbnailWidthPercent;
const globalBannerWidthPercent = tabBannerWidthPercent;

interface Props {
	onRefresh?: () => void;
	onToggleFolderTree?: () => void;
	onGoBack?: () => void;
	onGoForward?: () => void;
	onGoUp?: () => void;
	onGoHome?: () => void;
	onSetHome?: () => void;
	onToggleDeleteStrategy?: () => void;
	onToggleInlineTree?: () => void;
	showRandomTagBar?: boolean;
	onToggleRandomTagBar?: () => void;
	/** 虚拟模式类型，用于显示正确的排序标签 */
	virtualMode?: 'bookmark' | 'history' | null;
	/** 是否垂直布局（左右位置时使用） */
	vertical?: boolean;
}

let { onRefresh, onToggleFolderTree, onGoBack, onGoForward, onGoUp, onGoHome, onSetHome, onToggleDeleteStrategy, onToggleInlineTree, showRandomTagBar = false, onToggleRandomTagBar, virtualMode = null, vertical = false }: Props = $props();

// ==================== 根据模式选择状态 ====================
// 虚拟模式使用独立的 virtualPanelSettingsStore，非虚拟模式使用全局 store

// 全局 store 订阅的本地状态
let globalViewStyleValue = $state<FolderViewStyle>('list');
let globalMultiSelectModeValue = $state(false);
let globalDeleteModeValue = $state(false);
let globalSortConfigValue = $state<{ field: FolderSortField; order: 'asc' | 'desc' }>({ field: 'name', order: 'asc' });
let globalShowSearchBarValue = $state(false);
let globalShowMigrationBarValue = $state(false);
let globalShowPenetrateSettingsBarValue = $state(false);
let globalPenetrateModeValue = $state(false);
let globalInlineTreeModeValue = $state(false);
let globalThumbnailWidthPercentValue = $state(20);
let globalBannerWidthPercentValue = $state(50);
let globalItemCountValue = $state(0);
let globalDeleteStrategyValue = $state<'trash' | 'permanent'>('trash');
let globalOpenInNewTabModeValue = $state(false);
let globalCanGoBackValue = $state(false);
let globalCanGoForwardValue = $state(false);
let globalCanGoUpValue = $state(false);
let globalCanGoBackTabValue = $state(false);
let globalCanGoForwardTabValue = $state(false);
let globalFolderTreeConfigValue = $state<{ visible: boolean; layout: TreePosition; size: number }>({ visible: false, layout: 'left', size: 200 });

// 订阅全局 store（非虚拟模式使用）
$effect(() => {
	if (virtualMode) return; // 虚拟模式不需要订阅全局 store
	const unsubs = [
		globalViewStyle.subscribe(v => globalViewStyleValue = v),
		globalMultiSelectMode.subscribe(v => globalMultiSelectModeValue = v),
		globalDeleteMode.subscribe(v => globalDeleteModeValue = v),
		globalSortConfig.subscribe(v => globalSortConfigValue = v),
		globalShowSearchBar.subscribe(v => globalShowSearchBarValue = v),
		globalShowMigrationBar.subscribe(v => globalShowMigrationBarValue = v),
		globalShowPenetrateSettingsBar.subscribe(v => globalShowPenetrateSettingsBarValue = v),
		globalPenetrateMode.subscribe(v => globalPenetrateModeValue = v),
		globalInlineTreeMode.subscribe(v => globalInlineTreeModeValue = v),
		globalThumbnailWidthPercent.subscribe(v => globalThumbnailWidthPercentValue = v),
		globalBannerWidthPercent.subscribe(v => globalBannerWidthPercentValue = v),
		globalItemCount.subscribe(v => globalItemCountValue = v),
		globalDeleteStrategy.subscribe(v => globalDeleteStrategyValue = v),
		globalOpenInNewTabMode.subscribe(v => globalOpenInNewTabModeValue = v),
		globalCanGoBack.subscribe(v => globalCanGoBackValue = v),
		globalCanGoForward.subscribe(v => globalCanGoForwardValue = v),
		globalCanGoUp.subscribe(v => globalCanGoUpValue = v),
		globalCanGoBackTab.subscribe(v => globalCanGoBackTabValue = v),
		globalCanGoForwardTab.subscribe(v => globalCanGoForwardTabValue = v),
		globalFolderTreeConfig.subscribe(v => globalFolderTreeConfigValue = v)
	];
	return () => unsubs.forEach(u => u());
});

// 文件树配置（根据模式选择）
let folderTreeConfig = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyFolderTreeConfig : virtualPanelSettingsStore.bookmarkFolderTreeConfig)
	: globalFolderTreeConfigValue);

// 计算当前使用的状态值
let viewStyle = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyViewStyle : virtualPanelSettingsStore.bookmarkViewStyle)
	: globalViewStyleValue);
let multiSelectMode = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyMultiSelectMode : virtualPanelSettingsStore.bookmarkMultiSelectMode)
	: globalMultiSelectModeValue);
let deleteMode = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyDeleteMode : virtualPanelSettingsStore.bookmarkDeleteMode)
	: globalDeleteModeValue);
let sortConfig = $derived(virtualMode 
	? { 
		field: virtualMode === 'history' ? virtualPanelSettingsStore.historySortField : virtualPanelSettingsStore.bookmarkSortField, 
		order: virtualMode === 'history' ? virtualPanelSettingsStore.historySortOrder : virtualPanelSettingsStore.bookmarkSortOrder 
	}
	: globalSortConfigValue);
let showSearchBar = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyShowSearchBar : virtualPanelSettingsStore.bookmarkShowSearchBar)
	: globalShowSearchBarValue);
let showMigrationBar = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyShowMigrationBar : virtualPanelSettingsStore.bookmarkShowMigrationBar)
	: globalShowMigrationBarValue);
let showPenetrateSettingsBar = $derived(virtualMode 
	? false // 虚拟模式暂不支持穿透设置栏
	: globalShowPenetrateSettingsBarValue);
let penetrateMode = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyPenetrateMode : virtualPanelSettingsStore.bookmarkPenetrateMode)
	: globalPenetrateModeValue);
let inlineTreeMode = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyInlineTreeMode : virtualPanelSettingsStore.bookmarkInlineTreeMode)
	: globalInlineTreeModeValue);
// 工具栏 tooltip 显示控制（默认关闭）
let showToolbarTooltip = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyShowToolbarTooltip : virtualPanelSettingsStore.bookmarkShowToolbarTooltip)
	: false);
let thumbnailWidthPercent = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyThumbnailWidthPercent : virtualPanelSettingsStore.bookmarkThumbnailWidthPercent)
	: globalThumbnailWidthPercentValue);
let bannerWidthPercent = $derived(globalBannerWidthPercentValue);
let itemCount = $derived(virtualMode ? 0 : globalItemCountValue);
let deleteStrategy = $derived(globalDeleteStrategyValue);
let openInNewTabMode = $derived(globalOpenInNewTabModeValue);
// 后退可用：当前标签页内可后退 或 可切换到上一个标签页
let canGoBack = $derived(globalCanGoBackValue || globalCanGoBackTabValue);
// 前进可用：当前标签页内可前进 或 可切换到下一个标签页
let canGoForward = $derived(globalCanGoForwardValue || globalCanGoForwardTabValue);
let canGoUp = $derived(globalCanGoUpValue);

// ==================== 状态修改函数 ====================
function handleSetViewStyle(style: FolderViewStyle) {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.setHistoryViewStyle(style);
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.setBookmarkViewStyle(style);
	} else {
		folderTabActions.setViewStyle(style);
	}
}

function handleSetSort(field: FolderSortField) {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.setHistorySort(field);
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.setBookmarkSort(field);
	} else {
		folderTabActions.setSort(field);
	}
}

function handleToggleMultiSelectMode() {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.toggleHistoryMultiSelectMode();
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.toggleBookmarkMultiSelectMode();
	} else {
		folderTabActions.toggleMultiSelectMode();
	}
}

function handleToggleDeleteMode() {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.toggleHistoryDeleteMode();
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.toggleBookmarkDeleteMode();
	} else {
		folderTabActions.toggleDeleteMode();
	}
}

function handleToggleShowSearchBar() {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.toggleHistoryShowSearchBar();
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.toggleBookmarkShowSearchBar();
	} else {
		folderTabActions.toggleShowSearchBar();
	}
}

function handleToggleShowMigrationBar() {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.toggleHistoryShowMigrationBar();
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.toggleBookmarkShowMigrationBar();
	} else {
		folderTabActions.toggleShowMigrationBar();
	}
}

function handleTogglePenetrateMode() {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.toggleHistoryPenetrateMode();
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.toggleBookmarkPenetrateMode();
	} else {
		folderTabActions.togglePenetrateMode();
	}
}

function handleToggleInlineTreeMode() {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.toggleHistoryInlineTreeMode();
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.toggleBookmarkInlineTreeMode();
	} else {
		onToggleInlineTree?.();
	}
}

function handleToggleShowToolbarTooltip() {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.toggleHistoryShowToolbarTooltip();
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.toggleBookmarkShowToolbarTooltip();
	}
}

function handleSetThumbnailWidthPercent(value: number) {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.setHistoryThumbnailWidthPercent(value);
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.setBookmarkThumbnailWidthPercent(value);
	} else {
		folderTabActions.setThumbnailWidthPercent(value);
	}
}

function handleSetBannerWidthPercent(value: number) {
	folderTabActions.setBannerWidthPercent(value);
}

function handleSetFolderTreeLayout(layout: TreePosition) {
	if (virtualMode === 'history') {
		virtualPanelSettingsStore.setHistoryFolderTreeLayout(layout);
	} else if (virtualMode === 'bookmark') {
		virtualPanelSettingsStore.setBookmarkFolderTreeLayout(layout);
	} else {
		folderTabActions.setFolderTreeLayout(layout);
	}
}

const viewStyles: { value: FolderViewStyle; icon: typeof List; label: string }[] = [
	{ value: 'list', icon: List, label: '列表' },
	{ value: 'content', icon: LayoutGrid, label: '内容' },
	{ value: 'banner', icon: Image, label: '横幅' },
	{ value: 'thumbnail', icon: Grid3x3, label: '缩略图' }
];

// 排序字段定义 - 虚拟模式下 date 显示为"添加时间"
function getSortFields() {
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
}
let sortFields = $derived(getSortFields());

function getCurrentSortIcon() {
	const fields = getSortFields();
	const current = fields.find((f) => f.value === sortConfig.field);
	return current?.icon ?? ALargeSmall;}

function handleGoBack() {
	onGoBack?.();
}

function handleGoForward() {
	onGoForward?.();
}

function handleGoUp() {
	// 直接导航到父目录
	onGoUp?.();
}

function handleGoHome() {
	onGoHome?.();
}

function handleSetHome(e: MouseEvent) {
	e.preventDefault();
	onSetHome?.();
}

function handleToggleSortOrder() {
	const newOrder = sortConfig.order === 'asc' ? 'desc' : 'asc';
	handleSetSort(sortConfig.field);
}

function handleToggleDeleteStrategy(e: MouseEvent) {
	e.preventDefault();
	onToggleDeleteStrategy?.();
}

function handleClearTreeCache() {
	directoryTreeCache.clear();
	// 刷新当前目录
	onRefresh?.();
}

function getCurrentViewIcon() {
	const current = viewStyles.find((v) => v.value === viewStyle);
	return current?.icon ?? List;}

// 预热状态
let isWarming = $state(false);
let warmupProgress = $state<WarmupProgress | null>(null);

// 更多设置栏展开状态
let showMoreSettings = $state(false);
let settingsTab = $state<'action' | 'display' | 'other'>('action');

// 展开面板状态
let sortPanelExpanded = $state(false);
let viewPanelExpanded = $state(false);
let treePanelExpanded = $state(false);

// 排序锁定状态（仅用于非虚拟模式）
let sortLockSettings = $state<SharedSortSettings>(folderTabActions.getSortSettings());

// 刷新排序锁定状态
function refreshSortLockSettings() {
	sortLockSettings = folderTabActions.getSortSettings();
}

function closePanels() {
	sortPanelExpanded = false;
	viewPanelExpanded = false;
	treePanelExpanded = false;
}

function toggleSortPanel() {
	const wasExpanded = sortPanelExpanded;
	closePanels();
	sortPanelExpanded = !wasExpanded;
	// 刷新排序锁定状态
	if (!wasExpanded) {
		refreshSortLockSettings();
	}
}

function toggleViewPanel() {
	const wasExpanded = viewPanelExpanded;
	closePanels();
	viewPanelExpanded = !wasExpanded;
}

function toggleTreePanel() {
	const wasExpanded = treePanelExpanded;
	closePanels();
	treePanelExpanded = !wasExpanded;
}

function toggleMoreSettings() {
	showMoreSettings = !showMoreSettings;
}

// 切换排序锁定（通过右键排序按钮触发）
function handleToggleSortLock(e: MouseEvent) {
	e.preventDefault();
	if (virtualMode) return; // 虚拟模式不支持排序锁定
	folderTabActions.toggleSortLock();
	refreshSortLockSettings();
}

// 设置排序继承策略
function handleSetSortStrategy(strategy: SortInheritStrategy) {
	if (virtualMode) return;
	folderTabActions.setSortStrategy(strategy);
	refreshSortLockSettings();
}

// 设置排序锁定状态
function handleSetSortLocked(locked: boolean) {
	if (virtualMode) return;
	folderTabActions.setSortLocked(locked);
	refreshSortLockSettings();
}


async function startWarmup() {
	const path = get(currentPathStore);
	if (!path || isWarming) return;
	
	isWarming = true;
	warmupProgress = null;
	
	try {
		await folderThumbnailLoader.warmupRecursive(
			path,
			(progress) => {
				warmupProgress = { ...progress };
			},
			3 // 默认3层深度
		);
	} catch (error) {
		console.error('预热失败:', error);
	} finally {
		isWarming = false;
	}
}

function cancelWarmup() {
	folderThumbnailLoader.cancelWarmup();
}

// 清理失效条目
let isCleaningInvalid = $state(false);
let cleanupResult = $state<{ removed: number } | null>(null);

async function handleCleanupInvalid() {
	if (isCleaningInvalid) return;
	isCleaningInvalid = true;
	cleanupResult = null;
	
	try {
		let removed = 0;
		if (virtualMode === 'history') {
			removed = await unifiedHistoryStore.cleanupInvalid();
		} else if (virtualMode === 'bookmark') {
			removed = await bookmarkStore.cleanupInvalid();
		}
		cleanupResult = { removed };
		
		// 3秒后自动隐藏结果
		setTimeout(() => {
			cleanupResult = null;
		}, 3000);
		
		// 刷新列表
		if (removed > 0) {
			onRefresh?.();
		}
	} catch (e) {
		console.error('清理失效条目失败:', e);
	} finally {
		isCleaningInvalid = false;
	}
}

// 批量重载缩略图状态
let isReloadingThumbnails = $state(false);
let reloadThumbnailsProgress = $state<{ current: number; total: number } | null>(null);

// 强制重载当前目录所有项目的缩略图
async function handleReloadAllThumbnails() {
	const path = get(currentPathStore);
	if (!path || isReloadingThumbnails) return;
	
	// 获取当前目录下的项目（文件和文件夹）
	const items = get(tabItems);
	if (items.length === 0) {
		showErrorToast('重载缩略图', '当前目录为空');
		return;
	}
	
	isReloadingThumbnails = true;
	reloadThumbnailsProgress = { current: 0, total: items.length };
	
	try {
		let reloadedCount = 0;
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			reloadThumbnailsProgress = { current: i + 1, total: items.length };
			
			try {
				await reloadThumbnail(item.path, path);
				reloadedCount++;
			} catch (e) {
				console.debug(`重载缩略图失败: ${item.path}`, e);
			}
		}
		
		showSuccessToast('重载缩略图', `已重载 ${reloadedCount} 个缩略图`);
	} catch (e) {
		console.error('批量重载缩略图失败:', e);
		showErrorToast('重载缩略图', '操作失败');
	} finally {
		isReloadingThumbnails = false;
		reloadThumbnailsProgress = null;
	}
}

// 批量重载选中项的缩略图
async function handleReloadSelectedThumbnails() {
	const path = get(currentPathStore);
	if (!path || isReloadingThumbnails) return;
	
	// 获取选中的文件（使用正确的 store）
	const selectedItemsSet = get(tabSelectedItems);
	if (selectedItemsSet.size === 0) {
		showErrorToast('重载缩略图', '没有选中的文件');
		return;
	}
	
	isReloadingThumbnails = true;
	reloadThumbnailsProgress = { current: 0, total: selectedItemsSet.size };
	
	try {
		let reloadedCount = 0;
		let i = 0;
		for (const itemPath of selectedItemsSet) {
			i++;
			reloadThumbnailsProgress = { current: i, total: selectedItemsSet.size };
			
			try {
				await reloadThumbnail(itemPath, path);
				reloadedCount++;
			} catch (e) {
				console.debug(`重载缩略图失败: ${itemPath}`, e);
			}
		}
		
		showSuccessToast('重载缩略图', `已重载 ${reloadedCount} 个缩略图`);
	} catch (e) {
		console.error('批量重载选中缩略图失败:', e);
		showErrorToast('重载缩略图', '操作失败');
	} finally {
		isReloadingThumbnails = false;
		reloadThumbnailsProgress = null;
	}
}
</script>

<div class={vertical ? "flex flex-col items-center gap-1 px-1 py-2 h-full overflow-y-auto" : "flex flex-wrap items-center gap-1 px-2 py-1.5"}>
	<!-- 导航按钮组 -->
	<div class={vertical ? "flex flex-col items-center gap-0.5" : "flex items-center gap-0.5"}>
		{#if !virtualMode}
			<!-- 普通文件夹模式：显示所有导航按钮 -->
			<Tooltip.Root disabled={!showToolbarTooltip}>
				<Tooltip.Trigger>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7"
						onclick={handleGoHome}
						oncontextmenu={handleSetHome}
					>
						<Home class="h-4 w-4" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>主页 (单击返回主页，右键设置当前路径为主页)</p>
				</Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root disabled={!showToolbarTooltip}>
				<Tooltip.Trigger>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7"
						disabled={!canGoBack && !canGoUp}
						onclick={handleGoBack}
					>
						<ChevronLeft class="h-4 w-4" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>后退 (Alt+←)</p>
				</Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root disabled={!showToolbarTooltip}>
				<Tooltip.Trigger>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7"
						disabled={!canGoForward}
						onclick={handleGoForward}
					>
						<ChevronRight class="h-4 w-4" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>前进 (Alt+→)</p>
				</Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root disabled={!showToolbarTooltip}>
				<Tooltip.Trigger>
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7"
						disabled={!canGoUp}
						onclick={handleGoUp}
					>
						<ChevronUp class="h-4 w-4" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>向上 (Alt+↑)</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}

		<Tooltip.Root disabled={!showToolbarTooltip}>
			<Tooltip.Trigger>
				<Button variant="ghost" size="icon" class="h-7 w-7" onclick={onRefresh}>
					<RefreshCw class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{virtualMode === 'history' ? '重新加载历史' : virtualMode === 'bookmark' ? '重新加载书签' : '刷新'}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</div>

	<!-- 分隔 -->
	<div class={vertical ? "bg-border my-1 w-5 h-px" : "bg-border mx-1 h-5 w-px"}></div>

	<!-- 同步文件夹按钮（仅在书签/历史模式下显示） -->
	{#if virtualMode}
		<Tooltip.Root disabled={!showToolbarTooltip}>
			<Tooltip.Trigger>
				<Button
					variant={virtualMode === 'history' 
						? (historySettingsStore.syncFileTreeOnHistorySelect ? 'default' : 'ghost')
						: (historySettingsStore.syncFileTreeOnBookmarkSelect ? 'default' : 'ghost')}
					size="icon"
					class="h-7 w-7"
					onclick={() => {
						if (virtualMode === 'history') {
							historySettingsStore.setSyncFileTreeOnHistorySelect(!historySettingsStore.syncFileTreeOnHistorySelect);
						} else {
							historySettingsStore.setSyncFileTreeOnBookmarkSelect(!historySettingsStore.syncFileTreeOnBookmarkSelect);
						}
					}}
				>
					<FolderSync class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>同步文件夹 {#if virtualMode === 'history'}{historySettingsStore.syncFileTreeOnHistorySelect ? '(已开启)' : '(已关闭)'}{:else}{historySettingsStore.syncFileTreeOnBookmarkSelect ? '(已开启)' : '(已关闭)'}{/if}</p>
				<p class="text-muted-foreground text-xs">点击项目时自动在文件夹页签打开所在目录</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 清理失效条目按钮 -->
		<Tooltip.Root disabled={!showToolbarTooltip}>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7 {isCleaningInvalid ? 'animate-pulse' : ''}"
					onclick={handleCleanupInvalid}
					disabled={isCleaningInvalid}
				>
					<FilterX class="h-4 w-4 {cleanupResult ? (cleanupResult.removed > 0 ? 'text-green-500' : 'text-muted-foreground') : ''}" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>清理失效{virtualMode === 'history' ? '历史' : '书签'}</p>
				<p class="text-muted-foreground text-xs">移除已不存在的文件和文件夹</p>
				{#if cleanupResult}
					<p class="text-green-500 text-xs">已清理 {cleanupResult.removed} 条</p>
				{/if}
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}

	<!-- 排序按钮 -->
	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button 
				variant={sortPanelExpanded ? 'default' : (sortLockSettings.locked && !virtualMode ? 'secondary' : 'ghost')} 
				size="sm" 
				class="h-7 gap-0.5 px-1.5"
				onclick={toggleSortPanel}
				oncontextmenu={handleToggleSortLock}
			>
				{#if sortLockSettings.locked && !virtualMode}
					<Lock class="h-3 w-3 text-amber-500" />
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
			<p>排序: {sortFields.find((f) => f.value === sortConfig.field)?.label} {sortConfig.field !== 'random' ? (sortConfig.order === 'asc' ? '升序' : '降序') : ''}</p>
			{#if !virtualMode}
				<p class="text-muted-foreground text-xs">{sortLockSettings.locked ? '🔒 已锁定 (右键解锁)' : '右键锁定排序'}</p>
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
					onclick={handleToggleMultiSelectMode}
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
					onclick={handleToggleDeleteMode}
					oncontextmenu={handleToggleDeleteStrategy}
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
					onclick={onToggleFolderTree}
					oncontextmenu={(e: MouseEvent) => { e.preventDefault(); toggleTreePanel(); }}
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
					onclick={handleToggleShowSearchBar}
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
					onclick={handleToggleShowMigrationBar}
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
					onclick={handleTogglePenetrateMode}
					oncontextmenu={(e: MouseEvent) => {
						e.preventDefault();
						// 右键切换穿透设置栏显示
						folderTabActions.toggleShowPenetrateSettingsBar();
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
					onclick={toggleViewPanel}
				>
					{@const ViewIcon = getCurrentViewIcon()}
					<ViewIcon class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>视图样式</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 更多设置按钮（展开/折叠设置栏） -->
		<Tooltip.Root disabled={!showToolbarTooltip}>
			<Tooltip.Trigger>
				<Button 
					variant={showMoreSettings ? 'secondary' : 'ghost'} 
					size="icon" 
					class="h-7 w-7"
					onclick={toggleMoreSettings}
				>
					<Settings2 class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{showMoreSettings ? '收起设置' : '展开设置'}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</div>
</div>

<!-- 排序展开面板 -->
{#if sortPanelExpanded}
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
							onclick={() => handleSetSort(field.value)}
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
					onclick={handleToggleSortOrder}
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
						onclick={() => handleSetSortLocked(!sortLockSettings.locked)}
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
								onclick={() => handleSetSortStrategy('default')}
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
								onclick={() => handleSetSortStrategy('inherit')}
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
{/if}

<!-- 视图展开面板 -->
{#if viewPanelExpanded}
	<div class="flex flex-wrap items-center gap-1 border-t border-border/50 px-2 py-1">
		<span class="text-muted-foreground text-xs mr-1">视图</span>
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			{#each viewStyles as style}
				{@const StyleIcon = style.icon}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={viewStyle === style.value ? 'default' : 'ghost'}
							size="icon"
							class="h-6 w-6 rounded-full"
							onclick={() => handleSetViewStyle(style.value)}
						>
							<StyleIcon class="h-3 w-3" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{style.label}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/each}
		</div>
	</div>
{/if}

<!-- 文件树位置展开面板 -->
{#if treePanelExpanded}
	<div class="flex flex-wrap items-center gap-1 border-t border-border/50 px-2 py-1">
		<span class="text-muted-foreground text-xs mr-1">文件树位置</span>
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			{#each Object.entries(treePositionLabels) as [pos, label]}
				{@const Icon = treePositionIcons[pos as TreePosition]}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={folderTreeConfig.layout === pos ? 'default' : 'ghost'}
							size="icon"
							class="h-6 w-6 rounded-full"
							onclick={() => handleSetFolderTreeLayout(pos as TreePosition)}
						>
							<Icon class="h-3 w-3" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{label}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/each}
		</div>
		<div class="mx-2 h-4 w-px bg-border"></div>
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={inlineTreeMode ? 'default' : 'ghost'}
					size="sm"
					class="h-6 text-xs px-2"
					onclick={() => onToggleInlineTree?.()}
				>
					<ListTree class="h-3 w-3 mr-1" />
					主视图树
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>主视图树模式</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</div>
{/if}

<!-- 可展开的更多设置栏（shadcn Tabs） -->
{#if showMoreSettings}
	<div class="border-t bg-muted/20">
		<Tabs.Root value={settingsTab} onValueChange={(v) => settingsTab = v as typeof settingsTab} class="w-full">
			<div class="flex items-center px-2">
				<Tabs.List class="h-8 bg-transparent">
					<Tabs.Trigger value="action" class="text-xs px-3 py-1 h-7">快捷操作</Tabs.Trigger>
					<Tabs.Trigger value="display" class="text-xs px-3 py-1 h-7">显示设置</Tabs.Trigger>
					<Tabs.Trigger value="other" class="text-xs px-3 py-1 h-7">其他</Tabs.Trigger>
				</Tabs.List>
				<div class="flex-1"></div>
				<span class="text-[10px] text-muted-foreground">文件数: {itemCount}</span>
			</div>

			<Tabs.Content value="action" class="px-2 py-2 mt-0">
				<div class="flex flex-wrap items-center gap-2">
					<Button 
						variant="outline" 
						size="sm" 
						class="h-7 text-xs {isWarming ? 'text-orange-500 border-orange-500' : ''}"
						onclick={isWarming ? cancelWarmup : startWarmup}
					>
						<Flame class="h-3 w-3 mr-1" />
						{isWarming ? '取消预热' : '预热目录'}
					</Button>
					<Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => folderTabActions.toggleRecursiveMode()}>
						递归显示
					</Button>
					<Button variant="outline" size="sm" class="h-7 text-xs" onclick={handleClearTreeCache}>
						<RefreshCw class="h-3 w-3 mr-1" />
						刷新树
					</Button>
					<Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => folderTabActions.clearHistory()}>
						清除历史
					</Button>
					{#if $currentPathStore && !isPathExcluded($currentPathStore)}
						<Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => $currentPathStore && addExcludedPath($currentPathStore)}>
							<Trash2 class="h-3 w-3 mr-1" />
							排除目录
						</Button>
					{:else if $currentPathStore}
						<Button variant="destructive" size="sm" class="h-7 text-xs" onclick={() => $currentPathStore && removeExcludedPath($currentPathStore)}>
							取消排除
						</Button>
					{/if}
					<!-- 强制重载当前目录所有缩略图 -->
					<Button 
						variant="outline" 
						size="sm" 
						class="h-7 text-xs {isReloadingThumbnails ? 'text-blue-500 border-blue-500' : ''}"
						onclick={handleReloadAllThumbnails}
						disabled={isReloadingThumbnails}
					>
						<RefreshCw class="h-3 w-3 mr-1 {isReloadingThumbnails ? 'animate-spin' : ''}" />
						{isReloadingThumbnails && reloadThumbnailsProgress 
							? `重载中 (${reloadThumbnailsProgress.current}/${reloadThumbnailsProgress.total})` 
							: '重载所有缩略图'}
					</Button>
					{#if multiSelectMode}
						<Button 
							variant="outline" 
							size="sm" 
							class="h-7 text-xs {isReloadingThumbnails ? 'text-blue-500 border-blue-500' : ''}"
							onclick={handleReloadSelectedThumbnails}
							disabled={isReloadingThumbnails}
						>
							<RefreshCw class="h-3 w-3 mr-1 {isReloadingThumbnails ? 'animate-spin' : ''}" />
							重载选中缩略图
						</Button>
					{/if}
				</div>
			</Tabs.Content>

			<Tabs.Content value="display" class="px-2 py-2 mt-0">
				<div class="flex flex-wrap items-center gap-4 text-xs">
					<!-- 悬停预览 -->
					<div class="flex items-center gap-2">
						<Eye class="h-3.5 w-3.5 text-muted-foreground" />
						<span class="text-muted-foreground">预览:</span>
						<Button 
							variant={$hoverPreviewEnabled ? 'default' : 'outline'} 
							size="sm" 
							class="h-6 text-xs px-2"
							onclick={() => hoverPreviewSettings.toggle()}
						>
							{$hoverPreviewEnabled ? '开' : '关'}
						</Button>
						{#if $hoverPreviewEnabled}
							<select 
								class="h-6 bg-background border rounded text-xs px-1"
								value={$hoverPreviewDelayMs}
								onchange={(e) => hoverPreviewSettings.setDelayMs(parseInt((e.target as HTMLSelectElement).value))}
							>
								<option value="200">200ms</option>
								<option value="500">500ms</option>
								<option value="800">800ms</option>
								<option value="1200">1200ms</option>
							</select>
						{/if}
					</div>

					<!-- 穿透内部显示 -->
					<div class="flex items-center gap-2">
						<Package class="h-3.5 w-3.5 text-muted-foreground" />
						<span class="text-muted-foreground">内部文件:</span>
						<select 
							class="h-6 bg-background border rounded text-xs px-1"
							value={$fileBrowserStore.penetrateShowInnerFile}
							onchange={(e) => fileBrowserStore.setPenetrateShowInnerFile((e.target as HTMLSelectElement).value as 'none' | 'penetrate' | 'always')}
						>
							<option value="none">不显示</option>
							<option value="penetrate">穿透时</option>
							<option value="always">始终</option>
						</select>
						<select 
							class="h-6 bg-background border rounded text-xs px-1"
							value={$fileBrowserStore.penetrateInnerFileCount}
							onchange={(e) => fileBrowserStore.setPenetrateInnerFileCount((e.target as HTMLSelectElement).value as 'single' | 'all')}
						>
							<option value="single">单文件</option>
							<option value="all">多文件</option>
						</select>
					</div>

					<!-- 纯媒体文件夹点击直接打开 -->
					<div class="flex items-center gap-2">
						<Image class="h-3.5 w-3.5 text-muted-foreground" />
						<span class="text-muted-foreground">媒体文件夹:</span>
						<Button 
							variant={$fileBrowserStore.penetratePureMediaFolderOpen ? 'default' : 'outline'} 
							size="sm" 
							class="h-6 text-xs"
							onclick={() => fileBrowserStore.setPenetratePureMediaFolderOpen(!$fileBrowserStore.penetratePureMediaFolderOpen)}
						>
							{$fileBrowserStore.penetratePureMediaFolderOpen ? '点击打开' : '点击进入'}
						</Button>
					</div>

					<!-- 缩略图大小 -->
					<div class="flex items-center gap-2">
						<Grid3x3 class="h-3.5 w-3.5 text-muted-foreground" />
						<span class="text-muted-foreground">缩略图:</span>
						<input
							type="range"
							min="10"
							max="90"
							value={thumbnailWidthPercent}
							oninput={(e) => handleSetThumbnailWidthPercent(parseInt((e.target as HTMLInputElement).value))}
							class="w-20 h-4 accent-primary"
						/>
						<span class="text-muted-foreground w-10">{Math.round(48 + (thumbnailWidthPercent - 10) * 3)}px</span>
					</div>

					<!-- 横幅大小 -->
					<div class="flex items-center gap-2">
						<Image class="h-3.5 w-3.5 text-muted-foreground" />
						<span class="text-muted-foreground">横幅:</span>
						<input
							type="range"
							min="20"
							max="100"
							step="10"
							value={bannerWidthPercent}
							oninput={(e) => handleSetBannerWidthPercent(parseInt((e.target as HTMLInputElement).value))}
							class="w-20 h-4 accent-primary"
						/>
						<span class="text-muted-foreground w-10">{Math.floor(100 / bannerWidthPercent)}列</span>
					</div>
				</div>
			</Tabs.Content>

			<Tabs.Content value="other" class="px-2 py-2 mt-0">
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
								onclick={handleToggleShowToolbarTooltip}
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
			</Tabs.Content>
		</Tabs.Root>
	</div>
{/if}

<!-- 预热进度条 -->
{#if warmupProgress}
	<div class="border-b px-2 py-1 bg-muted/30">
		<div class="flex items-center justify-between text-[10px] text-muted-foreground">
			<span class="truncate max-w-[200px]">🔥 {warmupProgress.current}</span>
			<span>{warmupProgress.completed}/{warmupProgress.total}</span>
		</div>
		<Progress.Root
			value={warmupProgress.total ? (warmupProgress.completed / warmupProgress.total) * 100 : 0}
			class="h-1.5 mt-1"
		/>
	</div>
{/if}
