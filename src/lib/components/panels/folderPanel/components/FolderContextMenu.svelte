<script lang="ts">
	/**
	 * FolderContextMenu - 文件/文件夹右键菜单
	 * 参考旧版 FileBrowser 的右键菜单功能
	 * 使用 Portal 将菜单渲染到 body，避免被父容器的 overflow 裁剪
	 */
	import type { FsItem } from '$lib/types';
	import {
		Folder,
		File,
		BookOpen,
		ExternalLink,
		Copy,
		Scissors,
		ClipboardPaste,
		Trash2,
		Star,
		Pencil,
		Play,
		FolderOpen,
		PanelRight,
		RefreshCw,
		Tags
	} from '@lucide/svelte';

	interface Props {
		item: FsItem | null;
		x: number;
		y: number;
		visible: boolean;
		onClose: () => void;
		onOpenAsBook?: (item: FsItem) => void;
		onBrowse?: (item: FsItem) => void;
		onOpenInNewTab?: (item: FsItem) => void;
		onCopy?: (item: FsItem) => void;
		onCut?: (item: FsItem) => void;
		onPaste?: () => void;
		onDelete?: (item: FsItem) => void;
		onRename?: (item: FsItem) => void;
		onAddBookmark?: (item: FsItem) => void;
		onCopyPath?: (item: FsItem) => void;
		onCopyName?: (item: FsItem) => void;
		onOpenInExplorer?: (item: FsItem) => void;
		onOpenWithSystem?: (item: FsItem) => void;
		onReloadThumbnail?: (item: FsItem) => void;
		onEditTags?: (item: FsItem) => void;
	}

	let {
		item,
		x,
		y,
		visible,
		onClose,
		onOpenAsBook,
		onBrowse,
		onOpenInNewTab,
		onCopy,
		onCut,
		onPaste,
		onDelete,
		onRename,
		onAddBookmark,
		onCopyPath,
		onCopyName,
		onOpenInExplorer,
		onOpenWithSystem,
		onReloadThumbnail,
		onEditTags
	}: Props = $props();

	// 菜单位置状态（经过边界检查调整）
	let menuX = $state(0);
	let menuY = $state(0);
	let maxHeight = $state(400); // 默认最大高度

	// Portal action - 将元素移动到 body
	function portal(node: HTMLElement) {
		// 将元素移动到 body
		document.body.appendChild(node);

		return {
			destroy() {
				// 组件销毁时移除元素
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}

	// 计算菜单位置，确保不超出屏幕边界
	$effect(() => {
		if (visible && item) {
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const menuWidth = 220; // 菜单估计宽度
			const padding = 8; // 距离边界的最小间距

			// 计算水平位置
			let finalX = x;
			if (x + menuWidth > viewportWidth - padding) {
				// 超出右边界，向左调整
				finalX = Math.max(padding, viewportWidth - menuWidth - padding);
			}

			// 计算可用的垂直空间
			const availableHeight = viewportHeight - y - padding;
			const maxAllowedHeight = Math.min(availableHeight, viewportHeight * 0.8); // 最多占屏幕80%

			// 计算垂直位置
			let finalY = y;
			if (maxAllowedHeight < 200) {
				// 下方空间不足，尝试向上显示
				const topSpace = y - padding;
				if (topSpace > availableHeight) {
					// 上方空间更大，向上显示
					maxHeight = Math.min(topSpace, viewportHeight * 0.8);
					finalY = Math.max(padding, y - maxHeight);
				} else {
					// 下方空间稍好，继续向下但限制高度
					maxHeight = maxAllowedHeight;
					finalY = y;
				}
			} else {
				maxHeight = maxAllowedHeight;
				finalY = y;
			}

			menuX = finalX;
			menuY = finalY;
		}
	});

	function handleOpenAsBook() {
		if (item) onOpenAsBook?.(item);
		onClose();
	}

	function handleBrowse() {
		if (item) onBrowse?.(item);
		onClose();
	}

	function handleOpenInNewTab() {
		if (item) onOpenInNewTab?.(item);
		onClose();
	}

	function handleCopy() {
		if (item) onCopy?.(item);
		onClose();
	}

	function handleCut() {
		if (item) onCut?.(item);
		onClose();
	}

	function handlePaste() {
		onPaste?.();
		onClose();
	}

	function handleDelete() {
		if (item) onDelete?.(item);
		onClose();
	}

	function handleRename() {
		if (item) onRename?.(item);
		onClose();
	}

	function handleAddBookmark() {
		if (item) onAddBookmark?.(item);
		onClose();
	}

	function handleCopyPath() {
		if (item) onCopyPath?.(item);
		onClose();
	}

	function handleCopyName() {
		if (item) onCopyName?.(item);
		onClose();
	}

	function handleOpenInExplorer() {
		if (item) onOpenInExplorer?.(item);
		onClose();
	}

	function handleOpenWithSystem() {
		if (item) onOpenWithSystem?.(item);
		onClose();
	}

	function handleReloadThumbnail() {
		if (item) onReloadThumbnail?.(item);
		onClose();
	}

	function handleEditTags() {
		if (item) onEditTags?.(item);
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
			class="bg-popover/80 backdrop-blur-md text-popover-foreground min-w-[180px] overflow-hidden rounded-md border shadow-md"
			style="max-height: {maxHeight}px;"
		>
			<div class="overflow-y-auto p-1" style="max-height: {maxHeight}px;">
				{#if item.isDir}
					<!-- 文件夹菜单 -->
					<button
						class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
						onclick={handleBrowse}
					>
						<Folder class="h-4 w-4" />
						<span>浏览</span>
					</button>
					<button
						class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
						onclick={handleOpenInNewTab}
					>
						<PanelRight class="h-4 w-4" />
						<span>在新标签页打开</span>
					</button>
					<button
						class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
						onclick={handleOpenAsBook}
					>
						<BookOpen class="h-4 w-4" />
						<span>作为书籍打开</span>
					</button>
				{:else}
					<!-- 文件菜单 -->
					<button
						class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
						onclick={handleOpenAsBook}
					>
						<BookOpen class="h-4 w-4" />
						<span>打开</span>
					</button>
					<button
						class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
						onclick={handleOpenInNewTab}
					>
						<PanelRight class="h-4 w-4" />
						<span>在新标签页打开</span>
					</button>
					<button
						class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
						onclick={handleOpenWithSystem}
					>
						<Play class="h-4 w-4" />
						<span>用默认软件打开</span>
					</button>
				{/if}

				<div class="bg-border my-1 h-px"></div>

				<!-- 在资源管理器中打开（通用） -->
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleOpenInExplorer}
				>
					<FolderOpen class="h-4 w-4" />
					<span>在资源管理器中打开</span>
				</button>

				<div class="bg-border my-1 h-px"></div>

				<!-- 通用操作 -->
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleAddBookmark}
				>
					<Star class="h-4 w-4" />
					<span>添加书签</span>
				</button>
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleEditTags}
				>
					<Tags class="h-4 w-4" />
					<span>编辑标签</span>
				</button>

				<div class="bg-border my-1 h-px"></div>

				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleCopy}
				>
					<Copy class="h-4 w-4" />
					<span>复制</span>
				</button>
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleCut}
				>
					<Scissors class="h-4 w-4" />
					<span>剪切</span>
				</button>
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handlePaste}
				>
					<ClipboardPaste class="h-4 w-4" />
					<span>粘贴</span>
				</button>

				<div class="bg-border my-1 h-px"></div>

				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleRename}
				>
					<Pencil class="h-4 w-4" />
					<span>重命名</span>
				</button>
				<button
					class="hover:bg-destructive hover:text-destructive-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleDelete}
				>
					<Trash2 class="h-4 w-4" />
					<span>删除</span>
				</button>

				<div class="bg-border my-1 h-px"></div>

				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleCopyPath}
				>
					<Copy class="h-4 w-4" />
					<span>复制路径</span>
				</button>
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleCopyName}
				>
					<File class="h-4 w-4" />
					<span>复制文件名</span>
				</button>

				<div class="bg-border my-1 h-px"></div>

				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleReloadThumbnail}
				>
					<RefreshCw class="h-4 w-4" />
					<span>重载缩略图</span>
				</button>
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
