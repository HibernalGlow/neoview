<script lang="ts">
/**
 * PanelToolbar - 共用面板工具栏
 * 用于历史记录、书签等面板的工具栏
 */
import {
	Grid3x3,
	List,
	Search,
	X,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	Calendar,
	Type,
	Star,
	Shuffle,
	FolderOpen
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

// 排序字段类型
export type SortField = 'name' | 'timestamp' | 'path' | 'starred' | 'type' | 'random';
export type SortOrder = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid';

interface Props {
	/** 视图模式 */
	viewMode?: ViewMode;
	/** 是否显示搜索栏 */
	showSearchBar?: boolean;
	/** 当前排序字段 */
	sortField?: SortField;
	/** 排序顺序 */
	sortOrder?: SortOrder;
	/** 是否显示视图切换 */
	showViewToggle?: boolean;
	/** 是否显示搜索按钮 */
	showSearchToggle?: boolean;
	/** 是否显示排序 */
	showSort?: boolean;
	/** 视图切换回调 */
	onViewModeChange?: (mode: ViewMode) => void;
	/** 搜索栏切换回调 */
	onSearchToggle?: () => void;
	/** 排序字段变更回调 */
	onSortChange?: (field: SortField, order: SortOrder) => void;
}

let {
	viewMode = 'list',
	showSearchBar = false,
	sortField = 'timestamp',
	sortOrder = 'desc',
	showViewToggle = true,
	showSearchToggle = true,
	showSort = true,
	onViewModeChange,
	onSearchToggle,
	onSortChange
}: Props = $props();

// 排序选项配置
const sortOptions: { field: SortField; label: string; icon: typeof Calendar }[] = [
	{ field: 'timestamp', label: '添加时间', icon: Calendar },
	{ field: 'name', label: '名称', icon: Type },
	{ field: 'path', label: '路径', icon: FolderOpen },
	{ field: 'type', label: '类型', icon: Type },
	{ field: 'starred', label: '星标', icon: Star },
	{ field: 'random', label: '随机', icon: Shuffle }
];

function toggleViewMode() {
	const next = viewMode === 'list' ? 'grid' : 'list';
	onViewModeChange?.(next);
}

function handleSortChange(field: SortField) {
	if (field === sortField) {
		// 切换排序顺序
		const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		onSortChange?.(field, newOrder);
	} else {
		onSortChange?.(field, 'asc');
	}
}

function getSortIcon() {
	return sortOrder === 'asc' ? ArrowUp : ArrowDown;
}
</script>

<div class="flex items-center gap-1">
	<!-- 视图切换 -->
	{#if showViewToggle}
		<Button variant="ghost" size="icon" class="h-7 w-7" onclick={toggleViewMode} title="切换视图">
			{#if viewMode === 'list'}
				<Grid3x3 class="h-4 w-4" />
			{:else}
				<List class="h-4 w-4" />
			{/if}
		</Button>
	{/if}

	<!-- 搜索按钮 -->
	{#if showSearchToggle}
		<Button
			variant={showSearchBar ? 'secondary' : 'ghost'}
			size="icon"
			class="h-7 w-7"
			onclick={onSearchToggle}
			title={showSearchBar ? '隐藏搜索栏' : '显示搜索栏'}
		>
			{#if showSearchBar}
				<X class="h-4 w-4" />
			{:else}
				<Search class="h-4 w-4" />
			{/if}
		</Button>
	{/if}

	<!-- 排序下拉菜单 -->
	{#if showSort}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				<Button variant="ghost" size="icon" class="h-7 w-7" title="排序">
					<ArrowUpDown class="h-4 w-4" />
				</Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-40" align="end">
				{#each sortOptions as option}
					{@const Icon = option.icon}
					{@const SortIcon = sortField === option.field ? getSortIcon() : ArrowUpDown}
					<DropdownMenu.Item onclick={() => handleSortChange(option.field)}>
						<Icon class="h-4 w-4 mr-2" />
						<span class="flex-1">{option.label}</span>
						{#if sortField === option.field}
							<SortIcon class="h-3 w-3 text-primary" />
						{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
</div>
