<script lang="ts">
/**
 * FolderList - 虚拟化文件列表
 * 复用现有的 VirtualizedFileList 组件实现高性能虚拟滚动
 */
import { tick } from 'svelte';
import type { FsItem } from '$lib/types';
import VirtualizedFileList from '$lib/components/panels/file/components/VirtualizedFileListV2.svelte';
import {
	folderTabActions,
	tabViewStyle,
	tabLoading,
	tabError,
	tabSearchKeyword,
	tabSelectedItems,
	tabMultiSelectMode,
	tabDeleteMode,
	tabCurrentPath,
	tabItems,
	tabSortConfig,
	tabThumbnailWidthPercent,
	tabBannerWidthPercent
} from '../stores/folderTabStore';
import { derived } from 'svelte/store';
import type { FolderSortField, FolderSortOrder } from '../stores/folderPanelStore';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { getDefaultRating } from '$lib/stores/emm/storage';
import { getCachedFolderSizeForSort, requestFolderSizes } from '$lib/stores/folderSizeCache.svelte';

// 别名映射
const currentPath = tabCurrentPath;
const viewStyle = tabViewStyle;
const loading = tabLoading;
const error = tabError;
const searchKeyword = tabSearchKeyword;
const selectedItems = tabSelectedItems;
const multiSelectMode = tabMultiSelectMode;
const deleteMode = tabDeleteMode;

// ============ 随机排序种子缓存 ============
const randomSeedCache = new Map<string, number>();
const MAX_SEED_CACHE_SIZE = 100;

function getRandomSeedForPath(path: string): number {
	const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
	if (randomSeedCache.has(normalizedPath)) {
		return randomSeedCache.get(normalizedPath)!;
	}
	const seed = Math.random() * 2147483647 | 0;
	if (randomSeedCache.size >= MAX_SEED_CACHE_SIZE) {
		const firstKey = randomSeedCache.keys().next().value;
		if (firstKey) randomSeedCache.delete(firstKey);
	}
	randomSeedCache.set(normalizedPath, seed);
	return seed;
}

function seededRandom(seed: number): () => number {
	return function() {
		let t = seed += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

function seededShuffle<T>(items: T[], seed: number): T[] {
	const shuffled = [...items];
	const random = seededRandom(seed);
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

// sortedItems 需要从 tabItems 派生
// path 参数用于随机排序种子记忆
function sortItems(items: FsItem[], field: FolderSortField, order: FolderSortOrder, path?: string): FsItem[] {
	// 随机排序特殊处理 - 使用基于路径的种子确保结果可重复
	if (field === 'random') {
		const seed = path ? getRandomSeedForPath(path) : Math.random() * 2147483647 | 0;
		const folders = items.filter(item => item.isDir);
		const files = items.filter(item => !item.isDir);
		const shuffledFolders = seededShuffle(folders, seed);
		const shuffledFiles = seededShuffle(files, seed + 1);
		const result = [...shuffledFolders, ...shuffledFiles];
		return order === 'asc' ? result : result.reverse();
	}
	if (field === 'rating') {
		const defaultRating = getDefaultRating();
		return [...items].sort((a, b) => {
			if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
			const ratingA = folderRatingStore.getEffectiveRating(a.path) ?? defaultRating;
			const ratingB = folderRatingStore.getEffectiveRating(b.path) ?? defaultRating;
			if (ratingA === ratingB) {
				return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
			}
			return order === 'asc' ? ratingA - ratingB : ratingB - ratingA;
		});
	}
	return [...items].sort((a, b) => {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
		let comparison = 0;
		switch (field) {
			case 'name': comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }); break;
			case 'date': comparison = (a.modified || 0) - (b.modified || 0); break;
			case 'size': {
			let sizeA = a.size || 0;
			let sizeB = b.size || 0;
			if (a.isDir && sizeA === 0) sizeA = getCachedFolderSizeForSort(a.path) ?? 0;
			if (b.isDir && sizeB === 0) sizeB = getCachedFolderSizeForSort(b.path) ?? 0;
			comparison = sizeA - sizeB;
			break;
		}
			case 'type': {
				const extA = a.name.split('.').pop()?.toLowerCase() || '';
				const extB = b.name.split('.').pop()?.toLowerCase() || '';
				comparison = extA.localeCompare(extB);
				break;
			}
		}
		return order === 'asc' ? comparison : -comparison;
	});

	// 按 size 排序时，异步触发文件夹大小加载（缓存为空时）
	if (field === 'size') {
		const foldersNeedingSize = items.filter(item => item.isDir && (item.size || 0) === 0 && getCachedFolderSizeForSort(item.path) === null);
		if (foldersNeedingSize.length > 0) {
			requestFolderSizes(foldersNeedingSize.map(item => item.path));
		}
	}
}

// 传入 currentPath 以支持随机排序种子记忆
const sortedItems = derived([tabItems, tabSortConfig, tabCurrentPath], ([$items, $config, $path]) => {
	const sorted = sortItems($items, $config.field, $config.order, $path);
	// 将排好序的列表缓存，供切换书籍时直接读取（不再二次排序）
	folderTabActions.setCachedSortedItems(sorted, $path, 'FolderList');
	return sorted;
});
import { Loader2, FolderOpen, AlertCircle } from '@lucide/svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { isVideoFile } from '$lib/utils/videoUtils';

interface Props {
	onItemOpen?: (item: FsItem) => void;
	onItemDelete?: (item: FsItem) => void;
	onItemContextMenu?: (event: MouseEvent, item: FsItem) => void;
	onOpenFolderAsBook?: (item: FsItem) => void;
	getThumbnail?: (item: FsItem) => string | null;
	// 待恢复的状态
	pendingRestore?: { scrollTop: number; selectedItemPath: string | null } | null;
	// 恢复完成回调
	onRestoreComplete?: () => void;
	// 双击空白处回调
	onEmptyDoubleClick?: () => void;
	// 单击空白处回调
	onEmptySingleClick?: () => void;
	// 返回按钮点击回调
	onBackButtonClick?: () => void;
	// 是否显示返回按钮
	showBackButton?: boolean;
}

let { onItemOpen, onItemDelete, onItemContextMenu, onOpenFolderAsBook, getThumbnail, pendingRestore, onRestoreComplete, onEmptyDoubleClick, onEmptySingleClick, onBackButtonClick, showBackButton = false }: Props = $props();

// 显示项（不过滤 - 搜索在 SearchResultList 中处理）
let filteredItems = $derived(() => {
	// 不再根据 searchKeyword 过滤，搜索结果在独立的 SearchResultList 中显示
	return $sortedItems;
});

// 选中项索引
let selectedIndex = $state(-1);

// 缩略图 Map（从 fileBrowserStore 获取）
let thumbnails = $derived(fileBrowserStore.getState().thumbnails);

// 视图模式映射 - 支持 list/content/banner/thumbnail 四种模式
let viewMode = $derived($viewStyle as 'list' | 'content' | 'banner' | 'thumbnail');

// 处理选中变化
function handleSelectionChange(payload: { selectedItems: Set<string> }) {
	// 同步到 folderPanelStore
	payload.selectedItems.forEach(path => {
		folderTabActions.selectItem(path, true);
	});
}

// 处理选中索引变化
function handleSelectedIndexChange(payload: { index: number }) {
	selectedIndex = payload.index;
	// 更新滚动位置
	folderTabActions.updateScrollPosition(payload.index * 96); // 估算滚动位置
}

// 处理项选中
function handleItemSelect(payload: { item: FsItem; index: number; multiSelect: boolean }) {
	if (payload.multiSelect) {
		folderTabActions.selectItem(payload.item.path, true);
	} else {
		folderTabActions.selectItem(payload.item.path);
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
			const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
			const pathStack = bookStore.buildPathStack();
			unifiedHistoryStore.add(pathStack, 0, 1, { displayName: item.name });
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
	if (payload.item.isDir) {
		onOpenFolderAsBook?.(payload.item);
	} else {
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
					folderTabActions.selectItem(pendingRestore.selectedItemPath);
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
		<p class="text-muted-foreground text-sm">文件夹为空</p>
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
		{showBackButton}
		thumbnailWidthPercent={$tabThumbnailWidthPercent}
		bannerWidthPercent={$tabBannerWidthPercent}
		onSelectionChange={handleSelectionChange}
		onSelectedIndexChange={handleSelectedIndexChange}
		onItemSelect={handleItemSelect}
		onItemDoubleClick={handleItemDoubleClick}
		onEmptyDoubleClick={() => onEmptyDoubleClick?.()}
		onEmptySingleClick={() => onEmptySingleClick?.()}
		onBackButtonClick={() => onBackButtonClick?.()}
	/>
{/if}
