<script lang="ts">
/**
 * InlineTreeList - 主视图树组件
 * 在文件列表中显示可展开的树结构，复用 FileItemCard 保持原有样式
 */
import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';
import { folderPanelActions, expandedFolders, currentPath, viewStyle } from '../stores/folderPanelStore.svelte';
import { ChevronRight, ChevronDown, Loader2 } from '@lucide/svelte';
import FileItemCard from '$lib/components/panels/file/components/FileItemCard.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { thumbnailManager } from '$lib/utils/thumbnailManager';

interface TreeItem extends FsItem {
	depth: number;
	isExpanded: boolean;
	isLoading: boolean;
}

interface Props {
	onItemClick?: (item: FsItem) => void;
	onItemDoubleClick?: (item: FsItem) => void;
	onItemContextMenu?: (event: MouseEvent, item: FsItem) => void;
}

let { onItemClick, onItemDoubleClick, onItemContextMenu }: Props = $props();

// 根目录内容
let rootItems = $state<FsItem[]>([]);
let isLoading = $state(false);

// 子文件夹缓存
const childrenCache = new Map<string, FsItem[]>();

// 加载中的文件夹
let loadingFolders = $state(new Set<string>());

// 缩略图
let thumbnails = $derived(fileBrowserStore.getState().thumbnails);

// 视图模式
let viewMode = $derived(($viewStyle === 'thumbnail' ? 'grid' : 'list') as 'list' | 'grid');

// 加载根目录内容
async function loadRootItems(path: string) {
	if (!path) return;
	
	isLoading = true;
	try {
		const items = await FileSystemAPI.browseDirectory(path);
		// 排序：文件夹在前
		items.sort((a, b) => {
			if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
			return a.name.localeCompare(b.name, undefined, { numeric: true });
		});
		rootItems = items;
		// 加载缩略图
		loadThumbnails(items);
	} catch (err) {
		console.error('[InlineTreeList] Failed to load root:', path, err);
		rootItems = [];
	} finally {
		isLoading = false;
	}
}

// 加载缩略图
function loadThumbnails(items: FsItem[]) {
	for (const item of items) {
		if (!item.isDir) {
			const key = item.path.replace(/\\/g, '/');
			if (!thumbnails.has(key)) {
				thumbnailManager.getThumbnail(item.path, undefined, false, 'normal').then((url) => {
					if (url) {
						fileBrowserStore.addThumbnail(key, url);
					}
				});
			}
		}
	}
}

// 监听 currentPath 变化
$effect(() => {
	const path = $currentPath;
	if (path) {
		loadRootItems(path);
	}
});

// 构建树形列表
let treeItems = $derived.by(() => {
	const result: TreeItem[] = [];
	const expanded = $expandedFolders;
	
	function addItems(itemList: FsItem[], depth: number) {
		for (const item of itemList) {
			const isExpanded = item.isDir && expanded.has(item.path);
			const isLoading = loadingFolders.has(item.path);
			
			result.push({
				...item,
				depth,
				isExpanded,
				isLoading
			});
			
			// 如果展开了，添加子项
			if (isExpanded && childrenCache.has(item.path)) {
				const children = childrenCache.get(item.path)!;
				addItems(children, depth + 1);
			}
		}
	}
	
	addItems(rootItems, 0);
	return result;
});

// 加载子文件夹内容
async function loadChildren(path: string) {
	if (childrenCache.has(path)) return;
	
	loadingFolders = new Set([...loadingFolders, path]);
	
	try {
		const children = await FileSystemAPI.browseDirectory(path);
		// 排序：文件夹在前
		children.sort((a, b) => {
			if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
			return a.name.localeCompare(b.name, undefined, { numeric: true });
		});
		childrenCache.set(path, children);
	} catch (err) {
		console.error('[InlineTreeList] Failed to load children:', path, err);
	} finally {
		const newLoading = new Set(loadingFolders);
		newLoading.delete(path);
		loadingFolders = newLoading;
	}
}

// 切换展开状态
async function toggleExpand(item: TreeItem) {
	if (!item.isDir) return;
	
	if (item.isExpanded) {
		folderPanelActions.collapseFolder(item.path);
	} else {
		// 先加载子内容
		await loadChildren(item.path);
		folderPanelActions.expandFolder(item.path);
	}
}

// 处理点击
function handleClick(item: TreeItem, event: MouseEvent) {
	// 如果点击的是展开按钮区域，切换展开状态
	const target = event.target as HTMLElement;
	if (target.closest('.expand-btn')) {
		toggleExpand(item);
		return;
	}
	
	onItemClick?.(item);
}

// 处理双击
function handleDoubleClick(item: TreeItem) {
	if (item.isDir) {
		toggleExpand(item);
	} else {
		onItemDoubleClick?.(item);
	}
}

// 处理右键
function handleContextMenu(event: MouseEvent, item: TreeItem) {
	onItemContextMenu?.(event, item);
}
</script>

<div class="inline-tree-list h-full overflow-auto">
	{#if isLoading}
		<div class="flex items-center justify-center py-8">
			<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
		</div>
	{:else if treeItems.length === 0}
		<div class="text-muted-foreground flex flex-col items-center justify-center py-12 text-center">
			<p>空文件夹</p>
		</div>
	{:else}
		{#each treeItems as item (item.path)}
			<div
				class="tree-item flex items-center"
				style="padding-left: {item.depth * 20}px"
			>
				<!-- 展开/折叠按钮 -->
				{#if item.isDir}
					<button
						type="button"
						class="expand-btn flex h-8 w-6 items-center justify-center shrink-0"
						onclick={(e) => { e.stopPropagation(); toggleExpand(item); }}
					>
						{#if item.isLoading}
							<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
						{:else if item.isExpanded}
							<ChevronDown class="h-4 w-4 text-muted-foreground" />
						{:else}
							<ChevronRight class="h-4 w-4 text-muted-foreground" />
						{/if}
					</button>
				{:else}
					<div class="w-6 shrink-0"></div>
				{/if}
				
				<!-- 文件项卡片 -->
				<div class="flex-1 min-w-0">
					<FileItemCard
						{item}
						thumbnail={thumbnails.get(item.path.replace(/\\/g, '/'))}
						viewMode={viewMode}
						onClick={() => onItemClick?.(item)}
						onDoubleClick={() => {
							if (item.isDir) {
								toggleExpand(item);
							} else {
								onItemDoubleClick?.(item);
							}
						}}
						onContextMenu={(e) => onItemContextMenu?.(e, item)}
					/>
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
	.tree-item {
		transition: background-color 0.1s;
	}
	.tree-item:hover {
		background-color: hsl(var(--accent) / 0.5);
	}
</style>
