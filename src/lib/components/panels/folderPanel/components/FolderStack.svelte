<script lang="ts">
/**
 * FolderStack - 层叠式文件夹导航
 * 参考 iOS UINavigationController 的设计
 * 每个目录是一个独立的层，进入子目录推入新层，返回弹出当前层
 * 上一层的 DOM 和状态保持不变，实现秒切换
 */
import { tick, onMount } from 'svelte';
import type { FsItem } from '$lib/types';
import type { Writable } from 'svelte/store';
import * as FileSystemAPI from '$lib/api/filesystem';
import { thumbnailManager } from '$lib/utils/thumbnailManager';
import VirtualizedFileList from '$lib/components/panels/file/components/VirtualizedFileList.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import {
	folderTabActions,
	tabViewStyle,
	tabSelectedItems,
	tabMultiSelectMode,
	tabDeleteMode,
	tabSortConfig,
	tabSearchKeyword,
	tabPenetrateMode
} from '../stores/folderTabStore.svelte';

// 别名映射
const viewStyle = tabViewStyle;
const selectedItems = tabSelectedItems;
const multiSelectMode = tabMultiSelectMode;
const deleteMode = tabDeleteMode;
const sortConfig = tabSortConfig;
const searchKeyword = tabSearchKeyword;
const penetrateMode = tabPenetrateMode;
import { Loader2, FolderOpen, AlertCircle } from '@lucide/svelte';
import { directoryTreeCache } from '../utils/directoryTreeCache';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { getDefaultRating } from '$lib/stores/emm/storage';

interface NavigationCommand {
	type: 'init' | 'push' | 'pop' | 'goto' | 'history';
	path?: string;
	index?: number;
}

interface Props {
	navigationCommand: Writable<NavigationCommand | null>;
	onItemOpen?: (item: FsItem) => void;
	onItemDelete?: (item: FsItem) => void;
	onItemContextMenu?: (event: MouseEvent, item: FsItem) => void;
	onOpenFolderAsBook?: (item: FsItem) => void;
}

let { navigationCommand, onItemOpen, onItemDelete, onItemContextMenu, onOpenFolderAsBook }: Props = $props();

// 层叠数据结构
interface FolderLayer {
	id: string;
	path: string;
	items: FsItem[];
	loading: boolean;
	error: string | null;
	selectedIndex: number;
	scrollTop: number;
}

// 层叠栈
let layers = $state<FolderLayer[]>([]);

// 当前活跃层索引
let activeIndex = $state(0);

// 动画状态
let isAnimating = $state(false);

// 缩略图 Map - 使用 $state 并通过订阅更新
let thumbnails = $state<Map<string, string>>(new Map());

// 订阅 fileBrowserStore 的缩略图更新
$effect(() => {
	const unsubscribe = fileBrowserStore.subscribe((state) => {
		thumbnails = state.thumbnails;
	});
	return unsubscribe;
});

// 视图模式映射
let viewMode = $derived(($viewStyle === 'thumbnail' ? 'thumbnails' : 'list') as 'list' | 'thumbnails');

// 将路径转换为相对 key（用于缩略图存储）- 与老面板保持一致
function toRelativeKey(path: string): string {
	return path.replace(/\\/g, '/');
}

// 设置缩略图回调
onMount(() => {
	// 设置缩略图加载完成回调
	thumbnailManager.setOnThumbnailReady((path, dataUrl) => {
		const key = toRelativeKey(path);
		fileBrowserStore.addThumbnail(key, dataUrl);
	});
});

// 排序函数
function sortItems(items: FsItem[], field: string, order: string): FsItem[] {
	// 随机排序特殊处理
	if (field === 'random') {
		const shuffled = [...items];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	// rating 排序特殊处理
	// 规则：文件夹在前，无 rating 使用默认评分，用户自定义 rating 优先
	if (field === 'rating') {
		const defaultRating = getDefaultRating();
		const sorted = [...items].sort((a, b) => {
			// 文件夹优先
			if (a.isDir !== b.isDir) {
				return a.isDir ? -1 : 1;
			}

			// 获取有效评分（用户自定义优先，否则使用平均评分，无评分使用默认值）
			const ratingA = folderRatingStore.getEffectiveRating(a.path) ?? defaultRating;
			const ratingB = folderRatingStore.getEffectiveRating(b.path) ?? defaultRating;

			// 评分相同则按名称排序
			if (ratingA === ratingB) {
				return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
			}

			const comparison = ratingA - ratingB;
			return order === 'asc' ? comparison : -comparison;
		});
		return sorted;
	}

	const sorted = [...items].sort((a, b) => {
		// 文件夹始终在前
		if (a.isDir !== b.isDir) {
			return a.isDir ? -1 : 1;
		}

		let comparison = 0;
		switch (field) {
			case 'name':
				comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
				break;
			case 'date':
				comparison = (a.modified || 0) - (b.modified || 0);
				break;
			case 'size':
				comparison = (a.size || 0) - (b.size || 0);
				break;
			case 'type': {
				const extA = a.name.split('.').pop()?.toLowerCase() || '';
				const extB = b.name.split('.').pop()?.toLowerCase() || '';
				comparison = extA.localeCompare(extB);
				break;
			}
		}

		return order === 'desc' ? -comparison : comparison;
	});
	return sorted;
}

// 过滤函数
function filterItems(items: FsItem[], keyword: string): FsItem[] {
	if (!keyword.trim()) return items;
	const lowerKeyword = keyword.toLowerCase();
	return items.filter(item => item.name.toLowerCase().includes(lowerKeyword));
}

// 获取层的显示项（应用排序和过滤）
function getDisplayItems(layer: FolderLayer): FsItem[] {
	const config = $sortConfig;
	const keyword = $searchKeyword;
	let result = layer.items;
	result = filterItems(result, keyword);
	result = sortItems(result, config.field, config.order);
	return result;
}

// 初始化根层
async function initRoot(path: string) {
	const layer = await createLayer(path);
	layers = [layer];
	activeIndex = 0;
	folderTabActions.setPath(path);
	// 同步 items 到 store（用于工具栏显示计数）
	folderTabActions.setItems(layer.items);
}

// 初始化根层（不添加历史记录，用于历史导航）
async function initRootWithoutHistory(path: string) {
	const layer = await createLayer(path);
	layers = [layer];
	activeIndex = 0;
	// 使用 setPath 的第二个参数禁止添加历史记录
	folderTabActions.setPath(path, false);
	// 同步 items 到 store（用于工具栏显示计数）
	folderTabActions.setItems(layer.items);
}

// 创建新层
async function createLayer(path: string): Promise<FolderLayer> {
	const layer: FolderLayer = {
		id: crypto.randomUUID(),
		path,
		items: [],
		loading: true,
		error: null,
		selectedIndex: -1,
		scrollTop: 0
	};

	try {
		// 使用全局目录树缓存
		const items = await directoryTreeCache.getDirectory(path);
		layer.items = items;
		layer.loading = false;
		
		// 异步加载缩略图
		loadThumbnailsForLayer(items, path);
	} catch (err) {
		layer.error = err instanceof Error ? err.message : String(err);
		layer.loading = false;
	}

	return layer;
}

// 加载缩略图 - 【优化】只预加载前30项，其余由 VirtualizedFileList 可见范围加载
async function loadThumbnailsForLayer(items: FsItem[], path: string) {
	// 设置当前目录（用于优先级判断）
	thumbnailManager.setCurrentDirectory(path);

	// 【优化】只预加载前30项，避免大量并发请求
	const PRELOAD_COUNT = 30;
	const preloadItems = items.slice(0, PRELOAD_COUNT);

	// 过滤出需要缩略图的项目
	const itemsNeedingThumbnails = preloadItems.filter((item) => {
		const name = item.name.toLowerCase();
		const isDir = item.isDir;

		// 支持的图片扩展名
		const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.jxl', '.tiff', '.tif'];
		// 支持的压缩包扩展名
		const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
		// 支持的视频扩展名
		const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.nov', '.flv', '.webm', '.wmv', '.m4v', '.mpg', '.mpeg'];

		const ext = name.substring(name.lastIndexOf('.'));

		// 文件夹或支持的文件类型
		return isDir || imageExts.includes(ext) || archiveExts.includes(ext) || videoExts.includes(ext);
	});

	// 预加载数据库索引（只预加载前30项）
	const paths = itemsNeedingThumbnails.map((item) => item.path);
	thumbnailManager.preloadDbIndex(paths).catch((err) => {
		console.debug('预加载数据库索引失败:', err);
	});

	// 【优化】使用 normal 优先级而非 immediate，减少并发压力
	itemsNeedingThumbnails.forEach((item, index) => {
		// 前10项使用 high 优先级，其余使用 normal
		const priority = index < 10 ? 'high' : 'normal';
		
		if (item.isDir) {
			// 文件夹
			thumbnailManager.getThumbnail(item.path, undefined, false, priority);
		} else {
			// 文件：检查是否为压缩包
			const nameLower = item.name.toLowerCase();
			const isArchive =
				nameLower.endsWith('.zip') ||
				nameLower.endsWith('.cbz') ||
				nameLower.endsWith('.rar') ||
				nameLower.endsWith('.cbr') ||
				nameLower.endsWith('.7z') ||
				nameLower.endsWith('.cb7');

			thumbnailManager.getThumbnail(item.path, undefined, isArchive, priority);
			
			// 【优化】预热压缩包文件列表，加速切书
			if (isArchive) {
				FileSystemAPI.preheatArchiveList(item.path);
			}
		}
	});
}

// 检查路径是否是另一个路径的子目录
function isChildPath(childPath: string, parentPath: string): boolean {
	const normalizedChild = childPath.replace(/\\/g, '/').toLowerCase();
	const normalizedParent = parentPath.replace(/\\/g, '/').toLowerCase();
	return normalizedChild.startsWith(normalizedParent + '/');
}

// 推入新层（进入子目录）或跳转到新路径
async function pushLayer(path: string) {
	if (isAnimating) return;
	
	isAnimating = true;
	
	// 获取当前层的路径
	const currentLayer = layers[activeIndex];
	const currentPath = currentLayer?.path || '';
	
	// 判断目标路径是否是当前路径的子目录
	const isChild = currentPath && isChildPath(path, currentPath);
	
	if (isChild) {
		// 正常的子目录导航：推入新层
		const newLayer = await createLayer(path);
		layers = [...layers.slice(0, activeIndex + 1), newLayer];
		await tick();
		activeIndex = layers.length - 1;
	} else {
		// 跳转到不相关的路径：重新初始化栈
		const newLayer = await createLayer(path);
		layers = [newLayer];
		activeIndex = 0;
	}
	
	// 更新 store 中的路径
	folderTabActions.setPath(path);
	// 同步 items 到 store（用于工具栏显示计数）
	const activeLayer = layers[activeIndex];
	if (activeLayer) {
		folderTabActions.setItems(activeLayer.items);
	}
	
	setTimeout(() => {
		isAnimating = false;
	}, 300);
}

// 获取父目录路径
function getParentPath(path: string): string | null {
	const normalized = path.replace(/\\/g, '/');
	const parts = normalized.split('/').filter(Boolean);
	if (parts.length <= 1) return null; // 已经是根目录
	parts.pop();
	// 保持 Windows 盘符格式
	if (path.includes(':')) {
		return parts.join('/');
	}
	return '/' + parts.join('/');
}

// 弹出当前层（返回上级）
async function popLayer(): Promise<boolean> {
	if (isAnimating) return false;
	
	// 如果有上一层，直接切换
	if (activeIndex > 0) {
		isAnimating = true;
		activeIndex = activeIndex - 1;
		
		const prevLayer = layers[activeIndex];
		if (prevLayer) {
			folderTabActions.setPath(prevLayer.path);
			// 同步 items 到 store（用于工具栏显示计数）
			folderTabActions.setItems(prevLayer.items);
		}
		
		setTimeout(() => {
			isAnimating = false;
		}, 300);
		
		return true;
	}
	
	// 如果没有上一层，尝试导航到父目录
	const currentLayer = layers[activeIndex];
	if (currentLayer) {
		const parentPath = getParentPath(currentLayer.path);
		if (parentPath) {
			isAnimating = true;
			
			// 创建父目录层并插入到栈的开头
			const parentLayer = await createLayer(parentPath);
			layers = [parentLayer, ...layers];
			// activeIndex 保持不变，因为新层插入到了开头
			// 但我们要切换到新插入的层
			activeIndex = 0;
			
			folderTabActions.setPath(parentPath);
			
			setTimeout(() => {
				isAnimating = false;
			}, 300);
			
			return true;
		}
	}
	
	return false;
}

// 跳转到指定层
function goToLayer(index: number) {
	if (isAnimating || index < 0 || index >= layers.length) return;
	
	isAnimating = true;
	activeIndex = index;
	
	const layer = layers[index];
	if (layer) {
		folderTabActions.setPath(layer.path);
		// 同步 items 到 store（用于工具栏显示计数）
		folderTabActions.setItems(layer.items);
	}
	
	setTimeout(() => {
		isAnimating = false;
	}, 300);
}

// 监听导航命令
$effect(() => {
	const cmd = $navigationCommand;
	if (!cmd) return;
	
	switch (cmd.type) {
		case 'init':
			if (cmd.path) initRoot(cmd.path);
			break;
		case 'push':
			if (cmd.path) pushLayer(cmd.path);
			break;
		case 'pop':
			popLayer();
			break;
		case 'goto':
			if (cmd.index !== undefined) goToLayer(cmd.index);
			break;
		case 'history':
			// 历史导航：只更新视图，不添加新历史记录
			if (cmd.path) initRootWithoutHistory(cmd.path);
			break;
	}
	
	// 清除命令
	navigationCommand.set(null);
});

// 尝试穿透文件夹（只有一个子文件时才穿透）
async function tryPenetrateFolder(folderPath: string): Promise<FsItem | null> {
	try {
		const children = await FileSystemAPI.browseDirectory(folderPath);
		// 只有当文件夹只有一个子文件时才穿透
		if (children.length === 1 && !children[0].isDir) {
			console.log('[FolderStack] Penetrate mode: found single child file:', children[0].path);
			return children[0];
		}
	} catch (error) {
		console.debug('[FolderStack] 穿透模式读取目录失败:', folderPath, error);
	}
	return null;
}

// 处理项选中（单击）- 参考老面板的实现
async function handleItemSelect(layerIndex: number, payload: { item: FsItem; index: number; multiSelect: boolean }) {
	if (layerIndex !== activeIndex) return;
	
	// 更新层的选中索引
	layers[layerIndex].selectedIndex = payload.index;
	
	if (payload.multiSelect) {
		// 多选模式：只切换选中状态
		folderTabActions.selectItem(payload.item.path, true);
	} else {
		folderTabActions.selectItem(payload.item.path);
		
		if (payload.item.isDir) {
			// 文件夹：检查穿透模式
			if ($penetrateMode) {
				const penetrated = await tryPenetrateFolder(payload.item.path);
				if (penetrated) {
					// 穿透成功，打开子文件
					onItemOpen?.(penetrated);
					return;
				}
			}
			// 正常进入目录
			pushLayer(payload.item.path);
		} else {
			// 文件：直接打开
			onItemOpen?.(payload.item);
		}
	}
}

// 处理项双击
function handleItemDoubleClick(layerIndex: number, payload: { item: FsItem; index: number }) {
	if (layerIndex !== activeIndex) return;
	
	// 双击也打开文件（与单击行为一致）
	if (!payload.item.isDir) {
		onItemOpen?.(payload.item);
	}
}

// 处理选中索引变化
function handleSelectedIndexChange(layerIndex: number, payload: { index: number }) {
	if (layerIndex !== activeIndex) return;
	layers[layerIndex].selectedIndex = payload.index;
}

// 处理右键菜单
function handleItemContextMenu(layerIndex: number, payload: { event: MouseEvent; item: FsItem }) {
	if (layerIndex !== activeIndex) return;
	onItemContextMenu?.(payload.event, payload.item);
}

// 处理作为书籍打开文件夹
function handleOpenFolderAsBook(layerIndex: number, item: FsItem) {
	if (layerIndex !== activeIndex) return;
	if (item.isDir) {
		onOpenFolderAsBook?.(item);
	}
}
</script>

<div class="folder-stack relative h-full w-full overflow-hidden">
	{#each layers as layer, index (layer.id)}
		<div
			class="folder-layer absolute inset-0 bg-background transition-transform duration-300 ease-out"
			class:pointer-events-none={index !== activeIndex}
			style="transform: translateX({(index - activeIndex) * 100}%); z-index: {index};"
		>
			{#if layer.loading}
				<!-- 加载状态 -->
				<div class="flex h-full items-center justify-center">
					<Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
				</div>
			{:else if layer.error}
				<!-- 错误状态 -->
				<div class="flex h-full flex-col items-center justify-center gap-2 p-4">
					<AlertCircle class="text-destructive h-8 w-8" />
					<p class="text-destructive text-sm">{layer.error}</p>
				</div>
			{:else}
				{@const displayItems = getDisplayItems(layer)}
				{#if displayItems.length === 0}
					<!-- 空状态（过滤后无结果） -->
					<div class="flex h-full flex-col items-center justify-center gap-2 p-4">
						<FolderOpen class="text-muted-foreground h-12 w-12" />
						<p class="text-muted-foreground text-sm">
							{$searchKeyword ? '没有匹配的文件' : '文件夹为空'}
						</p>
					</div>
				{:else}
					<!-- 虚拟化列表 -->
					<VirtualizedFileList
						items={displayItems}
						currentPath={layer.path}
						{thumbnails}
						selectedIndex={layer.selectedIndex}
						isCheckMode={$multiSelectMode}
						isDeleteMode={$deleteMode}
						selectedItems={$selectedItems}
						{viewMode}
						onItemSelect={(payload) => handleItemSelect(index, payload)}
						onItemDoubleClick={(payload) => handleItemDoubleClick(index, payload)}
						onSelectedIndexChange={(payload) => handleSelectedIndexChange(index, payload)}
						on:itemContextMenu={(e) => handleItemContextMenu(index, e.detail)}
						on:openFolderAsBook={(e) => handleOpenFolderAsBook(index, e.detail.item)}
						on:deleteItem={(e) => onItemDelete?.(e.detail.item)}
					/>
				{/if}
			{/if}
		</div>
	{/each}
</div>

<style>
	.folder-stack {
		perspective: 1000px;
	}
	
	.folder-layer {
		will-change: transform;
		backface-visibility: hidden;
	}
</style>
