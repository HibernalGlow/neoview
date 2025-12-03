<script lang="ts">
	// V2: Migrating to @tanstack/svelte-virtual
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import type { FsItem } from '$lib/types';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { get } from 'svelte/store';
	import { debounce, scheduleIdleTask, getAdaptivePerformanceConfig } from '$lib/utils/performance';
	import FileItemCard from './FileItemCard.svelte';
	import ListSlider from './ListSlider.svelte';
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
		viewMode?: 'list' | 'thumbnails' | 'grid' | 'content' | 'banner' | 'thumbnail';
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

	// 滚动位置缓存
	const scrollPositions = new Map<string, number>();
	
	// 滚动进度（用于 ListSlider）
	let scrollProgress = $state(0);

	// --- Performance ---
	const perfConfig = getAdaptivePerformanceConfig();

	// --- TanStack Virtual ---
	const itemHeight = $derived(viewMode === 'list' ? 96 : 240);
	const columns = $derived(viewMode === 'list' ? 1 : viewportWidth >= 640 ? 3 : 2);
	const rowCount = $derived(Math.ceil(items.length / columns));

	// 是否显示侧边滑块（至少5个项目时显示）
	const showSlider = $derived(items.length > 5);

	// TanStack Virtual - 按行虚拟化（支持动态高度）
	const virtualizer = createVirtualizer({
		get count() {
			return rowCount;
		},
		getScrollElement: () => container ?? null,
		estimateSize: () => itemHeight,
		overscan: 3,
		// 启用动态测量
		measureElement: (element) => {
			return element.getBoundingClientRect().height;
		}
	});

	// 获取虚拟项目列表（使用 $ 访问 store 值）
	const virtualItems = $derived($virtualizer.getVirtualItems());

	// Svelte 5 兼容性修复：手动触发 virtualizer 更新
	// 参考: https://github.com/TanStack/virtual/issues/866
	let mounted = $state(false);
	
	$effect(() => {
		if (container) {
			mounted = true;
		}
	});
	
	$effect(() => {
		if (mounted && container) {
			// 强制触发更新
			$virtualizer._willUpdate();
		}
	});

	// --- Effects ---

	

	// Scroll to selected item
	let lastScrollToken = -1;
	$effect(() => {
		if (!container) return;
		if (scrollToSelectedToken > lastScrollToken) {
			lastScrollToken = scrollToSelectedToken;
			if (selectedIndex >= 0) {
				$virtualizer.scrollToIndex(selectedIndex, { align: 'center', behavior: 'smooth' });
			}
		}
	});

	// Thumbnail loading for visible items - 优化版
	const handleVisibleRangeChange = debounce(() => {
		if (!currentPath || items.length === 0 || virtualItems.length === 0) return;

		const startIndex = virtualItems[0].index;
		const endIndex = virtualItems[virtualItems.length - 1].index;
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
				item.name.endsWith('.cbr') ||
				item.name.endsWith('.7z') ||
				item.name.endsWith('.cb7')
		);

		// 过滤已有缓存的项目
		const needThumbnails = thumbnailItems.filter(
			(item) => !thumbnails.has(toRelativeKey(item.path))
		);

		if (needThumbnails.length === 0) return;

		const paths = needThumbnails.map((item) => item.path);
		
		// 设置当前目录优先级
		thumbnailManager.setCurrentDirectory(currentPath);

		// 直接异步处理，无延迟
		(async () => {
			try {
				// 1. 先从数据库批量加载已缓存的
				const loaded = await thumbnailManager.batchLoadFromDb(paths);
				
				// 2. 找出未命中的，直接并行生成（无延迟）
				const notLoaded = paths.filter(p => !loaded.has(p));
				if (notLoaded.length > 0) {
					thumbnailManager.batchGenerate(notLoaded);
				}
			} catch (err) {
				console.debug('批量加载缩略图失败:', err);
			}
		})();
	}, 50); // 50ms debounce，更快响应

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

	function handleScroll() {
		if (!container) return;
		const scrollTop = container.scrollTop;
		if (currentPath) {
			scrollPositions.set(currentPath, scrollTop);
		}
		// 更新滚动进度
		const maxScroll = container.scrollHeight - container.clientHeight;
		scrollProgress = maxScroll > 0 ? scrollTop / maxScroll : 0;
	}

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
				$virtualizer.scrollToIndex(next, { align: 'auto', behavior: 'smooth' });
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
					$virtualizer.scrollToIndex(0, { align: 'start', behavior: 'smooth' });
				}
				break;
			case 'End':
				e.preventDefault();
				const last = items.length - 1;
				if (selectedIndex !== last) {
					onSelectedIndexChange({ index: last });
					$virtualizer.scrollToIndex(last, { align: 'end', behavior: 'smooth' });
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

	// 动态测量行高度的 action
	function measureRow(node: HTMLElement) {
		const index = parseInt(node.dataset.index || '0', 10);
		// 使用 ResizeObserver 监测高度变化
		const observer = new ResizeObserver(() => {
			$virtualizer.measureElement(node);
		});
		observer.observe(node);
		
		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

	

	export function isIndexVisible(index: number): boolean {
		if (!container || index < 0 || index >= items.length) return false;
		// A simple check if the index is within the range of rendered virtual items
		const firstVisible = virtualItems[0]?.index;
		const lastVisible = virtualItems[virtualItems.length - 1]?.index;
		if (firstVisible === undefined || lastVisible === undefined) return false;
		return index >= firstVisible && index <= lastVisible;
	}

	// ListSlider 滑动跳转
	function handleSliderChange(index: number) {
		if (index < 0 || index >= items.length) return;
		onSelectedIndexChange({ index });
		dispatch('selectedIndexChange', { index });
		const rowIndex = Math.floor(index / columns);
		$virtualizer.scrollToIndex(rowIndex, { align: 'start', behavior: 'auto' });
	}

	// 计算可见范围（用于 ListSlider）
	const visibleStart = $derived(virtualItems.length > 0 ? virtualItems[0].index * columns : 0);
	const visibleEnd = $derived(virtualItems.length > 0 ? Math.min((virtualItems[virtualItems.length - 1].index + 1) * columns - 1, items.length - 1) : 0);
</script>

<div class="flex h-full w-full">
	<!-- 主列表区域 -->
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
		{#each virtualItems as virtualRow (virtualRow.index)}
			<!-- 每行渲染多列 -->
			<div
				data-index={virtualRow.index}
				use:measureRow
				style="
					position: absolute;
					top: 0;
					left: 0;
					width: 100%;
					transform: translateY({virtualRow.start}px);
					display: flex;
				"
			>
				{#each Array(columns) as _, colIndex}
					{@const itemIndex = virtualRow.index * columns + colIndex}
					{#if itemIndex < items.length}
						{@const item = items[itemIndex]}
						{@const isSelected = selectedIndex === itemIndex}
						{@const isChecked = selectedItems.has(item.path)}
						{@const historyEntry = historyStore.findByPath(item.path)}
						<div style="flex: 1; padding: 4px; box-sizing: border-box;">
							<FileItemCard
								{item}
								thumbnail={thumbnails.get(toRelativeKey(item.path))}
								viewMode={viewMode === 'thumbnails' || viewMode === 'grid' ? 'thumbnail' : viewMode}
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
								onClick={() => handleItemClick(item, itemIndex)}
								onDoubleClick={() => handleItemDoubleClick(item, itemIndex)}
								onContextMenu={(e) => handleItemContextMenu(e, item)}
								onToggleSelection={() => toggleItemSelection(item.path)}
								onDelete={() => dispatch('deleteItem', { item })}
							/>
						</div>
					{/if}
				{/each}
				</div>
		{/each}
	</div>
	</div>

	<!-- 侧边进度条滑块 -->
	{#if showSlider}
		<div class="h-full">
			<ListSlider
				totalItems={items.length}
				currentIndex={selectedIndex >= 0 ? selectedIndex : 0}
				{visibleStart}
				{visibleEnd}
				{scrollProgress}
				onJumpToIndex={handleSliderChange}
				onScrollToProgress={(progress) => {
					if (container) {
						const maxScroll = container.scrollHeight - container.clientHeight;
						container.scrollTop = progress * maxScroll;
					}
				}}
			/>
		</div>
	{/if}
</div>

<style>
	.virtual-list-container {
		height: 100%;
		overflow-y: auto;
	}
</style>
