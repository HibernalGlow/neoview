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
	Search,
	CornerDownRight,
	ClipboardPaste
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
}

let { onRefresh, onToggleFolderTree, onGoBack, onGoForward, onGoHome, onSetHome, onToggleDeleteStrategy }: Props = $props();

const viewStyles: { value: FolderViewStyle; icon: typeof List; label: string }[] = [
	{ value: 'list', icon: List, label: '列表' },
	{ value: 'content', icon: LayoutGrid, label: '内容' },
	{ value: 'banner', icon: Image, label: '横幅' },
	{ value: 'thumbnail', icon: Grid3x3, label: '缩略图' }
];

const sortFields: { value: FolderSortField; label: string }[] = [
	{ value: 'name', label: '名称' },
	{ value: 'date', label: '日期' },
	{ value: 'size', label: '大小' },
	{ value: 'type', label: '类型' }
];

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

	<!-- 排序下拉 -->
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			<Button variant="ghost" size="sm" class="h-7 gap-1 px-2">
				<ArrowUpDown class="h-3.5 w-3.5" />
				<span class="text-xs">{sortFields.find((f) => f.value === $sortConfig.field)?.label}</span>
				<span class="text-muted-foreground text-xs">
					{$sortConfig.order === 'asc' ? '↑' : '↓'}
				</span>
			</Button>
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start">
			{#each sortFields as field}
				<DropdownMenu.Item onclick={() => handleSetSort(field.value)}>
					<span class="flex-1">{field.label}</span>
					{#if $sortConfig.field === field.value}
						<span class="text-muted-foreground text-xs">
							{$sortConfig.order === 'asc' ? '↑' : '↓'}
						</span>
					{/if}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- 弹性空间 -->
	<div class="flex-1"></div>

	<!-- 文件数量 -->
	<span class="text-muted-foreground mr-2 text-xs">{$itemCount}</span>

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
				>
					<Trash2 class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>删除模式</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					onclick={handleToggleDeleteStrategy}
					oncontextmenu={handleToggleDeleteStrategy}
				>
					<Trash2 class={$deleteStrategy === 'permanent' ? 'h-4 w-4 text-destructive' : 'h-4 w-4'} />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>删除策略: {$deleteStrategy === 'trash' ? '移动到回收站' : '永久删除'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button variant="ghost" size="icon" class="h-7 w-7" onclick={onToggleFolderTree}>
					<FolderTree class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>文件夹树</p>
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
