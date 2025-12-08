<script lang="ts">
/**
 * Toolbar - 工具栏组件（完整版）
 * 接收 store，直接读写 store 状态
 */
import { 
    RefreshCw, List, LayoutGrid, Image, Grid3x3,
    ArrowUp, ArrowDown, ALargeSmall, Calendar, HardDrive, FileType, Shuffle, Star, Heart,
    CheckSquare, Trash2, Search, FolderSync, Settings2, SlidersHorizontal
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import { Slider } from '$lib/components/ui/slider';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import type { historyViewStore } from '$lib/stores/historyViewStore.svelte';
import type { bookmarkViewStore } from '$lib/stores/bookmarkViewStore.svelte';

type Store = typeof historyViewStore | typeof bookmarkViewStore;

interface Props {
    store: Store;
    onRefresh?: () => void;
}

let { store, onRefresh }: Props = $props();

// 设置面板状态
let showSettings = $state(false);

// 视图样式选项
const viewStyles = [
    { value: 'list' as const, icon: List, label: '列表' },
    { value: 'content' as const, icon: LayoutGrid, label: '内容' },
    { value: 'banner' as const, icon: Image, label: '横幅' },
    { value: 'thumbnail' as const, icon: Grid3x3, label: '缩略图' }
];

// 排序字段选项
let sortFields = $derived([
    { value: 'name' as const, label: '名称', icon: ALargeSmall },
    { value: 'date' as const, label: store.config.labels.dateSortLabel, icon: Calendar },
    { value: 'size' as const, label: '大小', icon: HardDrive },
    { value: 'type' as const, label: '类型', icon: FileType },
    { value: 'random' as const, label: '随机', icon: Shuffle },
    { value: 'rating' as const, label: '评分', icon: Star },
]);

function getCurrentSortIcon() {
    const current = sortFields.find(f => f.value === store.sortField);
    return current?.icon ?? ALargeSmall;
}

function getCurrentViewIcon() {
    const current = viewStyles.find(v => v.value === store.viewStyle);
    return current?.icon ?? List;
}

// 同步设置
let syncEnabled = $derived(
    store.config.mode === 'history' 
        ? historySettingsStore.syncFileTreeOnHistorySelect
        : historySettingsStore.syncFileTreeOnBookmarkSelect
);

function toggleSync() {
    if (store.config.mode === 'history') {
        historySettingsStore.setSyncFileTreeOnHistorySelect(!historySettingsStore.syncFileTreeOnHistorySelect);
    } else {
        historySettingsStore.setSyncFileTreeOnBookmarkSelect(!historySettingsStore.syncFileTreeOnBookmarkSelect);
    }
}
</script>

<div class="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b">
    <!-- 刷新 -->
    <Tooltip.Root>
        <Tooltip.Trigger>
            <Button variant="ghost" size="icon" class="h-7 w-7" onclick={onRefresh}>
                <RefreshCw class="h-4 w-4" />
            </Button>
        </Tooltip.Trigger>
        <Tooltip.Content><p>刷新</p></Tooltip.Content>
    </Tooltip.Root>

    <!-- 排序 -->
    <DropdownMenu.Root>
        <DropdownMenu.Trigger>
            <Button variant="ghost" size="sm" class="h-7 gap-0.5 px-1.5">
                {@const SortIcon = getCurrentSortIcon()}
                <SortIcon class="h-3.5 w-3.5" />
                {#if store.sortField !== 'random'}
                    {#if store.sortOrder === 'asc'}
                        <ArrowUp class="h-3 w-3" />
                    {:else}
                        <ArrowDown class="h-3 w-3" />
                    {/if}
                {/if}
            </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start">
            {#each sortFields as field}
                <DropdownMenu.Item onclick={() => store.setSort(field.value)}>
                    {@const Icon = field.icon}
                    <Icon class="mr-2 h-4 w-4" />
                    <span class="flex-1">{field.label}</span>
                    {#if store.sortField === field.value}
                        <span class="text-primary">✓</span>
                    {/if}
                </DropdownMenu.Item>
            {/each}
        </DropdownMenu.Content>
    </DropdownMenu.Root>

    <div class="flex-1"></div>

    <!-- 功能按钮 -->
    <div class="flex items-center gap-0.5">
        <!-- 多选 -->
        <Tooltip.Root>
            <Tooltip.Trigger>
                <Button
                    variant={store.multiSelectMode ? 'default' : 'ghost'}
                    size="icon"
                    class="h-7 w-7"
                    onclick={() => store.toggleMultiSelect()}
                >
                    <CheckSquare class="h-4 w-4" />
                </Button>
            </Tooltip.Trigger>
            <Tooltip.Content><p>多选模式</p></Tooltip.Content>
        </Tooltip.Root>

        <!-- 删除 -->
        <Tooltip.Root>
            <Tooltip.Trigger>
                <Button
                    variant={store.deleteMode ? 'default' : 'ghost'}
                    size="icon"
                    class="h-7 w-7"
                    onclick={() => store.toggleDelete()}
                >
                    <Trash2 class="h-4 w-4" />
                </Button>
            </Tooltip.Trigger>
            <Tooltip.Content><p>{store.config.labels.deleteLabel}模式</p></Tooltip.Content>
        </Tooltip.Root>

        <!-- 搜索 -->
        <Tooltip.Root>
            <Tooltip.Trigger>
                <Button
                    variant={store.showSearchBar ? 'default' : 'ghost'}
                    size="icon"
                    class="h-7 w-7"
                    onclick={() => store.toggleSearch()}
                >
                    <Search class="h-4 w-4" />
                </Button>
            </Tooltip.Trigger>
            <Tooltip.Content><p>搜索</p></Tooltip.Content>
        </Tooltip.Root>

        <!-- 同步文件夹 -->
        {#if store.config.features.syncToFolder}
            <Tooltip.Root>
                <Tooltip.Trigger>
                    <Button
                        variant={syncEnabled ? 'default' : 'ghost'}
                        size="icon"
                        class="h-7 w-7"
                        onclick={toggleSync}
                    >
                        <FolderSync class="h-4 w-4" />
                    </Button>
                </Tooltip.Trigger>
                <Tooltip.Content><p>同步文件夹</p></Tooltip.Content>
            </Tooltip.Root>
        {/if}

        <!-- 视图样式 -->
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                <Button variant="ghost" size="icon" class="h-7 w-7">
                    {@const ViewIcon = getCurrentViewIcon()}
                    <ViewIcon class="h-4 w-4" />
                </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
                {#each viewStyles as style}
                    <DropdownMenu.Item onclick={() => store.setViewStyle(style.value)}>
                        {@const StyleIcon = style.icon}
                        <StyleIcon class="mr-2 h-4 w-4" />
                        <span>{style.label}</span>
                        {#if store.viewStyle === style.value}
                            <span class="text-primary ml-auto">✓</span>
                        {/if}
                    </DropdownMenu.Item>
                {/each}
            </DropdownMenu.Content>
        </DropdownMenu.Root>

        <!-- 设置下拉 -->
        <DropdownMenu.Root>
            <DropdownMenu.Trigger>
                <Button variant="ghost" size="icon" class="h-7 w-7">
                    <Settings2 class="h-4 w-4" />
                </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content class="w-64" align="end">
                <div class="p-2 space-y-3">
                    <div class="text-xs font-medium text-muted-foreground">显示设置</div>
                    
                    <!-- 缩略图宽度 -->
                    <div class="space-y-1">
                        <div class="flex items-center justify-between text-xs">
                            <span>缩略图宽度</span>
                            <span class="font-medium">{store.thumbnailWidth}%</span>
                        </div>
                        <Slider
                            value={[store.thumbnailWidth]}
                            min={10}
                            max={90}
                            step={5}
                            onValueChange={(v) => store.setThumbnailWidth(v[0])}
                        />
                    </div>
                    
                    <!-- 项目数量 -->
                    <div class="flex items-center justify-between text-xs pt-1 border-t">
                        <span class="text-muted-foreground">项目数量</span>
                        <span class="font-medium">{store.itemCount}</span>
                    </div>
                </div>
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    </div>
</div>
