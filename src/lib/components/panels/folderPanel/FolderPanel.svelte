<script lang="ts">
/**
 * FolderPanel - 文件面板主组件
 * 参考 NeeView 的 FolderListView 设计
 * 模块化架构，每个子模块不超过 800 行
 */
import { onMount } from 'svelte';
import { FileSystemAPI } from '$lib/api';
import type { FsItem } from '$lib/types';
import { homeDir } from '@tauri-apps/api/path';
import { thumbnailManager } from '$lib/utils/thumbnailManager';

import FolderToolbar from './components/FolderToolbar.svelte';
import BreadcrumbBar from './components/BreadcrumbBar.svelte';
import FolderList from './components/FolderList.svelte';
import FolderTree from './components/FolderTree.svelte';
import SearchBar from '$lib/components/ui/SearchBar.svelte';

import {
	currentPath,
	folderPanelActions,
	folderTreeConfig,
	searchKeyword,
	recursiveMode,
	selectedItems,
	sortedItems
} from './stores/folderPanelStore.svelte';

// 缩略图缓存
let thumbnailCache = $state(new Map<string, string>());

// 待恢复的状态（用于前进/后退时恢复滚动位置和选中项）
let pendingRestore = $state<{ scrollTop: number; selectedItemPath: string | null } | null>(null);

// FolderList 组件引用
let folderListRef: { scrollToPosition: (top: number) => void; scrollToItem: (path: string) => void } | null = null;

// 加载目录内容（优先使用缓存）
async function loadDirectory(path: string, restoreState?: { scrollTop: number; selectedItemPath: string | null }) {
	if (!path) return;

	// 先检查缓存
	const cachedItems = folderPanelActions.getCachedItems(path);
	if (cachedItems) {
		// 使用缓存，不显示加载状态
		folderPanelActions.setItems(cachedItems);
		
		// 如果有待恢复的状态，设置它
		if (restoreState) {
			pendingRestore = restoreState;
		}
		
		// 异步加载缩略图
		loadThumbnails(cachedItems);
		return;
	}

	// 没有缓存，从磁盘加载
	folderPanelActions.setLoading(true);

	try {
		const items = await FileSystemAPI.browseDirectory(path);
		folderPanelActions.setItems(items);
		
		// 如果有待恢复的状态，设置它
		if (restoreState) {
			pendingRestore = restoreState;
		}

		// 异步加载缩略图
		loadThumbnails(items);
	} catch (err) {
		console.error('[FolderPanel] Failed to load directory:', err);
		folderPanelActions.setError(err instanceof Error ? err.message : '加载失败');
	}
}

// 加载缩略图
async function loadThumbnails(items: FsItem[]) {
	const imageItems = items.filter((item) => {
		if (item.isDir) return false;
		const ext = item.name.split('.').pop()?.toLowerCase() || '';
		return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(ext);
	});

	// 批量加载缩略图
	for (const item of imageItems.slice(0, 50)) {
		// 限制初始加载数量
		try {
			const thumbnail = await thumbnailManager.getThumbnail(item.path);
			if (thumbnail) {
				thumbnailCache.set(item.path, thumbnail);
				thumbnailCache = new Map(thumbnailCache); // 触发响应式更新
			}
		} catch (err) {
			// 忽略单个缩略图加载错误
		}
	}
}

// 获取缩略图
function getThumbnail(item: FsItem): string | null {
	return thumbnailCache.get(item.path) ?? null;
}

// 处理项打开
async function handleItemOpen(item: FsItem) {
	if (item.isDir) {
		// 先保存当前位置（参考 NeeView 的 SavePlace）
		saveCurrentPosition();
		// 获取目标路径的保存位置
		const position = folderPanelActions.setPath(item.path);
		// 转换为恢复状态格式
		const restoreState = position ? { scrollTop: 0, selectedItemPath: position.path } : undefined;
		await loadDirectory(item.path, restoreState);
	} else {
		// 打开文件 - 可以触发事件或直接处理
		console.log('[FolderPanel] Open file:', item.path);
		// TODO: 集成到主应用的文件打开逻辑
	}
}

// 保存当前位置到字典
function saveCurrentPosition() {
	// 获取当前选中项
	const selected = $selectedItems;
	const selectedPaths = Array.from(selected);
	if (selectedPaths.length > 0) {
		const items = $sortedItems;
		const selectedPath = selectedPaths[0];
		const index = items.findIndex((item: FsItem) => item.path === selectedPath);
		const selectedItem = items.find((item: FsItem) => item.path === selectedPath);
		if (selectedItem && index >= 0) {
			folderPanelActions.savePlace(selectedItem, index);
		}
	}
}

// 处理项删除
async function handleItemDelete(item: FsItem) {
	try {
		// TODO: 实现删除逻辑
		console.log('[FolderPanel] Delete item:', item.path);
	} catch (err) {
		console.error('[FolderPanel] Failed to delete:', err);
	}
}

// 处理右键菜单
function handleItemContextMenu(event: MouseEvent, item: FsItem) {
	// TODO: 实现右键菜单
	console.log('[FolderPanel] Context menu:', item.path);
}

// 处理刷新
async function handleRefresh() {
	const path = $currentPath;
	if (path) {
		await loadDirectory(path);
	}
}

// 处理导航（点击文件夹进入，如面包屑导航）
async function handleNavigate(path: string) {
	// 先保存当前位置
	saveCurrentPosition();
	// 获取目标路径的保存位置
	const position = folderPanelActions.setPath(path);
	// 转换为恢复状态格式
	const restoreState = position ? { scrollTop: 0, selectedItemPath: position.path } : undefined;
	await loadDirectory(path, restoreState);
}

// 处理带位置恢复的导航（前进/后退）
async function handleNavigateWithPosition(path: string, position: { path: string | null; index: number } | null) {
	// 先保存当前位置
	saveCurrentPosition();
	// 转换为恢复状态格式
	const restoreState = position ? { scrollTop: 0, selectedItemPath: position.path } : undefined;
	await loadDirectory(path, restoreState);
}

// 处理搜索
function handleSearch(keyword: string) {
	folderPanelActions.setSearchKeyword(keyword);
}

// 处理文件夹树切换
function handleToggleFolderTree() {
	folderPanelActions.toggleFolderTree();
}

// 初始化
onMount(async () => {
	try {
		// 设置默认 Home 路径
		const home = await homeDir();
		folderPanelActions.setHomePath(home);

		// 如果没有当前路径，导航到 Home
		if (!$currentPath) {
			folderPanelActions.setPath(home);
			await loadDirectory(home);
		} else {
			await loadDirectory($currentPath);
		}
	} catch (err) {
		console.error('[FolderPanel] Failed to initialize:', err);
	}
});

// 监听路径变化
$effect(() => {
	const path = $currentPath;
	if (path) {
		// 路径变化时清空缩略图缓存
		thumbnailCache.clear();
	}
});
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- 面包屑导航 -->
	<div class="border-b">
		<BreadcrumbBar onNavigate={handleNavigate} />
	</div>

	<!-- 工具栏 -->
	<FolderToolbar 
		onRefresh={handleRefresh} 
		onToggleFolderTree={handleToggleFolderTree}
		onNavigateWithPosition={handleNavigateWithPosition}
	/>

	<!-- 搜索栏 -->
	<div class="border-b px-2 py-1.5">
		<SearchBar
			placeholder="搜索文件..."
			onSearch={handleSearch}
		/>
	</div>

	<!-- 主内容区 -->
	<div class="relative flex-1 overflow-hidden">
		{#if $folderTreeConfig.visible}
			<!-- 带文件夹树的布局 -->
			<div
				class="flex h-full"
				class:flex-col={$folderTreeConfig.layout === 'top'}
				class:flex-row={$folderTreeConfig.layout === 'left'}
			>
				<!-- 文件夹树区域 -->
				<div
					class="border-muted overflow-hidden"
					class:border-b={$folderTreeConfig.layout === 'top'}
					class:border-r={$folderTreeConfig.layout === 'left'}
					style={$folderTreeConfig.layout === 'top'
						? `height: ${$folderTreeConfig.size}px;`
						: `width: ${$folderTreeConfig.size}px;`}
				>
					<FolderTree onNavigate={handleNavigate} />
				</div>

				<!-- 分隔条 -->
				<div
					class="bg-border hover:bg-primary cursor-ew-resize transition-colors"
					class:h-1.5={$folderTreeConfig.layout === 'top'}
					class:w-1.5={$folderTreeConfig.layout === 'left'}
					class:cursor-ns-resize={$folderTreeConfig.layout === 'top'}
				></div>

				<!-- 文件列表 -->
				<div class="flex-1 overflow-hidden">
					<FolderList
						onItemOpen={handleItemOpen}
						onItemDelete={handleItemDelete}
						onItemContextMenu={handleItemContextMenu}
						{getThumbnail}
						{pendingRestore}
						onRestoreComplete={() => { pendingRestore = null; }}
					/>
				</div>
			</div>
		{:else}
			<!-- 纯文件列表 -->
			<FolderList
				onItemOpen={handleItemOpen}
				onItemDelete={handleItemDelete}
				onItemContextMenu={handleItemContextMenu}
				{getThumbnail}
				{pendingRestore}
				onRestoreComplete={() => { pendingRestore = null; }}
			/>
		{/if}
	</div>
</div>
