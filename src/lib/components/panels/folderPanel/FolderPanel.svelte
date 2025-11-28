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
import MigrationBar from './components/MigrationBar.svelte';
import SearchBar from '$lib/components/ui/SearchBar.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { FileSystemAPI } from '$lib/api';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';

import {
	currentPath,
	folderPanelActions,
	folderTreeConfig,
	searchKeyword,
	showSearchBar,
	showMigrationBar,
	selectedItems,
	deleteMode
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

// 判断是否为视频文件
function isVideoPath(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	return ['mp4', 'mkv', 'avi', 'mov', 'flv', 'webm', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext);
}

// 判断是否为图片文件
function isImagePath(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'jxl', 'bmp', 'tiff'].includes(ext);
}

// 处理项打开（文件的单击）- 完全参考老面板的 openFile 实现
// 注意：文件夹的导航和穿透模式在 FolderStack 中处理
async function handleItemOpen(item: FsItem) {
	console.log('[FolderPanel] handleItemOpen:', item.path, 'isDir:', item.isDir);
	
	// 文件夹不应该到达这里（由 FolderStack 处理）
	if (item.isDir) {
		console.warn('[FolderPanel] Unexpected folder in handleItemOpen, should be handled by FolderStack');
		return;
	}
	
	try {
		// 文件处理
		const isArchive = await FileSystemAPI.isSupportedArchive(item.path);
		
		if (isArchive) {
			// 压缩包：作为书籍打开
			console.log('[FolderPanel] Opening archive as book:', item.path);
			await bookStore.openBook(item.path);
		} else if (isVideoPath(item.path)) {
			// 视频：作为书籍打开
			console.log('[FolderPanel] Opening video:', item.path);
			await bookStore.openBook(item.path);
		} else if (item.isImage || isImagePath(item.path)) {
			// 图片：打开所在目录作为书籍，并跳转到该图片
			console.log('[FolderPanel] Opening image:', item.path);
			// 获取父目录路径
			const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
			const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
			await bookStore.openDirectoryAsBook(parentPath);
			// 跳转到指定图片
			await bookStore.navigateToImage(item.path);
		} else {
			// 其他文件：尝试作为书籍打开
			console.log('[FolderPanel] Opening file as book:', item.path);
			await bookStore.openBook(item.path);
		}
	} catch (err) {
		console.error('[FolderPanel] Failed to open file:', err);
		showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
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

// 迁移栏管理器显示状态
let showMigrationManager = $state(false);

function handleToggleMigrationManager() {
	showMigrationManager = !showMigrationManager;
}

// 剪贴板状态
let clipboardItem = $state<{ paths: string[]; operation: 'copy' | 'cut' } | null>(null);

// 处理删除
async function handleDelete(item: FsItem) {
	const confirmMessage = `确定要删除 "${item.name}" 吗？`;
	if (!confirm(confirmMessage)) return;

	try {
		// 默认移动到回收站
		await FileSystemAPI.moveToTrash(item.path);
		showSuccessToast('删除成功', item.name);
		// 刷新当前目录
		handleRefresh();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('删除失败', message);
	}
}

// 处理批量删除（删除模式下）
async function handleBatchDelete() {
	const selected = $selectedItems;
	if (selected.size === 0) {
		showErrorToast('没有选中的文件', '请先选择要删除的文件');
		return;
	}

	const paths = Array.from(selected);
	const confirmMessage = `确定要删除选中的 ${paths.length} 个项目吗？`;
	if (!confirm(confirmMessage)) return;

	try {
		for (const path of paths) {
			await FileSystemAPI.moveToTrash(path);
		}
		showSuccessToast('删除成功', `已删除 ${paths.length} 个文件`);
		folderPanelActions.deselectAll();
		handleRefresh();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('删除失败', message);
	}
}

// 处理剪切
function handleCut(item: FsItem) {
	clipboardItem = { paths: [item.path], operation: 'cut' };
	try {
		navigator.clipboard.writeText(item.path);
	} catch {}
	showSuccessToast('已剪切', item.name);
}

// 处理复制
function handleCopy(item: FsItem) {
	clipboardItem = { paths: [item.path], operation: 'copy' };
	try {
		navigator.clipboard.writeText(item.path);
	} catch {}
	showSuccessToast('已复制', item.name);
}

// 处理粘贴
async function handlePaste() {
	if (!clipboardItem || clipboardItem.paths.length === 0) {
		showErrorToast('粘贴失败', '剪贴板为空');
		return;
	}

	const targetDir = $currentPath;
	if (!targetDir) {
		showErrorToast('粘贴失败', '请先打开一个目录');
		return;
	}

	try {
		for (const sourcePath of clipboardItem.paths) {
			const fileName = sourcePath.split(/[\\/]/).pop();
			if (!fileName) continue;
			const destPath = `${targetDir}/${fileName}`;

			if (clipboardItem.operation === 'cut') {
				await FileSystemAPI.movePath(sourcePath, destPath);
			} else {
				await FileSystemAPI.copyPath(sourcePath, destPath);
			}
		}

		showSuccessToast(
			clipboardItem.operation === 'cut' ? '移动成功' : '复制成功',
			`已${clipboardItem.operation === 'cut' ? '移动' : '复制'} ${clipboardItem.paths.length} 个文件`
		);

		// 如果是剪切，清空剪贴板
		if (clipboardItem.operation === 'cut') {
			clipboardItem = null;
		}

		handleRefresh();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('粘贴失败', message);
	}
}

// 处理重命名
async function handleRename(item: FsItem) {
	const newName = prompt('请输入新名称:', item.name);
	if (!newName || newName === item.name) return;

	try {
		// 构建新路径
		const parentPath = item.path.substring(0, item.path.lastIndexOf(item.name));
		const newPath = parentPath + newName;
		await FileSystemAPI.renamePath(item.path, newPath);
		showSuccessToast('重命名成功', `${item.name} → ${newName}`);
		handleRefresh();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('重命名失败', message);
	}
}

// 在资源管理器中打开
async function handleOpenInExplorer(item: FsItem) {
	try {
		await FileSystemAPI.showInFileManager(item.path);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('打开失败', message);
	}
}

// 用默认软件打开
async function handleOpenWithSystem(item: FsItem) {
	try {
		await FileSystemAPI.openWithSystem(item.path);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('打开失败', message);
	}
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

	<!-- 迁移栏（可切换显示） -->
	{#if $showMigrationBar}
		<MigrationBar
			showManager={showMigrationManager}
			onToggleManager={handleToggleMigrationManager}
		/>
	{/if}

	<!-- 主内容区 - 使用层叠式布局 -->
	<div class="relative flex-1 overflow-hidden">
		<!-- 文件夹树层（绝对定位，在文件列表上方） -->
		{#if $folderTreeConfig.visible}
			<div
				class="border-muted absolute z-10 overflow-hidden bg-background"
				class:border-b={$folderTreeConfig.layout === 'top'}
				class:border-r={$folderTreeConfig.layout === 'left'}
				style={$folderTreeConfig.layout === 'top'
					? `top: 0; left: 0; right: 0; height: ${$folderTreeConfig.size}px;`
					: `top: 0; left: 0; bottom: 0; width: ${$folderTreeConfig.size}px;`}
			>
				<FolderTree onNavigate={handleNavigate} />
			</div>

			<!-- 分隔条 -->
			<div
				class="bg-border hover:bg-primary absolute z-10 transition-colors"
				class:cursor-ns-resize={$folderTreeConfig.layout === 'top'}
				class:cursor-ew-resize={$folderTreeConfig.layout === 'left'}
				style={$folderTreeConfig.layout === 'top'
					? `top: ${$folderTreeConfig.size}px; left: 0; right: 0; height: 6px;`
					: `top: 0; left: ${$folderTreeConfig.size}px; bottom: 0; width: 6px;`}
			></div>
		{/if}

		<!-- 文件列表（层叠式）- 始终渲染，根据文件树状态调整位置 -->
		<div
			class="absolute inset-0 overflow-hidden"
			style={$folderTreeConfig.visible
				? $folderTreeConfig.layout === 'top'
					? `top: ${$folderTreeConfig.size + 6}px;`
					: `left: ${$folderTreeConfig.size + 6}px;`
				: ''}
		>
			<FolderStack
				{navigationCommand}
				onItemOpen={handleItemOpen}
				onItemContextMenu={handleContextMenu}
				onOpenFolderAsBook={handleOpenFolderAsBook}
			/>
		</div>
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
	onCopy={handleCopy}
	onCut={handleCut}
	onPaste={handlePaste}
	onDelete={handleDelete}
	onRename={handleRename}
	onAddBookmark={handleAddBookmark}
	onSetAsHomepage={handleSetAsHomepage}
	onCopyPath={handleCopyPath}
	onCopyName={handleCopyName}
	onOpenInExplorer={handleOpenInExplorer}
	onOpenWithSystem={handleOpenWithSystem}
/>
