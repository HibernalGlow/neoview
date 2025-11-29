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
	// 排序图标
	ALargeSmall,
	Calendar,
	HardDrive,
	FileType,
	Shuffle,
	Star
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import {
	folderPanelActions,
	canGoBack,
	canGoForward,
	canGoUp,
	viewStyle,
	multiSelectMode,
	deleteMode,
	sortConfig,
	itemCount,
	showSearchBar,
	showMigrationBar,
	penetrateMode,
	deleteStrategy,
	inlineTreeMode,
	type FolderViewStyle,
	type FolderSortField
} from '../stores/folderPanelStore.svelte';

interface Props {
	onRefresh?: () => void;
	onToggleFolderTree?: () => void;
	onGoBack?: () => void;
	onGoForward?: () => void;
	onGoHome?: () => void;
	onSetHome?: () => void;
	onToggleDeleteStrategy?: () => void;
	onToggleInlineTree?: () => void;
}

let { onRefresh, onToggleFolderTree, onGoBack, onGoForward, onGoHome, onSetHome, onToggleDeleteStrategy, onToggleInlineTree }: Props = $props();

const viewStyles: { value: FolderViewStyle; icon: typeof List; label: string }[] = [
	{ value: 'list', icon: List, label: '列表' },
	{ value: 'content', icon: LayoutGrid, label: '内容' },
	{ value: 'banner', icon: Image, label: '横幅' },
	{ value: 'thumbnail', icon: Grid3x3, label: '缩略图' }
];

const sortFields: { value: FolderSortField; label: string; icon: typeof ALargeSmall }[] = [
	{ value: 'name', label: '名称', icon: ALargeSmall },
	{ value: 'date', label: '日期', icon: Calendar },
	{ value: 'size', label: '大小', icon: HardDrive },
	{ value: 'type', label: '类型', icon: FileType },
	{ value: 'random', label: '随机', icon: Shuffle },
	{ value: 'rating', label: '评分', icon: Star }
];

function getCurrentSortIcon() {
	const current = sortFields.find((f) => f.value === $sortConfig.field);
	return current?.icon ?? ALargeSmall;
}

function handleGoBack() {
	onGoBack?.();
}

function handleGoForward() {
	onGoForward?.();
}

function handleGoUp() {
	// 在层叠模式下，返回上级等同于后退
	onGoBack?.();
}

function handleGoHome() {
	onGoHome?.();
}

function handleSetHome(e: MouseEvent) {
	e.preventDefault();
	onSetHome?.();
}

function handleSetViewStyle(style: FolderViewStyle) {
	folderPanelActions.setViewStyle(style);
}

function handleSetSort(field: FolderSortField) {
	folderPanelActions.setSort(field);
}

function handleToggleSortOrder() {
	const newOrder = $sortConfig.order === 'asc' ? 'desc' : 'asc';
	folderPanelActions.setSort($sortConfig.field, newOrder);
}

function handleToggleDeleteStrategy(e: MouseEvent) {
	e.preventDefault();
	onToggleDeleteStrategy?.();
}

function getCurrentViewIcon() {
	const current = viewStyles.find((v) => v.value === $viewStyle);
	return current?.icon ?? List;
}
</script>

<div class="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
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
					disabled={!$canGoBack}
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
					onclick={() => folderPanelActions.toggleMultiSelectMode()}
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
					onclick={() => folderPanelActions.toggleDeleteMode()}
					oncontextmenu={handleToggleDeleteStrategy}
				>
					<Trash2 class={$deleteStrategy === 'permanent' ? 'h-4 w-4 text-destructive' : 'h-4 w-4'} />
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
					onclick={() => folderPanelActions.toggleShowSearchBar()}
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
					onclick={() => folderPanelActions.toggleShowMigrationBar()}
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
					variant={$penetrateMode ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={() => folderPanelActions.togglePenetrateMode()}
				>
					<CornerDownRight class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{$penetrateMode ? '穿透模式：当文件夹只有一个子文件时直接打开' : '穿透模式'}</p>
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

		<!-- 更多菜单 -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				<Button variant="ghost" size="icon" class="h-7 w-7">
					<MoreVertical class="h-4 w-4" />
				</Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item disabled class="text-muted-foreground">
					文件数量: {$itemCount}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => folderPanelActions.toggleRecursiveMode()}>
					递归显示子文件夹
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => folderPanelActions.clearHistory()}>
					清除历史记录
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
