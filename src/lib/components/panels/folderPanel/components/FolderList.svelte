<script lang="ts">
/**
 * FolderList - 虚拟化文件列表
 * 复用现有的 VirtualizedFileList 组件实现高性能虚拟滚动
 */
import { tick } from 'svelte';
import type { FsItem } from '$lib/types';
import VirtualizedFileList from '$lib/components/panels/file/components/VirtualizedFileList.svelte';
import {
	sortedItems,
	currentPath,
	viewStyle,
	loading,
	error,
	searchKeyword,
	folderPanelActions,
	selectedItems,
	multiSelectMode,
	deleteMode
} from '../stores/folderPanelStore.svelte';
import { Loader2, FolderOpen, AlertCircle } from '@lucide/svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { isVideoFile } from '$lib/utils/videoUtils';

interface Props {
	onItemOpen?: (item: FsItem) => void;
	onItemDelete?: (item: FsItem) => void;
	onItemContextMenu?: (event: MouseEvent, item: FsItem) => void;
	getThumbnail?: (item: FsItem) => string | null;
	// 待恢复的状态
	pendingRestore?: { scrollTop: number; selectedItemPath: string | null } | null;
	// 恢复完成回调
	onRestoreComplete?: () => void;
}

let { onItemOpen, onItemDelete, onItemContextMenu, getThumbnail, pendingRestore, onRestoreComplete }: Props = $props();

// 过滤后的项
let filteredItems = $derived(() => {
	const keyword = $searchKeyword.toLowerCase().trim();
	if (!keyword) return $sortedItems;
	return $sortedItems.filter((item) => item.name.toLowerCase().includes(keyword));
});

// 选中项索引
let selectedIndex = $state(-1);

// 缩略图 Map（从 fileBrowserStore 获取）
let thumbnails = $derived(fileBrowserStore.getState().thumbnails);

// 视图模式映射
let viewMode = $derived(($viewStyle === 'thumbnail' ? 'thumbnails' : 'list') as 'list' | 'thumbnails');

// 处理选中变化
function handleSelectionChange(payload: { selectedItems: Set<string> }) {
	// 同步到 folderPanelStore
	payload.selectedItems.forEach(path => {
		folderPanelActions.selectItem(path, true);
	});
}

// 处理选中索引变化
function handleSelectedIndexChange(payload: { index: number }) {
	selectedIndex = payload.index;
	// 更新滚动位置
	folderPanelActions.updateScrollPosition(payload.index * 96); // 估算滚动位置
}

// 处理项选中
function handleItemSelect(payload: { item: FsItem; index: number; multiSelect: boolean }) {
	if (payload.multiSelect) {
		folderPanelActions.selectItem(payload.item.path, true);
	} else {
		folderPanelActions.selectItem(payload.item.path);
		// 文件夹单击直接进入
		if (payload.item.isDir) {
			onItemOpen?.(payload.item);
		}
		// 视频文件单击：打开所在文件夹作为book，然后定位到该视频
		else if (isVideoFile(payload.item.name)) {
			handleVideoClick(payload.item);
		}
	}
}

// 处理视频文件单击：打开父文件夹作为book并定位到视频页面
async function handleVideoClick(item: FsItem) {
	try {
		// 获取父文件夹路径
		const lastSlash = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
		const parentPath = lastSlash > 0 ? item.path.substring(0, lastSlash) : '';
		if (!parentPath) return;
		
		console.log('🎬 Opening video:', item.path);
		console.log('📁 Parent directory:', parentPath);
		
		// 打开父文件夹作为book
		await bookStore.openDirectoryAsBook(parentPath);
		// 跳转到指定视频
		await bookStore.navigateToImage(item.path);
		
		// 添加到历史记录
		try {
			const { historyStore } = await import('$lib/stores/history.svelte');
			historyStore.add(item.path, item.name, 0, 1);
		} catch (historyError) {
			console.error('Failed to add video history entry:', historyError);
		}
		
		console.log('✅ Video opened');
	} catch (err) {
		console.error('❌ Error opening video:', err);
	}
}

// 处理项双击
function handleItemDoubleClick(payload: { item: FsItem; index: number }) {
	// 文件双击打开
	if (!payload.item.isDir) {
		onItemOpen?.(payload.item);
	}
}

// 处理待恢复的状态
$effect(() => {
	if (pendingRestore && !$loading) {
		tick().then(() => {
			if (pendingRestore?.selectedItemPath) {
				// 找到选中项的索引
				const items = filteredItems();
				const index = items.findIndex(item => item.path === pendingRestore?.selectedItemPath);
				if (index >= 0) {
					selectedIndex = index;
					folderPanelActions.selectItem(pendingRestore.selectedItemPath);
				}
			}
			onRestoreComplete?.();
		});
	}
});
</script>

{#if $loading}
	<!-- 加载状态 -->
	<div class="flex h-full items-center justify-center">
		<Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
	</div>
{:else if $error}
	<!-- 错误状态 -->
	<div class="flex h-full flex-col items-center justify-center gap-2 p-4">
		<AlertCircle class="text-destructive h-8 w-8" />
		<p class="text-destructive text-sm">{$error}</p>
	</div>
{:else if filteredItems().length === 0}
	<!-- 空状态 -->
	<div class="flex h-full flex-col items-center justify-center gap-2 p-4">
		<FolderOpen class="text-muted-foreground h-12 w-12" />
		<p class="text-muted-foreground text-sm">
			{$searchKeyword ? '没有匹配的文件' : '文件夹为空'}
		</p>
	</div>
{:else}
	<!-- 使用现有的虚拟化列表组件 -->
	<VirtualizedFileList
		items={filteredItems()}
		currentPath={$currentPath}
		{thumbnails}
		{selectedIndex}
		isCheckMode={$multiSelectMode}
		isDeleteMode={$deleteMode}
		selectedItems={$selectedItems}
		{viewMode}
		onSelectionChange={handleSelectionChange}
		onSelectedIndexChange={handleSelectedIndexChange}
		onItemSelect={handleItemSelect}
		onItemDoubleClick={handleItemDoubleClick}
	/>
{/if}
