<script lang="ts">
/**
 * PageContextMenu - 页面列表右键菜单
 * 支持复制、删除、在资源管理器中显示等操作
 */
import { invoke } from '@tauri-apps/api/core';
import { mergeProps } from "bits-ui";
import * as Tooltip from "$lib/components/ui/tooltip/index.js";
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

		// 总是向下显示，计算下方可用空间作为最大高度
		maxHeight = Math.max(100, viewportHeight - y - padding);

		menuX = finalX;
		menuY = y;
	}
});

/**
 * 检查页面是否在压缩包内
 */
function getArchiveInfo(pageItem: PageItem): { isArchive: boolean; archivePath?: string; innerPath?: string } {
	const book = bookStore.currentBook;
	
	// 检查当前书籍是否是压缩包
	if (book?.type === 'archive' && book.path) {
		// 从当前页面获取 innerPath
		const page = book.pages?.[pageItem.index];
		if (page?.innerPath) {
			// 使用书籍路径作为压缩包路径，page.innerPath 作为内部路径
			return { isArchive: true, archivePath: book.path, innerPath: page.innerPath };
		}
		// 如果没有 innerPath，尝试使用 page.path（可能是相对路径）
		if (page?.path) {
			return { isArchive: true, archivePath: book.path, innerPath: page.path };
		}
	}
	
	// 如果 pageItem 有 innerPath，说明是压缩包内文件
	if (pageItem.innerPath && book?.path) {
		return { isArchive: true, archivePath: book.path, innerPath: pageItem.innerPath };
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
		console.log('[PageContextMenu] archiveInfo:', archiveInfo, 'currentItem:', currentItem);
		
		if (archiveInfo.isArchive && archiveInfo.archivePath && archiveInfo.innerPath) {
			// 压缩包内文件：先提取到临时文件（使用友好的文件名格式）
			showSuccessToast('正在提取...', currentItem.name);
			console.log('[PageContextMenu] Extracting from archive:', archiveInfo.archivePath, archiveInfo.innerPath);
			
			const tempPath = await invoke<string>('extract_for_clipboard', {
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
			class=" backdrop-blur-md text-popover-foreground min-w-40 overflow-hidden rounded-md border shadow-md"
			style="max-height: {maxHeight}px;"
		>
			<div class="overflow-y-auto p-1" style="max-height: {maxHeight}px;">
				<!-- Row 1: Common Actions -->
				<div class="flex flex-row items-center justify-start gap-1 p-1">
					<Tooltip.Root delayDuration={400}>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps }: { props: any })}
								<button
									{...mergeProps(
										{
											class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
											onclick: handleCopy
										},
										tooltipProps
									)}
								>
									<Copy class="h-4 w-4" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">复制文件</Tooltip.Content>
					</Tooltip.Root>

					{#if onDelete}
						<Tooltip.Root delayDuration={400}>
							<Tooltip.Trigger>
								{#snippet child({ props: tooltipProps }: { props: any })}
									<button
										{...mergeProps(
											{
												class: 'hover:bg-destructive hover:text-destructive-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
												onclick: handleDelete
											},
											tooltipProps
										)}
									>
										<Trash2 class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom">删除</Tooltip.Content>
						</Tooltip.Root>
					{/if}
				</div>

				<!-- Row 2: Navigation Actions -->
				<div class="flex flex-row items-center justify-start gap-1 p-1">
					<Tooltip.Root delayDuration={400}>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps }: { props: any })}
								<button
									{...mergeProps(
										{
											class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
											onclick: handleGoToPage
										},
										tooltipProps
									)}
								>
									<Play class="h-4 w-4" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">跳转到此页</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root delayDuration={400}>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps }: { props: any })}
								<button
									{...mergeProps(
										{
											class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
											onclick: handleShowInExplorer
										},
										tooltipProps
									)}
								>
									<FolderOpen class="h-4 w-4" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">在资源管理器中显示</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root delayDuration={400}>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps }: { props: any })}
								<button
									{...mergeProps(
										{
											class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
											onclick: handleOpenWithSystem
										},
										tooltipProps
									)}
								>
									<ExternalLink class="h-4 w-4" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">用默认软件打开</Tooltip.Content>
					</Tooltip.Root>
				</div>

				<div class="bg-border my-1 h-px"></div>
				
				<!-- 其他操作（如果有的话可以加在这里，目前没有） -->
				<div class="px-2 py-1 text-xs text-muted-foreground">
					{item.name}
				</div>
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
