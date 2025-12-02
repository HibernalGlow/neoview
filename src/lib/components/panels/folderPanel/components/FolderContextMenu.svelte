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
	PanelRight
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
	onOpenWithSystem
}: Props = $props();

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
</script>

{#if visible && item}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		class="context-menu pointer-events-auto fixed"
		style="left: {x}px; top: {y}px; z-index: 9999;"
		onclick={(e) => e.stopPropagation()}
		onmousedown={(e) => e.stopPropagation()}
	>
		<div class="bg-popover text-popover-foreground min-w-[180px] rounded-md border p-1 shadow-md">
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
