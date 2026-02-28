<script lang="ts">
/**
 * FolderToolbar - 文件面板工具栏（重构版）
 * 参考 NeeView 的 FolderListView 工具栏设计
 * 将原有 1500+ 行代码拆分为多个子组件
 */
import { virtualPanelSettingsStore, type TreePosition } from '$lib/stores/virtualPanelSettings.svelte';
import {
	folderTabActions,
	tabCanGoBack,
	tabCanGoForward,
	tabCanGoUp,
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
	tabThumbnailWidthPercent,
	tabBannerWidthPercent,
	tabFolderTreeConfig
} from '../../stores/folderTabStore';
import type { FolderViewStyle, FolderSortField } from '../../stores/folderPanelStore';
import type { SortConfig, SortLockSettings, FolderTreeConfig, VirtualMode } from './types';

// 子组件导入
import NavigationButtons from './NavigationButtons.svelte';
import ActionButtons from './ActionButtons.svelte';
import SortPanel from './SortPanel.svelte';
import ViewPanel from './ViewPanel.svelte';
import TreePanel from './TreePanel.svelte';
import MoreSettingsTabs from './MoreSettingsTabs.svelte';

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
	virtualMode?: VirtualMode;
	vertical?: boolean;
}

let { 
	onRefresh, onToggleFolderTree, onGoBack, onGoForward, onGoUp, onGoHome, 
	onSetHome, onToggleDeleteStrategy, onToggleInlineTree, 
	showRandomTagBar = false, onToggleRandomTagBar, virtualMode = null, vertical = false 
}: Props = $props();

// ==================== 全局 store 订阅状态 ====================
let globalViewStyleValue = $state<FolderViewStyle>('list');
let globalMultiSelectModeValue = $state(false);
let globalDeleteModeValue = $state(false);
let globalSortConfigValue = $state<SortConfig>({ field: 'name', order: 'asc' });
let globalShowSearchBarValue = $state(false);
let globalShowMigrationBarValue = $state(false);
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
let globalFolderTreeConfigValue = $state<FolderTreeConfig>({ visible: false, layout: 'left', size: 200 });

// 订阅全局 store
$effect(() => {
	if (virtualMode) return;
	const unsubs = [
		tabViewStyle.subscribe(v => globalViewStyleValue = v),
		tabMultiSelectMode.subscribe(v => globalMultiSelectModeValue = v),
		tabDeleteMode.subscribe(v => globalDeleteModeValue = v),
		tabSortConfig.subscribe(v => globalSortConfigValue = v),
		tabShowSearchBar.subscribe(v => globalShowSearchBarValue = v),
		tabShowMigrationBar.subscribe(v => globalShowMigrationBarValue = v),
		tabPenetrateMode.subscribe(v => globalPenetrateModeValue = v),
		tabInlineTreeMode.subscribe(v => globalInlineTreeModeValue = v),
		tabThumbnailWidthPercent.subscribe(v => globalThumbnailWidthPercentValue = v),
		tabBannerWidthPercent.subscribe(v => globalBannerWidthPercentValue = v),
		tabItemCount.subscribe(v => globalItemCountValue = v),
		tabDeleteStrategy.subscribe(v => globalDeleteStrategyValue = v),
		tabOpenInNewTabMode.subscribe(v => globalOpenInNewTabModeValue = v),
		tabCanGoBack.subscribe(v => globalCanGoBackValue = v),
		tabCanGoForward.subscribe(v => globalCanGoForwardValue = v),
		tabCanGoUp.subscribe(v => globalCanGoUpValue = v),
		tabCanGoBackTab.subscribe(v => globalCanGoBackTabValue = v),
		tabCanGoForwardTab.subscribe(v => globalCanGoForwardTabValue = v),
		tabFolderTreeConfig.subscribe(v => globalFolderTreeConfigValue = v)
	];
	return () => unsubs.forEach(u => u());
});

// ==================== 派生状态 ====================
let folderTreeConfig = $derived<FolderTreeConfig>(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyFolderTreeConfig : virtualPanelSettingsStore.bookmarkFolderTreeConfig)
	: globalFolderTreeConfigValue);

let viewStyle = $derived<FolderViewStyle>(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyViewStyle : virtualPanelSettingsStore.bookmarkViewStyle)
	: globalViewStyleValue);

let multiSelectMode = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyMultiSelectMode : virtualPanelSettingsStore.bookmarkMultiSelectMode)
	: globalMultiSelectModeValue);

let deleteMode = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyDeleteMode : virtualPanelSettingsStore.bookmarkDeleteMode)
	: globalDeleteModeValue);

let sortConfig = $derived<SortConfig>(virtualMode 
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

let penetrateMode = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyPenetrateMode : virtualPanelSettingsStore.bookmarkPenetrateMode)
	: globalPenetrateModeValue);

let inlineTreeMode = $derived(virtualMode 
	? (virtualMode === 'history' ? virtualPanelSettingsStore.historyInlineTreeMode : virtualPanelSettingsStore.bookmarkInlineTreeMode)
	: globalInlineTreeModeValue);

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
let canGoBack = $derived(globalCanGoBackValue || globalCanGoBackTabValue);
let canGoForward = $derived(globalCanGoForwardValue || globalCanGoForwardTabValue);
let canGoUp = $derived(globalCanGoUpValue);

// ==================== 面板展开状态 ====================
let sortPanelExpanded = $state(false);
let viewPanelExpanded = $state(false);
let treePanelExpanded = $state(false);
let showMoreSettings = $state(false);
let sortLockSettings = $state<SortLockSettings>(folderTabActions.getSortSettings());

function refreshSortLockSettings() { sortLockSettings = folderTabActions.getSortSettings(); }
function closePanels() { sortPanelExpanded = false; viewPanelExpanded = false; treePanelExpanded = false; }
function toggleSortPanel() { const was = sortPanelExpanded; closePanels(); sortPanelExpanded = !was; if (!was) refreshSortLockSettings(); }
function toggleViewPanel() { const was = viewPanelExpanded; closePanels(); viewPanelExpanded = !was; }
function toggleTreePanel() { const was = treePanelExpanded; closePanels(); treePanelExpanded = !was; }
function toggleMoreSettings() { showMoreSettings = !showMoreSettings; }

// ==================== 状态修改函数 ====================
function handleSetViewStyle(style: FolderViewStyle) {
	if (virtualMode === 'history') virtualPanelSettingsStore.setHistoryViewStyle(style);
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.setBookmarkViewStyle(style);
	else folderTabActions.setViewStyle(style);
}

function handleSetSort(field: FolderSortField) {
	if (virtualMode === 'history') virtualPanelSettingsStore.setHistorySort(field);
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.setBookmarkSort(field);
	else folderTabActions.setSort(field);
}

function handleToggleMultiSelectMode() {
	if (virtualMode === 'history') virtualPanelSettingsStore.toggleHistoryMultiSelectMode();
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.toggleBookmarkMultiSelectMode();
	else folderTabActions.toggleMultiSelectMode();
}

function handleToggleDeleteMode() {
	if (virtualMode === 'history') virtualPanelSettingsStore.toggleHistoryDeleteMode();
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.toggleBookmarkDeleteMode();
	else folderTabActions.toggleDeleteMode();
}

function handleToggleShowSearchBar() {
	if (virtualMode === 'history') virtualPanelSettingsStore.toggleHistoryShowSearchBar();
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.toggleBookmarkShowSearchBar();
	else folderTabActions.toggleShowSearchBar();
}

function handleToggleShowMigrationBar() {
	if (virtualMode === 'history') virtualPanelSettingsStore.toggleHistoryShowMigrationBar();
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.toggleBookmarkShowMigrationBar();
	else folderTabActions.toggleShowMigrationBar();
}

function handleTogglePenetrateMode() {
	if (virtualMode === 'history') virtualPanelSettingsStore.toggleHistoryPenetrateMode();
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.toggleBookmarkPenetrateMode();
	else folderTabActions.togglePenetrateMode();
}

function handleToggleInlineTreeMode() {
	if (virtualMode === 'history') virtualPanelSettingsStore.toggleHistoryInlineTreeMode();
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.toggleBookmarkInlineTreeMode();
	else onToggleInlineTree?.();
}

function handleToggleShowToolbarTooltip() {
	if (virtualMode === 'history') virtualPanelSettingsStore.toggleHistoryShowToolbarTooltip();
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.toggleBookmarkShowToolbarTooltip();
}

function handleSetThumbnailWidthPercent(value: number) {
	if (virtualMode === 'history') virtualPanelSettingsStore.setHistoryThumbnailWidthPercent(value);
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.setBookmarkThumbnailWidthPercent(value);
	else folderTabActions.setThumbnailWidthPercent(value);
}

function handleSetBannerWidthPercent(value: number) { folderTabActions.setBannerWidthPercent(value); }

function handleSetFolderTreeLayout(layout: TreePosition) {
	if (virtualMode === 'history') virtualPanelSettingsStore.setHistoryFolderTreeLayout(layout);
	else if (virtualMode === 'bookmark') virtualPanelSettingsStore.setBookmarkFolderTreeLayout(layout);
	else folderTabActions.setFolderTreeLayout(layout);
}

function handleToggleSortOrder() { handleSetSort(sortConfig.field); }
function handleToggleSortLock(e: MouseEvent) { e.preventDefault(); if (virtualMode) return; folderTabActions.toggleSortLock(); refreshSortLockSettings(); }
function handleSetSortLocked(locked: boolean) { if (virtualMode) return; folderTabActions.setSortLocked(locked); refreshSortLockSettings(); }
function handleSetDefaultSortScope(scope: 'global' | 'tab') { if (virtualMode) return; folderTabActions.setDefaultSortScope(scope); refreshSortLockSettings(); }
function handleSetCurrentSortAsDefault(scope?: 'global' | 'tab') { if (virtualMode) return; folderTabActions.setCurrentSortAsDefault(scope); refreshSortLockSettings(); }
function handleClearFolderSortMemory(path?: string) { if (virtualMode) return; folderTabActions.clearFolderSortMemory(path); refreshSortLockSettings(); }
function handleSetHome(e: MouseEvent) { e.preventDefault(); onSetHome?.(); }
function handleToggleDeleteStrategy(e: MouseEvent) { e.preventDefault(); onToggleDeleteStrategy?.(); }
function handleToggleShowPenetrateSettingsBar() { folderTabActions.toggleShowPenetrateSettingsBar(); }
</script>

<div class={vertical ? "flex flex-col items-center gap-1 px-1 py-2 h-full overflow-y-auto" : "flex flex-wrap items-center gap-1 px-2 py-1.5"}>
	<!-- 导航按钮组 -->
	<NavigationButtons
		{virtualMode}
		{vertical}
		{showToolbarTooltip}
		{canGoBack}
		{canGoForward}
		{canGoUp}
		onGoHome={() => onGoHome?.()}
		onSetHome={handleSetHome}
		onGoBack={() => onGoBack?.()}
		onGoForward={() => onGoForward?.()}
		onGoUp={() => onGoUp?.()}
		onRefresh={() => onRefresh?.()}
	/>

	<!-- 功能按钮组 -->
	<ActionButtons
		{virtualMode}
		{vertical}
		{showToolbarTooltip}
		{multiSelectMode}
		{deleteMode}
		{deleteStrategy}
		{folderTreeConfig}
		{inlineTreeMode}
		{showSearchBar}
		{showMigrationBar}
		{showRandomTagBar}
		{penetrateMode}
		{openInNewTabMode}
		{sortConfig}
		{sortLockSettings}
		{viewStyle}
		{sortPanelExpanded}
		{viewPanelExpanded}
		{treePanelExpanded}
		{showMoreSettings}
		onToggleMultiSelectMode={handleToggleMultiSelectMode}
		onToggleDeleteMode={handleToggleDeleteMode}
		onToggleDeleteStrategy={handleToggleDeleteStrategy}
		onToggleFolderTree={() => onToggleFolderTree?.()}
		onToggleTreePanel={toggleTreePanel}
		onToggleShowSearchBar={handleToggleShowSearchBar}
		onToggleShowMigrationBar={handleToggleShowMigrationBar}
		onToggleRandomTagBar={() => onToggleRandomTagBar?.()}
		onTogglePenetrateMode={handleTogglePenetrateMode}
		onToggleShowPenetrateSettingsBar={handleToggleShowPenetrateSettingsBar}
		onToggleSortPanel={toggleSortPanel}
		onToggleSortLock={handleToggleSortLock}
		onToggleViewPanel={toggleViewPanel}
		onToggleMoreSettings={toggleMoreSettings}
	/>
</div>

<!-- 排序展开面板 -->
{#if sortPanelExpanded}
	<SortPanel
		{sortConfig}
		{sortLockSettings}
		{virtualMode}
		onSetSort={handleSetSort}
		onToggleSortOrder={handleToggleSortOrder}
		onSetSortLocked={handleSetSortLocked}
		onSetDefaultSortScope={handleSetDefaultSortScope}
		onSetCurrentSortAsDefault={handleSetCurrentSortAsDefault}
		onClearFolderSortMemory={handleClearFolderSortMemory}
	/>
{/if}

<!-- 视图展开面板 -->
{#if viewPanelExpanded}
	<ViewPanel {viewStyle} onSetViewStyle={handleSetViewStyle} />
{/if}

<!-- 文件树位置展开面板 -->
{#if treePanelExpanded}
	<TreePanel
		{folderTreeConfig}
		{inlineTreeMode}
		onSetFolderTreeLayout={handleSetFolderTreeLayout}
		onToggleInlineTree={handleToggleInlineTreeMode}
	/>
{/if}

<!-- 更多设置栏 -->
{#if showMoreSettings}
	<MoreSettingsTabs
		{virtualMode}
		{showToolbarTooltip}
		{multiSelectMode}
		{thumbnailWidthPercent}
		{bannerWidthPercent}
		{itemCount}
		onSetThumbnailWidthPercent={handleSetThumbnailWidthPercent}
		onSetBannerWidthPercent={handleSetBannerWidthPercent}
		onToggleShowToolbarTooltip={handleToggleShowToolbarTooltip}
		onRefresh={() => onRefresh?.()}
	/>
{/if}
