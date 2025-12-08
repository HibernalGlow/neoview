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
	ChevronUp as ChevronUpIcon
} from '@lucide/svelte';
import { hoverPreviewSettings, hoverPreviewEnabled, hoverPreviewDelayMs } from '$lib/stores/hoverPreviewSettings.svelte';
import { getDefaultRating, saveDefaultRating } from '$lib/stores/emm/storage';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { folderThumbnailLoader, type WarmupProgress } from '$lib/utils/thumbnail';
import { addExcludedPath, isPathExcluded, removeExcludedPath, getExcludedPaths } from '$lib/stores/excludedPaths.svelte';
import { directoryTreeCache } from '../utils/directoryTreeCache';
import * as Progress from '$lib/components/ui/progress';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import {
	folderTabActions,
	tabCanGoBack,
	tabCanGoForward,
	tabCanGoUp,
	tabViewStyle,
	tabMultiSelectMode,
	tabDeleteMode,
	tabSortConfig,
	tabItemCount,
	tabShowSearchBar,
	tabShowMigrationBar,
	tabPenetrateMode,
	tabOpenInNewTabMode,
	tabDeleteStrategy,
	tabInlineTreeMode,
	tabCurrentPath,
	tabThumbnailWidthPercent
} from '../stores/folderTabStore.svelte';
import type { FolderViewStyle, FolderSortField } from '../stores/folderPanelStore.svelte';

// 别名映射，保持与原有代码的兼容性
const currentPathStore = tabCurrentPath;
const canGoBack = tabCanGoBack;
const canGoForward = tabCanGoForward;
const canGoUp = tabCanGoUp;
const viewStyle = tabViewStyle;
const multiSelectMode = tabMultiSelectMode;
const deleteMode = tabDeleteMode;
const sortConfig = tabSortConfig;
const itemCount = tabItemCount;
const showSearchBar = tabShowSearchBar;
const showMigrationBar = tabShowMigrationBar;
const penetrateMode = tabPenetrateMode;
const openInNewTabMode = tabOpenInNewTabMode;
const deleteStrategy = tabDeleteStrategy;
const inlineTreeMode = tabInlineTreeMode;
const thumbnailWidthPercent = tabThumbnailWidthPercent;

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
}

let { onRefresh, onToggleFolderTree, onGoBack, onGoForward, onGoUp, onGoHome, onSetHome, onToggleDeleteStrategy, onToggleInlineTree, showRandomTagBar = false, onToggleRandomTagBar, virtualMode = null }: Props = $props();

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
	const current = fields.find((f) => f.value === $sortConfig.field);
	return current?.icon ?? ALargeSmall;
}

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

function handleSetViewStyle(style: FolderViewStyle) {
	folderTabActions.setViewStyle(style);
}

function handleSetSort(field: FolderSortField) {
	folderTabActions.setSort(field);
}

function handleToggleSortOrder() {
	const newOrder = $sortConfig.order === 'asc' ? 'desc' : 'asc';
	folderTabActions.setSort($sortConfig.field, newOrder);
}

function handleToggleDeleteStrategy(e: MouseEvent) {
	e.preventDefault();
	onToggleDeleteStrategy?.();
}

function handleClearTreeCache() {
	const stats = directoryTreeCache.getStats();
	console.log(`[FolderToolbar] 清除内存树缓存，当前缓存条目: ${stats.size}, 加载中: ${stats.loading}`);
	directoryTreeCache.clear();
	console.log('[FolderToolbar] 内存树缓存已清除');
	// 刷新当前目录
	onRefresh?.();
}

function getCurrentViewIcon() {
	const current = viewStyles.find((v) => v.value === $viewStyle);
	return current?.icon ?? List;
}

// 预热状态
let isWarming = $state(false);
let warmupProgress = $state<WarmupProgress | null>(null);

// 更多设置栏展开状态
let showMoreSettings = $state(false);
let settingsTab = $state<'action' | 'display' | 'other'>('action');

function toggleMoreSettings() {
	showMoreSettings = !showMoreSettings;
}

async function startWarmup() {
	const path = $currentPathStore;
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
</script>

<div class="flex flex-wrap items-center gap-1 px-2 py-1.5">
	<!-- 导航按钮组 -->
	<div class="flex items-center gap-0.5">
		<Tooltip.Root>
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

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					disabled={!$canGoBack && !$canGoUp}
					onclick={handleGoBack}
				>
					<ChevronLeft class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>后退 (Alt+←)</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					disabled={!$canGoForward}
					onclick={handleGoForward}
				>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>前进 (Alt+→)</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					disabled={!$canGoUp}
					onclick={handleGoUp}
				>
					<ChevronUp class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>向上 (Alt+↑)</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button variant="ghost" size="icon" class="h-7 w-7" onclick={onRefresh}>
					<RefreshCw class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>刷新</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</div>

	<!-- 分隔 -->
	<div class="bg-border mx-1 h-5 w-px"></div>

	<!-- 排序下拉（使用排序字段图标 + 升降序箭头） -->
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button variant="ghost" size="sm" class="h-7 gap-0.5 px-1.5">
						{@const SortIcon = getCurrentSortIcon()}
						<SortIcon class="h-3.5 w-3.5" />
						{#if $sortConfig.field !== 'random'}
							{#if $sortConfig.order === 'asc'}
								<ArrowUp class="h-3 w-3" />
							{:else}
								<ArrowDown class="h-3 w-3" />
							{/if}
						{/if}
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>排序: {sortFields.find((f) => f.value === $sortConfig.field)?.label} {$sortConfig.field !== 'random' ? ($sortConfig.order === 'asc' ? '升序' : '降序') : ''}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start">
			{#each sortFields as field}
				<DropdownMenu.Item onclick={() => handleSetSort(field.value)}>
					<span class="flex-1">{field.label}</span>
					{#if $sortConfig.field === field.value}
						<span class="text-primary">✓</span>
					{/if}
				</DropdownMenu.Item>
			{/each}
			<DropdownMenu.Separator />
			<DropdownMenu.Item onclick={handleToggleSortOrder}>
				{#if $sortConfig.order === 'asc'}
					<ArrowUp class="mr-2 h-4 w-4" />
					<span>升序</span>
				{:else}
					<ArrowDown class="mr-2 h-4 w-4" />
					<span>降序</span>
				{/if}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- 弹性空间 -->
	<div class="flex-1"></div>

	<!-- 功能按钮组 -->
	<div class="flex items-center gap-0.5">
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$multiSelectMode ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={() => folderTabActions.toggleMultiSelectMode()}
				>
					<CheckSquare class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>多选模式</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$deleteMode ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={() => folderTabActions.toggleDeleteMode()}
					oncontextmenu={handleToggleDeleteStrategy}
				>
					<Trash2 class={$deleteStrategy === 'permanent' ? 'h-4 w-4 text-accent-foreground' : 'h-4 w-4'} />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>删除模式 ({$deleteStrategy === 'trash' ? '回收站' : '永久'})</p>
				<p class="text-muted-foreground text-xs">右键切换策略</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button 
					variant={$inlineTreeMode ? 'default' : 'ghost'} 
					size="icon" 
					class="h-7 w-7" 
					onclick={onToggleFolderTree}
					oncontextmenu={(e: MouseEvent) => { e.preventDefault(); onToggleInlineTree?.(); }}
				>
					{#if $inlineTreeMode}
						<ListTree class="h-4 w-4" />
					{:else}
						<FolderTree class="h-4 w-4" />
					{/if}
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>文件夹树 {$inlineTreeMode ? '(主视图树模式)' : ''}</p>
				<p class="text-muted-foreground text-xs">右键切换主视图树</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$showSearchBar ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={() => folderTabActions.toggleShowSearchBar()}
				>
					<Search class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{$showSearchBar ? '隐藏搜索栏' : '显示搜索栏'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$showMigrationBar ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={() => folderTabActions.toggleShowMigrationBar()}
				>
					<ClipboardPaste class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{$showMigrationBar ? '隐藏迁移栏' : '显示迁移栏'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
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

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$penetrateMode ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={() => folderTabActions.togglePenetrateMode()}
					oncontextmenu={(e: MouseEvent) => {
						e.preventDefault();
						// 只有穿透模式开启时，右键才能切换新标签打开功能
						if ($penetrateMode) {
							folderTabActions.toggleOpenInNewTabMode();
						}
					}}
				>
					<CornerDownRight class={$openInNewTabMode ? 'h-4 w-4 text-accent-foreground' : 'h-4 w-4'} />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{$penetrateMode ? '穿透模式：当文件夹只有一个子文件时直接打开' : '穿透模式'}</p>
				{#if $penetrateMode}
					<p class="text-muted-foreground text-xs">右键切换穿透失败时新标签打开 {$openInNewTabMode ? '(已开启)' : ''}</p>
				{/if}
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 视图样式下拉 -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				<Button variant="ghost" size="icon" class="h-7 w-7">
					{@const ViewIcon = getCurrentViewIcon()}
					<ViewIcon class="h-4 w-4" />
				</Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				{#each viewStyles as style}
					<DropdownMenu.Item onclick={() => handleSetViewStyle(style.value)}>
						{@const StyleIcon = style.icon}
						<StyleIcon class="mr-2 h-4 w-4" />
						<span>{style.label}</span>
						{#if $viewStyle === style.value}
							<span class="text-primary ml-auto">✓</span>
						{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<!-- 更多设置按钮（展开/折叠设置栏） -->
		<Tooltip.Root>
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

<!-- 可展开的更多设置栏（Tab 形式） -->
{#if showMoreSettings}
	<div class="border-t bg-muted/20">
		<!-- Tab 标签 -->
		<div class="flex border-b px-2">
			<button
				class="px-3 py-1 text-xs border-b-2 transition-colors {settingsTab === 'action' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
				onclick={() => settingsTab = 'action'}
			>
				快捷操作
			</button>
			<button
				class="px-3 py-1 text-xs border-b-2 transition-colors {settingsTab === 'display' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
				onclick={() => settingsTab = 'display'}
			>
				显示设置
			</button>
			<button
				class="px-3 py-1 text-xs border-b-2 transition-colors {settingsTab === 'other' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
				onclick={() => settingsTab = 'other'}
			>
				其他
			</button>
			<div class="flex-1"></div>
			<span class="text-[10px] text-muted-foreground self-center">文件数: {$itemCount}</span>
		</div>

		<!-- Tab 内容 -->
		<div class="px-2 py-2">
			{#if settingsTab === 'action'}
				<!-- 快捷操作 -->
				<div class="flex flex-wrap items-center gap-2 text-xs">
					<button 
						class="px-2 py-1 rounded border hover:bg-accent transition-colors {isWarming ? 'text-orange-500 border-orange-500' : ''}"
						onclick={isWarming ? cancelWarmup : startWarmup}
					>
						<Flame class="inline h-3 w-3 mr-1" />
						{isWarming ? '取消预热' : '预热目录'}
					</button>
					<button 
						class="px-2 py-1 rounded border hover:bg-accent transition-colors"
						onclick={() => folderTabActions.toggleRecursiveMode()}
					>
						递归显示
					</button>
					<button 
						class="px-2 py-1 rounded border hover:bg-accent transition-colors"
						onclick={handleClearTreeCache}
					>
						<RefreshCw class="inline h-3 w-3 mr-1" />
						刷新树
					</button>
					<button 
						class="px-2 py-1 rounded border hover:bg-accent transition-colors"
						onclick={() => folderTabActions.clearHistory()}
					>
						清除历史
					</button>
					{#if $currentPathStore && !isPathExcluded($currentPathStore)}
						<button 
							class="px-2 py-1 rounded border hover:bg-accent transition-colors"
							onclick={() => $currentPathStore && addExcludedPath($currentPathStore)}
						>
							<Trash2 class="inline h-3 w-3 mr-1" />
							排除目录
						</button>
					{:else if $currentPathStore}
						<button 
							class="px-2 py-1 rounded border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
							onclick={() => $currentPathStore && removeExcludedPath($currentPathStore)}
						>
							取消排除
						</button>
					{/if}
				</div>
			{:else if settingsTab === 'display'}
				<!-- 显示设置 -->
				<div class="flex flex-wrap items-center gap-4 text-xs">
					<!-- 悬停预览 -->
					<div class="flex items-center gap-2">
						<Eye class="h-3.5 w-3.5 text-muted-foreground" />
						<span class="text-muted-foreground">预览:</span>
						<button 
							class="px-2 py-0.5 rounded border transition-colors {$hoverPreviewEnabled ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}"
							onclick={() => hoverPreviewSettings.toggle()}
						>
							{$hoverPreviewEnabled ? '开' : '关'}
						</button>
						{#if $hoverPreviewEnabled}
							<select 
								class="h-6 bg-transparent border rounded text-xs px-1"
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
							class="h-6 bg-transparent border rounded text-xs px-1"
							value={$fileBrowserStore.penetrateShowInnerFile}
							onchange={(e) => fileBrowserStore.setPenetrateShowInnerFile((e.target as HTMLSelectElement).value as 'none' | 'single' | 'all')}
						>
							<option value="none">不显示</option>
							<option value="single">仅单文件</option>
							<option value="all">全显示</option>
						</select>
					</div>

					<!-- 缩略图大小 -->
					<div class="flex items-center gap-2">
						<Grid3x3 class="h-3.5 w-3.5 text-muted-foreground" />
						<span class="text-muted-foreground">缩略图:</span>
						<input
							type="range"
							min="10"
							max="90"
							value={$thumbnailWidthPercent}
							oninput={(e) => folderTabActions.setThumbnailWidthPercent(parseInt((e.target as HTMLInputElement).value))}
							class="w-20 h-4"
						/>
						<span class="text-muted-foreground w-10">{Math.round(48 + ($thumbnailWidthPercent - 10) * 3)}px</span>
					</div>
				</div>
			{:else}
				<!-- 其他设置 -->
				<div class="flex flex-wrap items-center gap-4 text-xs">
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
							class="w-14 h-6 bg-transparent border rounded text-xs px-2 text-center"
						/>
						<div class="flex gap-1">
							{#each [3.5, 4.0, 4.5, 5.0] as rating}
								<button
									class="px-1.5 py-0.5 text-[10px] rounded hover:bg-accent {getDefaultRating() === rating ? 'bg-primary text-primary-foreground' : 'border'}"
									onclick={() => saveDefaultRating(rating)}
								>
									{rating}
								</button>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
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
