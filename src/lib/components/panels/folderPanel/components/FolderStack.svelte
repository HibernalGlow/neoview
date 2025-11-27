<script lang="ts">
/**
 * FolderStack - 层叠式文件夹导航
 * 参考 iOS UINavigationController 的设计
 * 每个目录是一个独立的层，进入子目录推入新层，返回弹出当前层
 * 上一层的 DOM 和状态保持不变，实现秒切换
 */
import { tick } from 'svelte';
import type { FsItem } from '$lib/types';
import type { Writable } from 'svelte/store';
import { FileSystemAPI } from '$lib/api';
import { thumbnailManager } from '$lib/utils/thumbnailManager';
import VirtualizedFileList from '$lib/components/panels/file/components/VirtualizedFileList.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import {
	viewStyle,
	folderPanelActions,
	selectedItems,
	multiSelectMode,
	deleteMode,
	sortConfig,
	searchKeyword
} from '../stores/folderPanelStore.svelte';
import { Loader2, FolderOpen, AlertCircle } from '@lucide/svelte';

interface NavigationCommand {
	type: 'init' | 'push' | 'pop' | 'goto';
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

// 缩略图 Map
let thumbnails = $derived(fileBrowserStore.getState().thumbnails);

// 视图模式映射
let viewMode = $derived(($viewStyle === 'thumbnail' ? 'thumbnails' : 'list') as 'list' | 'thumbnails');

// 排序函数
function sortItems(items: FsItem[], field: string, order: string): FsItem[] {
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
			case 'type':
				const extA = a.name.split('.').pop()?.toLowerCase() || '';
				const extB = b.name.split('.').pop()?.toLowerCase() || '';
				comparison = extA.localeCompare(extB);
				break;
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
	folderPanelActions.setPath(path);
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
		const items = await FileSystemAPI.browseDirectory(path);
		layer.items = items;
		layer.loading = false;
		
		// 异步加载缩略图
		loadThumbnailsForLayer(items);
	} catch (err) {
		layer.error = err instanceof Error ? err.message : String(err);
		layer.loading = false;
	}

	return layer;
}

// 加载缩略图
async function loadThumbnailsForLayer(items: FsItem[]) {
	const imageItems = items.filter((item) => {
		if (item.isDir) return false;
		const ext = item.name.split('.').pop()?.toLowerCase() || '';
		return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(ext);
	});

	for (const item of imageItems.slice(0, 50)) {
		try {
			await thumbnailManager.getThumbnail(item.path);
		} catch {
			// 忽略错误
		}
	}
}

// 推入新层（进入子目录）
async function pushLayer(path: string) {
	if (isAnimating) return;
	
	isAnimating = true;
	
	// 保存当前层的选中状态
	if (layers[activeIndex]) {
		// 状态已经在 layers 中保持
	}
	
	// 创建新层
	const newLayer = await createLayer(path);
	
	// 移除当前层之后的所有层（如果有的话，比如后退后又前进）
	layers = [...layers.slice(0, activeIndex + 1), newLayer];
	
	// 动画切换到新层
	await tick();
	activeIndex = layers.length - 1;
	
	// 更新 store 中的路径
	folderPanelActions.setPath(path);
	
	setTimeout(() => {
		isAnimating = false;
	}, 300);
}

// 弹出当前层（返回上级）
function popLayer(): boolean {
	if (isAnimating || activeIndex <= 0) return false;
	
	isAnimating = true;
	
	// 切换到上一层
	activeIndex = activeIndex - 1;
	
	// 更新 store 中的路径
	const prevLayer = layers[activeIndex];
	if (prevLayer) {
		folderPanelActions.setPath(prevLayer.path);
	}
	
	setTimeout(() => {
		// 可选：移除弹出的层以释放内存
		// layers = layers.slice(0, activeIndex + 1);
		isAnimating = false;
	}, 300);
	
	return true;
}

// 跳转到指定层
function goToLayer(index: number) {
	if (isAnimating || index < 0 || index >= layers.length) return;
	
	isAnimating = true;
	activeIndex = index;
	
	const layer = layers[index];
	if (layer) {
		folderPanelActions.setPath(layer.path);
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
	}
	
	// 清除命令
	navigationCommand.set(null);
});

// 处理项选中
function handleItemSelect(layerIndex: number, payload: { item: FsItem; index: number; multiSelect: boolean }) {
	if (layerIndex !== activeIndex) return;
	
	// 更新层的选中索引
	layers[layerIndex].selectedIndex = payload.index;
	
	if (payload.multiSelect) {
		folderPanelActions.selectItem(payload.item.path, true);
	} else {
		folderPanelActions.selectItem(payload.item.path);
		// 文件夹单击直接进入
		if (payload.item.isDir) {
			pushLayer(payload.item.path);
		}
	}
}

// 处理项双击
function handleItemDoubleClick(layerIndex: number, payload: { item: FsItem; index: number }) {
	if (layerIndex !== activeIndex) return;
	
	// 文件双击打开
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
