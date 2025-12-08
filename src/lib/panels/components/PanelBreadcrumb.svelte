<script lang="ts">
/**
 * 面板面包屑导航
 * 简洁版本，支持虚拟路径显示
 */
import { Home, History, Bookmark, ChevronRight } from '@lucide/svelte';
import type { PanelMode } from '../core/types';

interface Props {
    mode: PanelMode;
    title?: string;
}

let { mode, title }: Props = $props();

// 根据模式获取图标和标题
const modeConfig = {
    folder: { icon: Home, label: '文件夹', color: 'text-blue-500' },
    history: { icon: History, label: '历史记录', color: 'text-orange-500' },
    bookmark: { icon: Bookmark, label: '书签', color: 'text-yellow-500' }
};

let config = $derived(modeConfig[mode]);
let displayTitle = $derived(title || config.label);
</script>

<div class="flex items-center gap-1.5 px-2 py-1.5 text-sm border-b bg-muted/30">
    {#if mode === 'history'}
        <History class="h-4 w-4 text-orange-500" />
    {:else if mode === 'bookmark'}
        <Bookmark class="h-4 w-4 text-yellow-500" />
    {:else}
        <Home class="h-4 w-4 text-blue-500" />
    {/if}
    <ChevronRight class="h-3 w-3 text-muted-foreground" />
    <span class="font-medium">{displayTitle}</span>
</div>
