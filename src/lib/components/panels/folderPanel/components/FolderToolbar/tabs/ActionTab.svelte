<script lang="ts">
/**
 * ActionTab - 快捷操作标签页
 * 包含预热目录、递归显示、刷新树等快捷操作
 */
import { Flame, RefreshCw, Trash2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { get } from 'svelte/store';
import { folderThumbnailLoader, type WarmupProgress } from '$lib/utils/thumbnail';
import { addExcludedPath, isPathExcluded, removeExcludedPath } from '$lib/stores/excludedPaths.svelte';
import { directoryTreeCache } from '../../../utils/directoryTreeCache';
import { reloadThumbnail } from '$lib/stores/thumbnailStoreV3.svelte';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import {
	folderTabActions,
	tabSelectedItems,
	tabItems,
	tabCurrentPath
} from '../../../stores/folderTabStore';
import * as Progress from '$lib/components/ui/progress';

interface Props {
	/** 多选模式 */
	multiSelectMode: boolean;
	/** 刷新回调 */
	onRefresh?: () => void;
}

let { multiSelectMode, onRefresh }: Props = $props();

// 预热状态
let isWarming = $state(false);
let warmupProgress = $state<WarmupProgress | null>(null);

// 批量重载缩略图状态
let isReloadingThumbnails = $state(false);
let reloadThumbnailsProgress = $state<{ current: number; total: number } | null>(null);

// 当前路径
const currentPathStore = tabCurrentPath;

async function startWarmup() {
	const path = get(currentPathStore);
	if (!path || isWarming) return;
	
	isWarming = true;
	warmupProgress = null;
	
	try {
		await folderThumbnailLoader.warmupRecursive(
			path,
			(progress) => { warmupProgress = { ...progress }; },
			3
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

function handleClearTreeCache() {
	directoryTreeCache.clear();
	onRefresh?.();
}

async function handleReloadAllThumbnails() {
	const path = get(currentPathStore);
	if (!path || isReloadingThumbnails) return;
	
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

async function handleReloadSelectedThumbnails() {
	const path = get(currentPathStore);
	if (!path || isReloadingThumbnails) return;
	
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

<!-- 预热进度条 -->
{#if warmupProgress}
	<div class="border-t mt-2 pt-2">
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
