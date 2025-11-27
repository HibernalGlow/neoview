<script lang="ts">
	/**
	 * VirtualizedInlineTree - 虚拟化文件树组件
	 * 使用 TanStack Virtual 实现虚拟滚动
	 * 使用 IntersectionObserver 实现缩略图懒加载
	 */
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import type { FsItem } from '$lib/types';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { debounce } from '$lib/utils/performance';
	import FileItemCard from './FileItemCard.svelte';
	import { ChevronDown, ChevronRight, RefreshCw } from '@lucide/svelte';

	// 扩展的树项目类型
	type InlineTreeDisplayItem = FsItem & {
		__depth: number;
		__parentPath?: string;
	};

	type InlineTreeNodeState = {
		expanded: boolean;
		loading: boolean;
		children: FsItem[];
		error?: string;
	};

	// Props
	const {
		items = [],
		inlineTreeState = {},
		thumbnails = new Map<string, string>(),
		selectedItems = new Set<string>(),
		isCheckMode = false,
		isDeleteMode = false,
		isPenetrateMode = false,
		onToggleNode = async (_item: FsItem) => {},
		onItemClick = async (_item: FsItem) => {},
		onItemContextMenu = (_e: MouseEvent, _item: FsItem) => {},
		onToggleSelection = (_path: string) => {},
		onOpenAsBook = (_item: FsItem) => {},
		onScroll = (_scrollTop: number) => {},
		initialScrollTop = 0
	}: {
		items: InlineTreeDisplayItem[];
		inlineTreeState: Record<string, InlineTreeNodeState>;
		thumbnails: Map<string, string>;
		selectedItems: Set<string>;
		isCheckMode: boolean;
		isDeleteMode: boolean;
		isPenetrateMode: boolean;
		onToggleNode: (item: FsItem) => Promise<void>;
		onItemClick: (item: FsItem) => Promise<void>;
		onItemContextMenu: (e: MouseEvent, item: FsItem) => void;
		onToggleSelection: (path: string) => void;
		onOpenAsBook: (item: FsItem) => void;
		onScroll: (scrollTop: number) => void;
		initialScrollTop: number;
	} = $props();

	const dispatch = createEventDispatcher();

	// --- State ---
	let container: HTMLDivElement | undefined = $state();
	let resizeObserver: ResizeObserver | null = null;

	// --- 缩略图懒加载 ---
	let visiblePaths = new Set<string>(); // 当前可见的路径
	let intersectionObserver: IntersectionObserver | null = null;
	let observedElements = new Map<string, HTMLElement>(); // 路径 -> DOM 元素

	// --- TanStack Virtual ---
	const ITEM_HEIGHT = 96; // 每个项目的高度
	const OVERSCAN = 5;

	const virtualizer = createVirtualizer({
		get count() {
			return items.length;
		},
		getScrollElement: () => container ?? null,
		estimateSize: () => ITEM_HEIGHT,
		overscan: OVERSCAN
	});

	const virtualItems = $derived($virtualizer.getVirtualItems());

	// --- 工具函数 ---
	function toRelativeKey(path: string): string {
		return path.replace(/\\/g, '/');
	}

	// --- IntersectionObserver 懒加载 ---
	function setupIntersectionObserver() {
		if (intersectionObserver) {
			intersectionObserver.disconnect();
		}

		intersectionObserver = new IntersectionObserver(
			(entries) => {
				let changed = false;
				entries.forEach((entry) => {
					const path = entry.target.getAttribute('data-path');
					if (!path) return;

					if (entry.isIntersecting) {
						if (!visiblePaths.has(path)) {
							visiblePaths.add(path);
							changed = true;
						}
					} else {
						if (visiblePaths.has(path)) {
							visiblePaths.delete(path);
							changed = true;
						}
					}
				});

				if (changed) {
					loadVisibleThumbnails();
				}
			},
			{
				root: container,
				rootMargin: '100px 0px', // 提前 100px 开始加载
				threshold: 0
			}
		);
	}

	// Svelte action 用于观察元素
	function observeAction(element: HTMLElement, path: string) {
		if (intersectionObserver) {
			observedElements.set(path, element);
			intersectionObserver.observe(element);
		}

		return {
			destroy() {
				if (intersectionObserver) {
					intersectionObserver.unobserve(element);
					observedElements.delete(path);
				}
			}
		};
	}

	// --- 滚动停止检测 ---
	let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
	let isScrolling = false;
	let lastLoadedRange = { start: -1, end: -1 }; // 上次加载的范围
	let currentLoadEpoch = 0; // 用于取消旧的加载任务

	// 滚动停止后加载可见区域缩略图
	function onScrollStop() {
		isScrolling = false;
		loadVisibleThumbnails();
	}

	// 加载可见项目的缩略图
	function loadVisibleThumbnails() {
		if (visiblePaths.size === 0) return;

		// 获取当前可见范围
		const visibleIndices = Array.from(visiblePaths).map(path => 
			items.findIndex(i => i.path === path)
		).filter(i => i >= 0).sort((a, b) => a - b);

		if (visibleIndices.length === 0) return;

		const currentStart = visibleIndices[0];
		const currentEnd = visibleIndices[visibleIndices.length - 1];

		// 如果范围没有变化，不重复加载
		if (currentStart === lastLoadedRange.start && currentEnd === lastLoadedRange.end) {
			return;
		}

		// 更新范围并增加 epoch（取消旧任务）
		lastLoadedRange = { start: currentStart, end: currentEnd };
		currentLoadEpoch++;
		const loadEpoch = currentLoadEpoch;

		// 取消之前的缩略图任务
		thumbnailManager.cancelAllTasks();

		// 找出需要加载缩略图的项目
		const pathsToLoad: string[] = [];
		visiblePaths.forEach((path) => {
			const key = toRelativeKey(path);
			if (!thumbnails.has(key)) {
				pathsToLoad.push(path);
			}
		});

		if (pathsToLoad.length === 0) return;

		console.debug(`[VirtualizedInlineTree] 加载缩略图: ${pathsToLoad.length} 个, 范围 ${currentStart}-${currentEnd}`);

		// 异步加载，不阻塞 UI
		requestIdleCallback(() => {
			// 检查是否已被取消
			if (loadEpoch !== currentLoadEpoch) return;

			pathsToLoad.forEach((path) => {
				const item = items.find((i) => i.path === path);
				if (!item) return;

				const isArchive =
					item.name.endsWith('.zip') ||
					item.name.endsWith('.cbz') ||
					item.name.endsWith('.rar') ||
					item.name.endsWith('.cbr');

				if (item.isDir) {
					thumbnailManager.getThumbnail(path, undefined, false, 'normal').then((dataUrl) => {
						if (dataUrl && loadEpoch === currentLoadEpoch) {
							fileBrowserStore.addThumbnail(toRelativeKey(path), dataUrl);
						}
					});
				} else if (item.isImage || isArchive) {
					thumbnailManager.getThumbnail(path, undefined, isArchive, 'normal');
				}
			});
		});
	}

	// --- 滚动处理 ---
	function handleScroll() {
		if (!container) return;
		onScroll(container.scrollTop);

		// 标记正在滚动
		isScrolling = true;

		// 清除之前的定时器
		if (scrollTimeout) {
			clearTimeout(scrollTimeout);
		}

		// 滚动停止 150ms 后触发加载
		scrollTimeout = setTimeout(onScrollStop, 150);
	}

	// --- 生命周期 ---
	onMount(() => {
		setupIntersectionObserver();

		if (container) {
			// 恢复滚动位置
			if (initialScrollTop > 0) {
				container.scrollTo({ top: initialScrollTop, behavior: 'auto' });
			}

			resizeObserver = new ResizeObserver(() => {
				// 触发重新计算
			});
			resizeObserver.observe(container);
		}
	});

	onDestroy(() => {
		intersectionObserver?.disconnect();
		resizeObserver?.disconnect();
		observedElements.clear();
		visiblePaths.clear();
	});

	// 当 items 变化时，清理状态
	$effect(() => {
		items; // 依赖 items
		// 清理旧的观察（action 的 destroy 会自动处理）
		visiblePaths.clear();
	});
</script>

<div
	bind:this={container}
	class="virtual-tree-container h-full overflow-y-auto focus:outline-none"
	role="tree"
	onscroll={handleScroll}
>
	{#if items.length === 0}
		<div class="text-muted-foreground py-6 text-center text-sm">暂无可显示的条目</div>
	{:else}
		<div style="height: {$virtualizer.getTotalSize()}px; position: relative; width: 100%;">
			{#each virtualItems as virtualItem (items[virtualItem.index].path + ':' + virtualItem.index)}
				{@const item = items[virtualItem.index]}
				{@const indent = item.__depth * 16}
				{@const nodeState = inlineTreeState[item.path]}
				<div
					class="tree-item absolute left-0 top-0 w-full px-2"
					style="height: {ITEM_HEIGHT}px; transform: translateY({virtualItem.start}px);"
					data-path={item.path}
					use:observeAction={item.path}
				>
					<div class="flex h-full items-stretch" role="treeitem" aria-selected={selectedItems.has(item.path)} aria-expanded={item.isDir ? !!nodeState?.expanded : undefined}>
						<div class="flex items-center" style="margin-left: {indent}px;">
							{#if item.isDir}
								{#if nodeState?.loading}
									<RefreshCw class="mr-1 h-4 w-4 animate-spin text-muted-foreground" />
								{:else}
									<button
										class="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
										type="button"
										onclick={(e) => {
											e.stopPropagation();
											onToggleNode(item);
										}}
										title={nodeState?.expanded ? '收起子项' : '展开子项'}
									>
										{#if nodeState?.expanded}
											<ChevronDown class="h-4 w-4" />
										{:else}
											<ChevronRight class="h-4 w-4" />
										{/if}
									</button>
								{/if}
							{:else}
								<!-- 对齐占位 -->
								<div class="mr-1 h-6 w-6"></div>
							{/if}
						</div>
						<div class="flex-1">
							<FileItemCard
								{item}
								thumbnail={thumbnails.get(toRelativeKey(item.path))}
								viewMode="list"
								isSelected={false}
								isChecked={selectedItems.has(item.path)}
								{isCheckMode}
								{isDeleteMode}
								showReadMark={false}
								showBookmarkMark={true}
								showSizeAndModified={true}
								timestamp={item.modified ? item.modified * 1000 : undefined}
								onClick={() => onItemClick(item)}
								onContextMenu={(e) => onItemContextMenu(e, item)}
								onToggleSelection={() => onToggleSelection(item.path)}
								onOpenAsBook={item.isDir ? () => onOpenAsBook(item) : undefined}
							/>
						</div>
					</div>
					{#if nodeState?.error}
						<div
							class="text-destructive bg-destructive/10 px-5 py-1 text-xs"
							style="margin-left: {indent + 32}px;"
						>
							{nodeState.error}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.virtual-tree-container {
		contain: strict;
	}

	.tree-item {
		contain: layout style;
	}
</style>
