<script lang="ts">
	// V2: Migrating to @tanstack/svelte-virtual
	// 性能优化版本：
	// 1. 切换文件夹时立即取消旧任务
	// 2. 使用全局 store 存储滚动位置
	// 3. 缩略图加载按顺序处理
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import type { FsItem } from '$lib/types';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { get } from 'svelte/store';
	import { debounce, throttle, scheduleIdleTask, getAdaptivePerformanceConfig } from '$lib/utils/performance';
	import FileItemCard from './FileItemCard.svelte';
	import { historyStore } from '$lib/stores/history.svelte';
	import { isVideoFile } from '$lib/utils/videoUtils';

	// Props
	const {
		items = [],
		currentPath = '',
		thumbnails = new Map<string, string>(),
		selectedIndex = -1,
		scrollToSelectedToken = 0,
		isCheckMode = false,
		isDeleteMode = false,
		selectedItems = new Set<string>(),
		viewMode = 'list',
		onSelectionChange = (payload: { selectedItems: Set<string> }) => {},
		onSelectedIndexChange = (payload: { index: number }) => {},
		onItemSelect = (payload: { item: FsItem; index: number; multiSelect: boolean }) => {},
		onItemDoubleClick = (payload: { item: FsItem; index: number }) => {}
	}: {
		items?: FsItem[];
		currentPath?: string;
		thumbnails?: Map<string, string>;
		selectedIndex?: number;
		scrollToSelectedToken?: number;
		isCheckMode?: boolean;
		isDeleteMode?: boolean;
		selectedItems?: Set<string>;
		viewMode?: 'list' | 'thumbnails' | 'grid';
		onSelectionChange?: (payload: { selectedItems: Set<string> }) => void;
		onSelectedIndexChange?: (payload: { index: number }) => void;
		onItemSelect?: (payload: { item: FsItem; index: number; multiSelect: boolean }) => void;
		onItemDoubleClick?: (payload: { item: FsItem; index: number }) => void;
	} = $props();

	const dispatch = createEventDispatcher();

	// --- State ---
	let container: HTMLDivElement | undefined = $state();
	let viewportWidth = $state(800);
	let resizeObserver: ResizeObserver | null = null;
	let lastPath = $state('');
	let lastScrollTime = 0;

	// --- Performance ---
	const perfConfig = getAdaptivePerformanceConfig();
	const scrollThrottleDelay = perfConfig.virtualScroll.throttleDelay;

	// --- 全局 store 滚动位置管理 ---
	function getScrollPosition(path: string): number {
		return fileBrowserStore.getState().scrollPositions[path] ?? 0;
	}

	function setScrollPosition(path: string, position: number): void {
		const current = fileBrowserStore.getState().scrollPositions;
		fileBrowserStore.setScrollPositions({ ...current, [path]: position });
	}

	// --- TanStack Virtual ---
	const itemHeight = $derived(viewMode === 'list' ? 96 : 240);
	const columns = $derived(viewMode === 'list' ? 1 : viewportWidth >= 640 ? 3 : 2);

	const virtualizer = createVirtualizer({
		get count() {
			return items.length;
		},
		getScrollElement: () => container ?? null,
		estimateSize: () => itemHeight,
		overscan: 5,
		get lanes() {
			return columns;
		}
	});

	const virtualItems = $derived($virtualizer.getVirtualItems());

	// --- Effects ---

	

	// Scroll to selected item
	let lastScrollToken = -1;
	$effect(() => {
		if (!container) return;
		if (scrollToSelectedToken > lastScrollToken) {
			lastScrollToken = scrollToSelectedToken;
			if (selectedIndex >= 0) {
				get(virtualizer).scrollToIndex(selectedIndex, { align: 'center', behavior: 'smooth' });
			}
		}
	});

	// 缩略图加载工具函数
	type ThumbnailPriority = 'normal' | 'immediate' | 'high';
	function enqueueVisible(path: string, itemsToLoad: FsItem[], options?: { priority?: ThumbnailPriority }): void {
		const priority: ThumbnailPriority = options?.priority || 'normal';
		itemsToLoad.forEach((item) => {
			const isArchive =
				item.name.endsWith('.zip') ||
				item.name.endsWith('.cbz') ||
				item.name.endsWith('.rar') ||
				item.name.endsWith('.cbr');
			const isVideo = isVideoFile(item.path);

			if (item.isDir) {
				// 文件夹：只从数据库加载，不主动查找
				thumbnailManager.getThumbnail(item.path, undefined, false, priority).then((dataUrl) => {
					if (dataUrl) {
						const key = toRelativeKey(item.path);
						fileBrowserStore.addThumbnail(key, dataUrl);
					}
				});
			} else if (item.isImage || isArchive || isVideo) {
				thumbnailManager.getThumbnail(item.path, undefined, isArchive, priority);
			}
		});
	}

	// --- 实时缩略图加载 ---
	const MAX_THUMBNAILS_PER_BATCH = 30;
	let pendingThumbnailPaths = new Set<string>();
	let lastLoadedRange = { start: -1, end: -1 };
	let currentLoadEpoch = 0;

	// 加载可见项目的缩略图
	function loadVisibleThumbnails() {
		if (!currentPath || items.length === 0 || virtualItems.length === 0) return;

		const startIndex = virtualItems[0].index;
		const endIndex = virtualItems[virtualItems.length - 1].index;

		// 如果范围没有变化，不重复加载
		if (startIndex === lastLoadedRange.start && endIndex === lastLoadedRange.end) {
			return;
		}

		// 更新范围并增加 epoch（取消旧任务）
		lastLoadedRange = { start: startIndex, end: endIndex };
		currentLoadEpoch++;
		const loadEpoch = currentLoadEpoch;

		// 取消之前的缩略图任务
		thumbnailManager.cancelAllTasks();
		pendingThumbnailPaths.clear();

		// 只处理可见范围内的项目
		const visibleItems = items.slice(startIndex, endIndex + 1);

		// 过滤需要缩略图的项目
		const thumbnailItems = visibleItems.filter(
			(item) =>
				item.isDir ||
				item.isImage ||
				isVideoFile(item.path) ||
				item.name.endsWith('.zip') ||
				item.name.endsWith('.cbz') ||
				item.name.endsWith('.rar') ||
				item.name.endsWith('.cbr')
		);

		// 过滤已有缩略图的项目
		const needThumbnails = thumbnailItems.filter((item) => {
			const key = toRelativeKey(item.path);
			return !thumbnails.has(key);
		});

		if (needThumbnails.length === 0) return;

		// 限制每批次加载数量
		const batchItems = needThumbnails.slice(0, MAX_THUMBNAILS_PER_BATCH);

		// 优化：使用 Map 避免 O(n²) 的 findIndex
		const pathToIndex = new Map<string, number>();
		for (let i = startIndex; i <= endIndex && i < items.length; i++) {
			pathToIndex.set(items[i].path, i);
		}

		// 按距离中心排序
		const centerIndex = Math.floor((startIndex + endIndex) / 2);
		const itemsWithOrder = batchItems.map((item) => {
			const itemIndex = pathToIndex.get(item.path) ?? startIndex;
			const distanceFromCenter = Math.abs(itemIndex - centerIndex);
			return { item, distanceFromCenter, itemIndex };
		});
		itemsWithOrder.sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);

		const paths = itemsWithOrder.map(({ item }) => item.path);
		paths.forEach(p => pendingThumbnailPaths.add(p));

		console.debug(`[VirtualizedFileListV2] 加载缩略图: ${paths.length} 个, 范围 ${startIndex}-${endIndex}`);

		scheduleIdleTask(async () => {
			// 检查是否已被取消
			if (loadEpoch !== currentLoadEpoch) return;

			try {
				await thumbnailManager.batchLoadFromDb(paths);
			} catch (err) {
				console.debug('批量加载缩略图失败:', err);
			}

			// 检查哪些还需要生成
			setTimeout(() => {
				if (loadEpoch !== currentLoadEpoch) return;

				itemsWithOrder.forEach(({ item }, index) => {
					const key = toRelativeKey(item.path);
					if (!thumbnails.has(key)) {
						setTimeout(() => {
							if (loadEpoch === currentLoadEpoch) {
								enqueueVisible(currentPath, [item], { priority: 'immediate' });
							}
						}, index * 5);
					}
					pendingThumbnailPaths.delete(item.path);
				});
			}, 50);
		});
	}

	// 可见范围变化时加载缩略图（防抖）
	const handleVisibleRangeChange = debounce(() => {
		loadVisibleThumbnails();
	}, 50);

	// 监听路径变化，切换文件夹时立即取消旧任务并恢复滚动位置
	$effect(() => {
		if (!container) return;

		if (!currentPath) {
			lastPath = '';
			return;
		}

		if (currentPath !== lastPath) {
			// 切换文件夹时，立即取消旧目录的缩略图任务
			thumbnailManager.setCurrentDirectory(currentPath);

			// 从全局 store 恢复滚动位置
			const savedTop = getScrollPosition(currentPath);
			console.debug('[VirtualizedFileListV2] restore scroll from store', {
				path: currentPath,
				savedTop
			});

			requestAnimationFrame(() => {
				if (!container) return;
				container.scrollTo({ top: savedTop, behavior: 'auto' });
			});

			lastPath = currentPath;
		}
	});

	// 监听可见范围变化
	$effect(() => {
		handleVisibleRangeChange();
	});

	// --- Lifecycle ---
	onMount(() => {
		if (container) {
			viewportWidth = container.clientWidth;
			resizeObserver = new ResizeObserver(() => {
				if (container) {
					viewportWidth = container.clientWidth;
				}
			});
			resizeObserver.observe(container);
		}
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
	});

	// --- Event Handlers ---

	// 滚动处理（节流 + 保存位置到全局 store + 实时加载缩略图）
	const handleScroll = throttle(() => {
		if (!container) return;
		const scrollTop = container.scrollTop;

		// 更新预测性加载器的滚动位置
		const startIndex = virtualItems[0]?.index ?? 0;
		thumbnailManager.updateScroll(scrollTop, 0, startIndex, items.length);

		// 保存滚动位置到全局 store
		if (currentPath) {
			setScrollPosition(currentPath, scrollTop);
		}

		// 实时加载可见区域缩略图
		loadVisibleThumbnails();
	}, 50); // 50ms 节流

	function handleItemClick(item: FsItem, index: number) {
		onItemSelect({ item, index, multiSelect: false });
		dispatch('itemClick', { item, index });
		dispatch('itemSelect', { item, index, multiSelect: false });
	}

	function handleItemContextMenu(event: MouseEvent, item: FsItem) {
		dispatch('itemContextMenu', { event, item });
	}

	function handleItemDoubleClick(item: FsItem, index: number) {
		onItemDoubleClick({ item, index });
	}

	function toggleItemSelection(path: string) {
		const next = new Set(selectedItems);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		onSelectionChange({ selectedItems: next });
		dispatch('selectionChange', { selectedItems: next });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (items.length === 0) return;
		let nextIndex = selectedIndex;

		const nav = (delta: number) => {
			e.preventDefault();
			let next = selectedIndex + delta;
			next = Math.max(0, Math.min(items.length - 1, next));
			if (next !== selectedIndex) {
				onSelectedIndexChange({ index: next });
				dispatch('selectedIndexChange', { index: next });
				get(virtualizer).scrollToIndex(next, { align: 'auto', behavior: 'smooth' });
			}
		};

		switch (e.key) {
			case 'ArrowDown':
				nav(columns);
				break;
			case 'ArrowUp':
				nav(-columns);
				break;
			case 'ArrowRight':
				nav(1);
				break;
			case 'ArrowLeft':
				nav(-1);
				break;
			case 'Home':
				e.preventDefault();
				if (selectedIndex !== 0) {
					onSelectedIndexChange({ index: 0 });
					get(virtualizer).scrollToIndex(0, { align: 'start', behavior: 'smooth' });
				}
				break;
			case 'End':
				e.preventDefault();
				const last = items.length - 1;
				if (selectedIndex !== last) {
					onSelectedIndexChange({ index: last });
					get(virtualizer).scrollToIndex(last, { align: 'end', behavior: 'smooth' });
				}
				break;
			default:
				return;
		}
	}

	// --- Utils ---
	function toRelativeKey(path: string): string {
		return path.replace(/\\/g, '/');
	}

	

	export function isIndexVisible(index: number): boolean {
		if (!container || index < 0 || index >= items.length) return false;
		// A simple check if the index is within the range of rendered virtual items
		const firstVisible = virtualItems[0]?.index;
		const lastVisible = virtualItems[virtualItems.length - 1]?.index;
		if (firstVisible === undefined || lastVisible === undefined) return false;
		return index >= firstVisible && index <= lastVisible;
	}
</script>

<div
	bind:this={container}
	class="virtual-list-container flex-1 overflow-y-auto focus:outline-none"
	tabindex="0"
	role="listbox"
	aria-label="文件列表"
	onscroll={handleScroll}
	onkeydown={handleKeydown}
>
	<div style="height: {$virtualizer.getTotalSize()}px; position: relative; width: 100%;">
		{#each virtualItems as virtualItem (items[virtualItem.index].path)}
			{@const item = items[virtualItem.index]}
			{@const isSelected = selectedIndex === virtualItem.index}
			{@const isChecked = selectedItems.has(item.path)}
			{@const historyEntry = historyStore.findByPath(item.path)}
			<div
				style="
          position: absolute;
          top: 0;
          left: 0;
          width: {100 / columns}%;
          height: {itemHeight}px;
          transform: translate({virtualItem.lane * 100}%, {virtualItem.start}px);
          padding: 4px; /* Add some padding for grid gap */
        "
			>
				<FileItemCard
					{item}
					thumbnail={thumbnails.get(toRelativeKey(item.path))}
					viewMode={viewMode === 'thumbnails' ? 'grid' : viewMode}
					{isSelected}
					{isChecked}
					{isCheckMode}
					{isDeleteMode}
					showReadMark={!!historyEntry}
					showBookmarkMark={true}
					showSizeAndModified={true}
					currentPage={historyEntry?.currentPage}
					totalPages={historyEntry?.totalPages}
					timestamp={item.modified ? item.modified * 1000 : undefined}
					onClick={() => handleItemClick(item, virtualItem.index)}
					onDoubleClick={() => handleItemDoubleClick(item, virtualItem.index)}
					onContextMenu={(e) => handleItemContextMenu(e, item)}
					onToggleSelection={() => toggleItemSelection(item.path)}
					onDelete={() => dispatch('deleteItem', { item })}
				/>
			</div>
		{/each}
	</div>
</div>

<style>
	.virtual-list-container {
		height: 100%;
		overflow-y: auto;
	}
</style>
