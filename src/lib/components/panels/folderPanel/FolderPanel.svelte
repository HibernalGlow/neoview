<script lang="ts">
/**
 * FolderPanel - 文件面板主组件
 * 采用层叠式导航，每个目录是独立的层
 * 进入子目录推入新层，返回弹出当前层，上一层保持原状
 */
import { onMount } from 'svelte';
import type { FsItem } from '$lib/types';
import { homeDir } from '@tauri-apps/api/path';
import { writable } from 'svelte/store';

import FolderToolbar from './components/FolderToolbar.svelte';
import BreadcrumbBar from './components/BreadcrumbBar.svelte';
import FolderStack from './components/FolderStack.svelte';
import FolderTree from './components/FolderTree.svelte';
import FolderContextMenu from './components/FolderContextMenu.svelte';
import SearchBar from '$lib/components/ui/SearchBar.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';

import {
	currentPath,
	folderPanelActions,
	folderTreeConfig,
	searchKeyword,
	showSearchBar
} from './stores/folderPanelStore.svelte';

// 导航命令 store（用于父子组件通信）
const navigationCommand = writable<{ type: 'init' | 'push' | 'pop' | 'goto'; path?: string; index?: number } | null>(null);

// 右键菜单状态
let contextMenu = $state<{ x: number; y: number; item: FsItem | null; visible: boolean }>({
	x: 0,
	y: 0,
	item: null,
	visible: false
});

// 处理项打开（文件双击）
async function handleItemOpen(item: FsItem) {
	if (!item.isDir) {
		console.log('[FolderPanel] Open file:', item.path);
		// 作为书籍打开
		try {
			await bookStore.openBook(item.path);
		} catch (err) {
			console.error('[FolderPanel] Failed to open file:', err);
		}
	}
}

// 处理右键菜单
function handleContextMenu(event: MouseEvent, item: FsItem) {
	event.preventDefault();
	contextMenu = {
		x: event.clientX,
		y: event.clientY,
		item,
		visible: true
	};
}

// 关闭右键菜单
function closeContextMenu() {
	contextMenu = { ...contextMenu, visible: false, item: null };
}

// 作为书籍打开文件夹
async function handleOpenFolderAsBook(item: FsItem) {
	if (!item.isDir) return;
	try {
		await bookStore.openDirectoryAsBook(item.path);
	} catch (err) {
		console.error('[FolderPanel] Failed to open folder as book:', err);
	}
}

// 添加书签
function handleAddBookmark(item: FsItem) {
	bookmarkStore.add({
		path: item.path,
		name: item.name,
		isDirectory: item.isDir
	});
}

// 设为主页
function handleSetAsHomepage(item: FsItem) {
	if (item.isDir) {
		folderPanelActions.setHomePath(item.path);
		localStorage.setItem('neoview-homepage-path', item.path);
	}
}

// 复制路径
function handleCopyPath(item: FsItem) {
	navigator.clipboard.writeText(item.path);
}

// 复制文件名
function handleCopyName(item: FsItem) {
	navigator.clipboard.writeText(item.name);
}

// 处理刷新
function handleRefresh() {
	const path = $currentPath;
	if (path) {
		navigationCommand.set({ type: 'init', path });
	}
}

// 处理导航（面包屑、文件夹树点击）
function handleNavigate(path: string) {
	navigationCommand.set({ type: 'push', path });
}

// 处理后退
function handleGoBack() {
	navigationCommand.set({ type: 'pop' });
}

// 处理回到 Home
async function handleGoHome() {
	const home = await homeDir();
	navigationCommand.set({ type: 'init', path: home });
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

		// 初始化层叠导航
		const initialPath = $currentPath || home;
		navigationCommand.set({ type: 'init', path: initialPath });
	} catch (err) {
		console.error('[FolderPanel] Failed to initialize:', err);
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
		onGoBack={handleGoBack}
		onGoHome={handleGoHome}
	/>

	<!-- 搜索栏（可切换显示） -->
	{#if $showSearchBar}
		<div class="border-b px-2 py-1.5">
			<SearchBar
				placeholder="搜索文件..."
				onSearch={handleSearch}
			/>
		</div>
	{/if}

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

				<!-- 文件列表（层叠式） -->
				<div class="flex-1 overflow-hidden">
					<FolderStack
						{navigationCommand}
						onItemOpen={handleItemOpen}
						onItemContextMenu={handleContextMenu}
						onOpenFolderAsBook={handleOpenFolderAsBook}
					/>
				</div>
			</div>
		{:else}
			<!-- 纯文件列表（层叠式） -->
			<FolderStack
				{navigationCommand}
				onItemOpen={handleItemOpen}
				onItemContextMenu={handleContextMenu}
				onOpenFolderAsBook={handleOpenFolderAsBook}
			/>
		{/if}
	</div>
</div>

<!-- 右键菜单 -->
<FolderContextMenu
	item={contextMenu.item}
	x={contextMenu.x}
	y={contextMenu.y}
	visible={contextMenu.visible}
	onClose={closeContextMenu}
	onOpenAsBook={handleItemOpen}
	onBrowse={(item) => navigationCommand.set({ type: 'push', path: item.path })}
	onAddBookmark={handleAddBookmark}
	onSetAsHomepage={handleSetAsHomepage}
	onCopyPath={handleCopyPath}
	onCopyName={handleCopyName}
/>
