<script lang="ts">
/**
 * PageContextMenu - 页面列表右键菜单
 * 支持复制、删除、在资源管理器中显示等操作
 */
import { invoke } from '@tauri-apps/api/core';
import {
	Copy,
	Trash2,
	FolderOpen,
	Play,
	ExternalLink
} from '@lucide/svelte';
import { ClipboardAPI } from '$lib/api/clipboard';
import { FileSystemAPI } from '$lib/api';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import { bookStore } from '$lib/stores/book.svelte';

interface PageItem {
	index: number;
	name: string;
	path: string;
	innerPath?: string;
}

interface Props {
	item: PageItem | null;
	x: number;
	y: number;
	visible: boolean;
	onClose: () => void;
	onGoToPage?: (index: number) => void;
	onDelete?: (item: PageItem) => void;
}

let {
	item,
	x,
	y,
	visible,
	onClose,
	onGoToPage,
	onDelete
}: Props = $props();

// 菜单位置状态
let menuX = $state(0);
let menuY = $state(0);
let maxHeight = $state(400);

// Portal action
function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		}
	};
}

// 计算菜单位置
$effect(() => {
	if (visible && item) {
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const menuWidth = 200;
		const padding = 8;

		let finalX = x;
		if (x + menuWidth > viewportWidth - padding) {
			finalX = Math.max(padding, viewportWidth - menuWidth - padding);
		}

		const availableHeight = viewportHeight - y - padding;
		const maxAllowedHeight = Math.min(availableHeight, viewportHeight * 0.8);

		let finalY = y;
		if (maxAllowedHeight < 200) {
			const topSpace = y - padding;
			if (topSpace > availableHeight) {
				maxHeight = Math.min(topSpace, viewportHeight * 0.8);
				finalY = Math.max(padding, y - maxHeight);
			} else {
				maxHeight = maxAllowedHeight;
			}
		} else {
			maxHeight = maxAllowedHeight;
		}

		menuX = finalX;
		menuY = finalY;
	}
});

/**
 * 检查页面是否在压缩包内
 */
function getArchiveInfo(pageItem: PageItem): { isArchive: boolean; archivePath?: string; innerPath?: string } {
	// 如果有 innerPath，说明是压缩包内文件
	if (pageItem.innerPath) {
		return { isArchive: true, archivePath: pageItem.path, innerPath: pageItem.innerPath };
	}
	
	// 检查当前书籍是否是压缩包
	const book = bookStore.currentBook;
	if (book?.isArchive && book.path) {
		// 对于压缩包，path 应该是压缩包路径，需要从页面数据获取 innerPath
		// 由于 page.path 可能是压缩包路径，我们需要检查
		const page = book.pages?.[pageItem.index];
		if (page?.innerPath) {
			return { isArchive: true, archivePath: book.path, innerPath: page.innerPath };
		}
	}
	
	return { isArchive: false };
}

/**
 * 复制文件到系统剪贴板
 * 如果是压缩包内文件，先提取到临时文件
 */
async function handleCopy() {
	if (!item) return;
	const currentItem = item; // 保存引用
	onClose();

	try {
		const archiveInfo = getArchiveInfo(currentItem);
		
		if (archiveInfo.isArchive && archiveInfo.archivePath && archiveInfo.innerPath) {
			// 压缩包内文件：先提取到临时文件
			showSuccessToast('正在提取...', currentItem.name);
			
			const tempPath = await invoke<string>('extract_image_to_temp', {
				archivePath: archiveInfo.archivePath,
				filePath: archiveInfo.innerPath
			});
			
			// 复制临时文件到剪贴板
			await ClipboardAPI.copyFiles([tempPath]);
			showSuccessToast('已复制', `${currentItem.name} (提取自压缩包)`);
		} else {
			// 普通文件：直接复制
			await ClipboardAPI.copyFiles([currentItem.path]);
			showSuccessToast('已复制', currentItem.name);
		}
	} catch (err) {
		console.error('[PageContextMenu] Copy failed:', err);
		showErrorToast('复制失败', err instanceof Error ? err.message : String(err));
	}
}

/**
 * 在资源管理器中显示
 */
async function handleShowInExplorer() {
	if (!item) return;
	const currentItem = item;
	onClose();

	try {
		const archiveInfo = getArchiveInfo(currentItem);
		
		if (archiveInfo.isArchive && archiveInfo.archivePath) {
			// 压缩包内文件：显示压缩包所在位置
			await FileSystemAPI.showInFileManager(archiveInfo.archivePath);
		} else {
			await FileSystemAPI.showInFileManager(currentItem.path);
		}
	} catch (err) {
		showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
	}
}

/**
 * 用默认软件打开
 */
async function handleOpenWithSystem() {
	if (!item) return;
	const currentItem = item;
	onClose();

	try {
		const archiveInfo = getArchiveInfo(currentItem);
		
		if (archiveInfo.isArchive && archiveInfo.archivePath && archiveInfo.innerPath) {
			// 压缩包内文件：先提取到临时文件
			const tempPath = await invoke<string>('extract_image_to_temp', {
				archivePath: archiveInfo.archivePath,
				filePath: archiveInfo.innerPath
			});
			await FileSystemAPI.openWithSystem(tempPath);
		} else {
			await FileSystemAPI.openWithSystem(currentItem.path);
		}
	} catch (err) {
		showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
	}
}

/**
 * 跳转到该页
 */
function handleGoToPage() {
	if (!item) return;
	onGoToPage?.(item.index);
	onClose();
}

/**
 * 删除该页
 */
function handleDelete() {
	if (!item) return;
	onDelete?.(item);
	onClose();
}
</script>

{#if visible && item}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		class="context-menu pointer-events-auto fixed"
		style="left: {menuX}px; top: {menuY}px; z-index: 9999;"
		onclick={(e) => e.stopPropagation()}
		onmousedown={(e) => e.stopPropagation()}
	>
		<div
			class="bg-popover/80 backdrop-blur-md text-popover-foreground min-w-[160px] overflow-hidden rounded-md border shadow-md"
			style="max-height: {maxHeight}px;"
		>
			<div class="overflow-y-auto p-1" style="max-height: {maxHeight}px;">
				<!-- 跳转 -->
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleGoToPage}
				>
					<Play class="h-4 w-4" />
					<span>跳转到此页</span>
				</button>

				<div class="bg-border my-1 h-px"></div>

				<!-- 复制 -->
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleCopy}
				>
					<Copy class="h-4 w-4" />
					<span>复制文件</span>
				</button>

				<!-- 用默认软件打开 -->
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleOpenWithSystem}
				>
					<ExternalLink class="h-4 w-4" />
					<span>用默认软件打开</span>
				</button>

				<!-- 在资源管理器中显示 -->
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleShowInExplorer}
				>
					<FolderOpen class="h-4 w-4" />
					<span>在资源管理器中显示</span>
				</button>

				{#if onDelete}
					<div class="bg-border my-1 h-px"></div>

					<button
						class="hover:bg-destructive hover:text-destructive-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
						onclick={handleDelete}
					>
						<Trash2 class="h-4 w-4" />
						<span>删除</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- 点击外部关闭菜单 -->
{#if visible}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		class="fixed inset-0"
		style="z-index: 9998;"
		onclick={onClose}
		onmousedown={(e) => e.stopPropagation()}
	></div>
{/if}
