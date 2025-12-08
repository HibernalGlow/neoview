<script lang="ts">
/**
 * 通用面板工具栏
 * 模块化设计，根据 PanelConfig 显示不同功能
 */
import { 
    RefreshCw, Home, ChevronLeft, ChevronRight,
    List, LayoutGrid, Image, Grid3x3,
    ArrowUp, ArrowDown, ALargeSmall, Calendar, HardDrive, FileType, Shuffle, Star, Heart,
    CheckSquare, Trash2, Search, FolderSync
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import type { PanelStore } from '../core/createPanelStore.svelte';
import type { PanelConfig, ViewStyle, SortField } from '../core/types';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';

interface Props {
    store: PanelStore;
    config: PanelConfig;
    onRefresh?: () => void;
    onGoHome?: () => void;
    onGoBack?: () => void;
    onGoForward?: () => void;
}

let { store, config, onRefresh, onGoHome, onGoBack, onGoForward }: Props = $props();

// 视图样式选项
const viewStyles: { value: ViewStyle; icon: typeof List; label: string }[] = [
    { value: 'list', icon: List, label: '列表' },
    { value: 'content', icon: LayoutGrid, label: '内容' },
    { value: 'banner', icon: Image, label: '横幅' },
    { value: 'thumbnail', icon: Grid3x3, label: '缩略图' }
];

// 排序字段选项（根据 config 定制 date 的标签）
let sortFields = $derived([
    { value: 'name' as SortField, label: '名称', icon: ALargeSmall },
    { value: 'date' as SortField, label: config.dateSortLabel, icon: Calendar },
    { value: 'size' as SortField, label: '大小', icon: HardDrive },
    { value: 'type' as SortField, label: '类型', icon: FileType },
    { value: 'random' as SortField, label: '随机', icon: Shuffle },
    { value: 'rating' as SortField, label: '评分', icon: Star },
    { value: 'collectTagCount' as SortField, label: '收藏标签', icon: Heart }
]);

function getCurrentSortIcon() {
    const current = sortFields.find(f => f.value === store.sortConfig.field);
    return current?.icon ?? ALargeSmall;
}

function getCurrentViewIcon() {
    const current = viewStyles.find(v => v.value === store.viewStyle);
    return current?.icon ?? List;
}
</script>

<div class="flex flex-wrap items-center gap-1 px-2 py-1.5">
    <!-- 导航按钮组 (仅 folder 模式显示) -->
    {#if config.enableNavigation}
        <div class="flex items-center gap-0.5">
            <Tooltip.Root>
                <Tooltip.Trigger>
                    <Button variant="ghost" size="icon" class="h-7 w-7" onclick={onGoHome}>
                        <Home class="h-4 w-4" />
                    </Button>
                </Tooltip.Trigger>
                <Tooltip.Content><p>主页</p></Tooltip.Content>
            </Tooltip.Root>

            <Tooltip.Root>
                <Tooltip.Trigger>
                    <Button
                        variant="ghost"
                        size="icon"
                        class="h-7 w-7"
                        disabled={!store.canGoBack}
                        onclick={() => store.goBack()}
                    >
                        <ChevronLeft class="h-4 w-4" />
                    </Button>
                </Tooltip.Trigger>
                <Tooltip.Content><p>后退</p></Tooltip.Content>
            </Tooltip.Root>

            <Tooltip.Root>
                <Tooltip.Trigger>
                    <Button
                        variant="ghost"
                        size="icon"
                        class="h-7 w-7"
                        disabled={!store.canGoForward}
                        onclick={() => store.goForward()}
                    >
                        <ChevronRight class="h-4 w-4" />
                    </Button>
                </Tooltip.Trigger>
                <Tooltip.Content><p>前进</p></Tooltip.Content>
            </Tooltip.Root>
        </div>
        <div class="bg-border mx-1 h-5 w-px"></div>
    {/if}

    <!-- 刷新按钮 -->
    <Tooltip.Root>
        <Tooltip.Trigger>
            <Button variant="ghost" size="icon" class="h-7 w-7" onclick={onRefresh}>
                <RefreshCw class="h-4 w-4" />
            </Button>
        </Tooltip.Trigger>
        <Tooltip.Content><p>刷新</p></Tooltip.Content>
    </Tooltip.Root>

    <!-- 排序下拉 -->
    <DropdownMenu.Root>
        <DropdownMenu.Trigger>
            <Button variant="ghost" size="sm" class="h-7 gap-0.5 px-1.5">
                {@const SortIcon = getCurrentSortIcon()}
                <SortIcon class="h-3.5 w-3.5" />
                {#if store.sortConfig.field !== 'random'}
                    {#if store.sortConfig.order === 'asc'}
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
                    <span class="flex-1">{field.label}</span>
                    {#if store.sortConfig.field === field.value}
                        <span class="text-primary">✓</span>
                    {/if}
                </DropdownMenu.Item>
            {/each}
        </DropdownMenu.Content>
    </DropdownMenu.Root>

    <div class="flex-1"></div>

    <!-- 功能按钮组 -->
    <div class="flex items-center gap-0.5">
        <!-- 多选模式 -->
        <Tooltip.Root>
            <Tooltip.Trigger>
                <Button
                    variant={store.multiSelectMode ? 'default' : 'ghost'}
                    size="icon"
                    class="h-7 w-7"
                    onclick={() => store.toggleMultiSelectMode()}
                >
                    <CheckSquare class="h-4 w-4" />
                </Button>
            </Tooltip.Trigger>
            <Tooltip.Content><p>多选模式</p></Tooltip.Content>
        </Tooltip.Root>

        <!-- 删除模式 -->
        {#if config.enableBatchDelete}
            <Tooltip.Root>
                <Tooltip.Trigger>
                    <Button
                        variant={store.deleteMode ? 'default' : 'ghost'}
                        size="icon"
                        class="h-7 w-7"
                        onclick={() => store.toggleDeleteMode()}
                    >
                        <Trash2 class="h-4 w-4" />
                    </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                    <p>{config.deleteLabel}模式</p>
                </Tooltip.Content>
            </Tooltip.Root>
        {/if}

        <!-- 搜索栏 -->
        {#if config.enableSearch}
            <Tooltip.Root>
                <Tooltip.Trigger>
                    <Button
                        variant={store.showSearchBar ? 'default' : 'ghost'}
                        size="icon"
                        class="h-7 w-7"
                        onclick={() => store.toggleShowSearchBar()}
                    >
                        <Search class="h-4 w-4" />
                    </Button>
                </Tooltip.Trigger>
                <Tooltip.Content><p>搜索栏</p></Tooltip.Content>
            </Tooltip.Root>
        {/if}

        <!-- 同步文件夹开关 (仅历史/书签模式) -->
        {#if config.mode === 'history' || config.mode === 'bookmark'}
            <Tooltip.Root>
                <Tooltip.Trigger>
                    <Button
                        variant={config.mode === 'history' 
                            ? (historySettingsStore.syncFileTreeOnHistorySelect ? 'default' : 'ghost')
                            : (historySettingsStore.syncFileTreeOnBookmarkSelect ? 'default' : 'ghost')}
                        size="icon"
                        class="h-7 w-7"
                        onclick={() => {
                            if (config.mode === 'history') {
                                historySettingsStore.setSyncFileTreeOnHistorySelect(!historySettingsStore.syncFileTreeOnHistorySelect);
                            } else {
                                historySettingsStore.setSyncFileTreeOnBookmarkSelect(!historySettingsStore.syncFileTreeOnBookmarkSelect);
                            }
                        }}
                    >
                        <FolderSync class="h-4 w-4" />
                    </Button>
                </Tooltip.Trigger>
                <Tooltip.Content><p>同步文件夹</p></Tooltip.Content>
            </Tooltip.Root>
        {/if}

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
    </div>
</div>
