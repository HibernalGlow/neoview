<script lang="ts">
	/**
	 * FolderContextMenu - 文件/文件夹右键菜单
	 * 参考旧版 FileBrowser 的右键菜单功能
	 * 使用 Portal 将菜单渲染到 body，避免被父容器的 overflow 裁剪
	 */
	import { mergeProps } from "bits-ui";
	import * as Tooltip from "$lib/components/ui/tooltip/index.js";
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
		Tags,
		Undo2
	} from '@lucide/svelte';
	import { Pin } from '@lucide/svelte';
	import { folderTreePinStore } from '$lib/stores/folderTreePin.svelte';

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
		onToggleFolderTreePin?: (item: FsItem) => void;
		onCopyPath?: (item: FsItem) => void;
		onCopyName?: (item: FsItem) => void;
		onOpenInExplorer?: (item: FsItem) => void;
		onOpenWithSystem?: (item: FsItem) => void;
		onReloadThumbnail?: (item: FsItem) => void;
		onEditTags?: (item: FsItem) => void;
		onUndoDelete?: () => void;
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
		onToggleFolderTreePin,
		onCopyPath,
		onCopyName,
		onOpenInExplorer,
		onOpenWithSystem,
		onReloadThumbnail,
		onEditTags,
		onUndoDelete
	}: Props = $props();

	let isPinnedInFolderTree = $state(false);

	$effect(() => {
		if (!visible || !item) {
			isPinnedInFolderTree = false;
			return;
		}
		const unsubscribe = folderTreePinStore.subscribe((paths) => {
			const key = item.path.replace(/\\/g, '/').toLowerCase();
			isPinnedInFolderTree = paths.includes(key);
		});
		return unsubscribe;
	});

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

			// 总是向下显示，计算下方可用空间作为最大高度
			// 如果下方空间太小，允许溢出屏幕或通过内部滚动处理
			maxHeight = Math.max(100, viewportHeight - y - padding);

			menuX = finalX;
			menuY = y;
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

	function handleToggleFolderTreePin() {
		if (item) onToggleFolderTreePin?.(item);
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

	function handleUndoDelete() {
		onUndoDelete?.();
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
			class="bg-popover/80 backdrop-blur-md text-popover-foreground min-w-45 overflow-hidden rounded-md border shadow-md"
			style="max-height: {maxHeight}px;"
		>
			<div class="overflow-y-auto p-1" style="max-height: {maxHeight}px;">
				<!-- Row 1: Common Actions -->
				<div class="flex flex-row items-center justify-between gap-1 p-1">
					<Tooltip.Root delayDuration={400}>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps }: { props: any })}
								<button
									{...mergeProps(
										{
											class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
											onclick: handleCut
										},
										tooltipProps
									)}
								>
									<Scissors class="h-4 w-4" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">剪切</Tooltip.Content>
					</Tooltip.Root>

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
						<Tooltip.Content side="bottom">复制</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root delayDuration={400}>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps }: { props: any })}
								<button
									{...mergeProps(
										{
											class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
											onclick: handlePaste
										},
										tooltipProps
									)}
								>
									<ClipboardPaste class="h-4 w-4" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">粘贴</Tooltip.Content>
					</Tooltip.Root>

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

					<Tooltip.Root delayDuration={400}>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps }: { props: any })}
								<button
									{...mergeProps(
										{
											class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
											onclick: handleRename
										},
										tooltipProps
									)}
								>
									<Pencil class="h-4 w-4" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">重命名</Tooltip.Content>
					</Tooltip.Root>
				</div>

				<!-- Row 2: Navigation Actions -->
				<div class="flex flex-row items-center justify-start gap-1 p-1">
					{#if item.isDir}
						<Tooltip.Root delayDuration={400}>
							<Tooltip.Trigger>
								{#snippet child({ props: tooltipProps }: { props: any })}
									<button
										{...mergeProps(
											{
												class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
												onclick: handleBrowse
											},
											tooltipProps
										)}
									>
										<Folder class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom">浏览</Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root delayDuration={400}>
							<Tooltip.Trigger>
								{#snippet child({ props: tooltipProps }: { props: any })}
									<button
										{...mergeProps(
											{
												class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
												onclick: handleOpenInNewTab
											},
											tooltipProps
										)}
									>
										<PanelRight class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom">在新标签页打开</Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root delayDuration={400}>
							<Tooltip.Trigger>
								{#snippet child({ props: tooltipProps }: { props: any })}
									<button
										{...mergeProps(
											{
												class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
												onclick: handleOpenAsBook
											},
											tooltipProps
										)}
									>
										<BookOpen class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom">作为书籍打开</Tooltip.Content>
						</Tooltip.Root>
					{:else}
						<Tooltip.Root delayDuration={400}>
							<Tooltip.Trigger>
								{#snippet child({ props: tooltipProps }: { props: any })}
									<button
										{...mergeProps(
											{
												class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
												onclick: handleOpenAsBook
											},
											tooltipProps
										)}
									>
										<BookOpen class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom">打开</Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root delayDuration={400}>
							<Tooltip.Trigger>
								{#snippet child({ props: tooltipProps }: { props: any })}
									<button
										{...mergeProps(
											{
												class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
												onclick: handleOpenInNewTab
											},
											tooltipProps
										)}
									>
										<FolderOpen class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom">打开所在文件夹</Tooltip.Content>
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
										<Play class="h-4 w-4" />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom">用默认软件打开</Tooltip.Content>
						</Tooltip.Root>
					{/if}

					<Tooltip.Root delayDuration={400}>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps }: { props: any })}
								<button
									{...mergeProps(
										{
											class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
											onclick: handleOpenInExplorer
										},
										tooltipProps
									)}
								>
									<ExternalLink class="h-4 w-4" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">在资源管理器中打开</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root delayDuration={400}>
						<Tooltip.Trigger>
							{#snippet child({ props: tooltipProps }: { props: any })}
								<button
									{...mergeProps(
										{
											class: 'hover:bg-accent hover:text-accent-foreground flex h-9 w-9 items-center justify-center rounded-sm transition-colors',
											onclick: handleUndoDelete
										},
										tooltipProps
									)}
								>
									<Undo2 class="h-4 w-4" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">撤回上一次删除</Tooltip.Content>
					</Tooltip.Root>
				</div>

				<div class="bg-border my-1 h-px"></div>

				<!-- 其他操作 -->
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleAddBookmark}
				>
					<Star class="h-4 w-4" />
					<span>添加书签</span>
				</button>
				<button
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
					onclick={handleToggleFolderTreePin}
				>
					<Pin class="h-4 w-4" />
					<span>{isPinnedInFolderTree ? '取消文件树置顶' : '在文件树中置顶'}</span>
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
