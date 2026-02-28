<script lang="ts">
	// V2: Migrating to @tanstack/svelte-virtual
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import type { FsItem } from '$lib/types';
	// V3 缩略图系统（复刻 NeeView 架构）
	import {
		requestVisibleThumbnailsDelta,
		requestVisibleThumbnailsDeltaWithPrefetch,
		hasThumbnail,
		getThumbnailUrl
	} from '$lib/stores/thumbnailStoreV3.svelte';
	// 保留旧的 thumbnailManager 用于兼容
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { get } from 'svelte/store';
	import { debounce, scheduleIdleTask, getAdaptivePerformanceConfig } from '$lib/utils/performance';
	import { notifyFolderSizeNavigation } from '$lib/stores/folderSizeCache.svelte';
	import FileItemCard from './FileItemCard.svelte';
	import ListSlider from './ListSlider.svelte';
	import { unifiedHistoryStore } from '$lib/stores/unifiedHistory.svelte';
	import { isVideoFile } from '$lib/utils/videoUtils';
	import { updateVisibility } from '$lib/stores/visibilityMonitor.svelte';
	import { ChevronUp } from '@lucide/svelte';

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
		thumbnailWidthPercent = 20,
		bannerWidthPercent = 50,
		onSelectionChange = (payload: { selectedItems: Set<string> }) => {},
		onSelectedIndexChange = (payload: { index: number }) => {},
		onItemSelect = (payload: { item: FsItem; index: number; multiSelect: boolean }) => {},
		onItemDoubleClick = (payload: { item: FsItem; index: number }) => {},
		onEmptyDoubleClick = () => {},
		onEmptySingleClick = () => {},
		onBackButtonClick = () => {},
		showBackButton = false,
		showFullPath = false
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
		thumbnailWidthPercent?: number;
		bannerWidthPercent?: number;
		onSelectionChange?: (payload: { selectedItems: Set<string> }) => void;
		onSelectedIndexChange?: (payload: { index: number }) => void;
		onItemSelect?: (payload: { item: FsItem; index: number; multiSelect: boolean }) => void;
		onItemDoubleClick?: (payload: { item: FsItem; index: number }) => void;
		onEmptyDoubleClick?: () => void;
		onEmptySingleClick?: () => void;
		onBackButtonClick?: () => void;
		showBackButton?: boolean;
		showFullPath?: boolean;
	} = $props();

	const dispatch = createEventDispatcher();

	// --- State ---
	let container: HTMLDivElement | undefined = $state();
	let viewportWidth = $state(800);
	let resizeObserver: ResizeObserver | null = null;
	let visibleRangeRaf: number | null = null;
	let lastVisibleRequestKey = $state('');
	let stablePrefetchTimer: ReturnType<typeof setTimeout> | null = null;

	const ARCHIVE_REGEX = /\.(zip|cbz|rar|cbr|7z|cb7)$/i;

	// 滚动位置缓存
	const scrollPositions = new Map<string, number>();

	// 滚动进度（用于 ListSlider）
	let scrollProgress = $state(0);

	// 滚动方向检测
	let lastScrollTop = 0;
	let lastScrollTime = 0;

	// --- Performance ---
	const perfConfig = getAdaptivePerformanceConfig();

	// --- TanStack Virtual ---
	const itemHeight = $derived(viewMode === 'list' ? 96 : 240);
	
	// 根据视图模式选择使用的宽度百分比
	// banner 视图使用 bannerWidthPercent，其他网格视图使用 thumbnailWidthPercent
	const effectiveWidthPercent = $derived(viewMode === 'banner' ? bannerWidthPercent : thumbnailWidthPercent);
	
	// 列数根据宽度百分比动态计算
	// 例如 20% = 5 列，50% = 2 列，100% = 1 列
	const columns = $derived.by(() => {
		if (viewMode === 'list') return 1;
		const cols = Math.max(1, Math.floor(100 / effectiveWidthPercent));
		return cols;
	});
	const rowCount = $derived(Math.ceil(items.length / columns));

	// 缩略图尺寸（像素）- 根据百分比计算
	// 10% -> 48px, 20% -> 80px, 33% -> 120px, 50% -> 160px
	const thumbnailSize = $derived.by(() => {
		// 基础尺寸 48px 对应 10%，每增加 1% 增加约 3px
		return Math.round(48 + (thumbnailWidthPercent - 10) * 3);
	});

	// 是否显示侧边滑块（至少5个项目时显示）
	const showSlider = $derived(items.length > 5);

	// TanStack Virtual - 按行虚拟化（支持动态高度）
	// 优化：增加 overscan 从 3 到 5，快速滚动时提前加载更多
	const virtualizer = createVirtualizer({
		get count() {
			return rowCount;
		},
		getScrollElement: () => container ?? null,
		estimateSize: (index) => itemHeight,
		overscan: 5, // 增加预加载行数，优化快速滚动体验
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

	// 当列数变化时强制刷新 virtualizer
	$effect(() => {
		// 显式依赖 columns 和 thumbnailWidthPercent
		const _ = columns;
		const __ = thumbnailWidthPercent;
		if (mounted && container) {
			// 强制触发重新测量
			$virtualizer._willUpdate();
		}
	});

	// 追踪上一次的视图模式，用于检测变化
	let lastViewMode = $state(viewMode);
	
	// 当 items 或 viewMode 变化时强制刷新 virtualizer
	$effect(() => {
		// 显式依赖 items.length, rowCount 和 viewMode
		const _ = items.length;
		const __ = rowCount;
		const currentViewMode = viewMode;
		
		if (mounted && container) {
			// 检测视图模式是否变化
			const viewModeChanged = currentViewMode !== lastViewMode;
			
			if (viewModeChanged) {
				// 视图模式变化时，重置测量缓存并滚动到顶部
				lastViewMode = currentViewMode;
				// 重置所有行的测量缓存
				$virtualizer.measure();
				// 滚动到顶部
				container.scrollTop = 0;
			}
			
			// 强制触发重新测量
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
				// 需要将项目索引转换为行索引
				const rowIndex = Math.floor(selectedIndex / columns);
				$virtualizer.scrollToIndex(rowIndex, { align: 'center', behavior: 'smooth' });
			}
		}
	});

	// Thumbnail loading for visible items - V3 版本
	// 复刻 NeeView 架构：后端为主，前端只通知可见区域
	// 优化：增加 debounce 到 32ms（2帧），减少快速滚动时的请求频率
	// 一次遍历同时生成 路径数组（供预取）和 Set（供 O(1) 可见区域过滤）
	const thumbnailCandidates = $derived.by(() => {
		const paths: string[] = [];
		const set = new Set<string>();
		for (const item of items) {
			if (!item) continue;
			const effectivePath = item.targetPath || item.path;
			if (
				item.isDir ||
				item.isImage ||
				isVideoFile(effectivePath) ||
				ARCHIVE_REGEX.test(effectivePath.toLowerCase())
			) {
				paths.push(item.path);
				set.add(item.path);
			}
		}
		return { paths, set };
	});

	// 保留原有名称以兼容 scheduleStablePrefetch 调用（zero-cost，只是别名）
	const thumbnailCandidatePaths = $derived(thumbnailCandidates.paths);
	const thumbnailCandidateSet = $derived(thumbnailCandidates.set);

	function collectVisiblePathsCenterFirst(startIndex: number, endIndex: number): string[] {
		const center = Math.floor((startIndex + endIndex) / 2);
		const result: string[] = [];
		const seen = new Set<string>();

		for (let offset = 0; offset <= endIndex - startIndex; offset += 1) {
			const left = center - offset;
			const right = center + offset;

			if (left >= startIndex) {
				const item = items[left];
				if (item && thumbnailCandidateSet.has(item.path) && !seen.has(item.path)) {
					seen.add(item.path);
					result.push(item.path);
				}
			}

			if (right <= endIndex && right !== left) {
				const item = items[right];
				if (item && thumbnailCandidateSet.has(item.path) && !seen.has(item.path)) {
					seen.add(item.path);
					result.push(item.path);
				}
			}
		}

		return result;
	}

	function scheduleStablePrefetch(visiblePaths: string[]) {
		if (stablePrefetchTimer) {
			clearTimeout(stablePrefetchTimer);
		}

		stablePrefetchTimer = setTimeout(() => {
			stablePrefetchTimer = null;
			scheduleIdleTask(() => {
				void requestVisibleThumbnailsDeltaWithPrefetch(
					visiblePaths,
					thumbnailCandidatePaths,
					currentPath
				);
			}, 500);
		}, 180);
	}

	const handleVisibleRangeChange = debounce(() => {
		if (!currentPath || items.length === 0 || virtualItems.length === 0) return;

		// 计算可见范围（按项目索引，考虑多列）
		const startRowIndex = virtualItems[0].index;
		const endRowIndex = virtualItems[virtualItems.length - 1].index;
		const startIndex = startRowIndex * columns;
		const endIndex = Math.min((endRowIndex + 1) * columns - 1, items.length - 1);

		const center = Math.floor((startIndex + endIndex) / 2);
		const visiblePaths = collectVisiblePathsCenterFirst(startIndex, endIndex);
		if (visiblePaths.length === 0) return;

		// V3: 调用后端，后端处理一切
		requestVisibleThumbnailsDelta(
			visiblePaths,
			currentPath,
			center
		);

		// 稳态触发增量预取（滚动停留后）
		scheduleStablePrefetch(visiblePaths);
	}, 24); // 24ms debounce（约1.5帧，兼顾响应与稳定）

	function scheduleVisibleRangeChange() {
		if (visibleRangeRaf !== null) return;
		visibleRangeRaf = requestAnimationFrame(() => {
			visibleRangeRaf = null;
			handleVisibleRangeChange();
		});

		$effect(() => {
			if (!currentPath) return;
			notifyFolderSizeNavigation(currentPath);
		});
	}

	// 当可见范围关键签名变化时触发缩略图加载（避免滚动中的重复触发）
	$effect(() => {
		const firstRow = virtualItems.length > 0 ? virtualItems[0].index : -1;
		const lastRow = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;
		const requestKey = `${currentPath}|${items.length}|${columns}|${firstRow}|${lastRow}|${viewMode}`;
		if (requestKey === lastVisibleRequestKey) return;
		lastVisibleRequestKey = requestKey;
		scheduleVisibleRangeChange();
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
		if (visibleRangeRaf !== null) {
			cancelAnimationFrame(visibleRangeRaf);
			visibleRangeRaf = null;
		}
		if (stablePrefetchTimer) {
			clearTimeout(stablePrefetchTimer);
			stablePrefetchTimer = null;
		}
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

		// 缩略图请求由可见范围签名变化触发，这里不重复触发
	}

	function handleItemClick(item: FsItem, index: number) {
		// 检查勾选模式下点击行为设置
		const state = get(fileBrowserStore);
		const useSelectBehavior = isCheckMode && state.checkModeClickBehavior === 'select';
		const multiSelect = useSelectBehavior;
		
		onItemSelect({ item, index, multiSelect });
		dispatch('itemClick', { item, index });
		dispatch('itemSelect', { item, index, multiSelect });
	}

	function handleItemContextMenu(event: MouseEvent, item: FsItem) {
		dispatch('itemContextMenu', { event, item });
	}

	function handleItemDoubleClick(item: FsItem, index: number) {
		onItemDoubleClick({ item, index });
	}

	// 处理容器双击（空白处双击）
	function handleContainerDoubleClick(e: MouseEvent) {
		// 检查点击目标是否是容器本身或虚拟滚动的空白区域
		const target = e.target as HTMLElement;
		// 如果点击的是容器本身，或者是虚拟滚动的占位 div（没有 data-index 属性的子元素）
		if (target === container || target.classList.contains('virtual-list-container')) {
			onEmptyDoubleClick();
			return;
		}
		// 检查是否点击在项目卡片之外的空白区域
		const clickedOnItem = target.closest('[data-index]') || target.closest('.file-item-card');
		if (!clickedOnItem) {
			onEmptyDoubleClick();
		}
	}

	// 处理容器单击（空白处单击）
	function handleContainerClick(e: MouseEvent) {
		// 检查点击目标是否是容器本身或虚拟滚动的空白区域
		const target = e.target as HTMLElement;
		// 如果点击的是容器本身，或者是虚拟滚动的占位 div
		if (target === container || target.classList.contains('virtual-list-container')) {
			onEmptySingleClick();
			return;
		}
		// 检查是否点击在项目卡片之外的空白区域
		const clickedOnItem = target.closest('[data-index]') || target.closest('.file-item-card');
		if (!clickedOnItem) {
			onEmptySingleClick();
		}
	}

	// 处理勾选框切换 - 通过 onItemSelect 路由以支持链选模式
	function handleToggleSelection(item: FsItem, index: number) {
		// 使用 multiSelect: true 触发链选逻辑
		onItemSelect({ item, index, multiSelect: true });
		dispatch('itemSelect', { item, index, multiSelect: true });
	}

	// [已移除] 键盘导航现由全局键位绑定系统处理，避免冲突

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
	const visibleEnd = $derived(
		virtualItems.length > 0
			? Math.min((virtualItems[virtualItems.length - 1].index + 1) * columns - 1, items.length - 1)
			: 0
	);

	// 可见范围监控（用于 BenchmarkPanel 调试）- 使用 untrack 避免循环
	$effect(() => {
		// 读取依赖
		const info = {
			currentPath,
			totalItems: items.length,
			visibleStart,
			visibleEnd,
			visibleCount: visibleEnd - visibleStart + 1,
			selectedIndex,
			columns,
			rowCount,
			visibleRowStart: virtualItems.length > 0 ? virtualItems[0].index : 0,
			visibleRowEnd: virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : 0,
			scrollProgress
		};
		// 异步更新避免循环
		queueMicrotask(() => updateVisibility(info));
	});
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

		onclick={handleContainerClick}
		ondblclick={handleContainerDoubleClick}
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
							{@const historyEntry = unifiedHistoryStore.findByPath(item.path)}
							<div style="flex: 1; padding: 4px; box-sizing: border-box;">
								<FileItemCard
									{item}
									thumbnail={getThumbnailUrl(item.path) ?? thumbnails.get(toRelativeKey(item.path))}
									viewMode={viewMode === 'thumbnails' || viewMode === 'grid'
										? 'thumbnail'
										: (viewMode as 'list' | 'content' | 'banner' | 'thumbnail')}
									{isSelected}
									{isChecked}
									{isCheckMode}
									{isDeleteMode}
									showReadMark={!!historyEntry}
									showBookmarkMark={true}
									showSizeAndModified={!currentPath.startsWith('virtual://')}
									currentPage={historyEntry?.currentIndex}
									totalPages={historyEntry?.totalItems}
									videoPosition={historyEntry?.videoProgress?.position}
									videoDuration={historyEntry?.videoProgress?.duration}
									timestamp={item.modified ? (item.modified > 1e12 ? item.modified : item.modified * 1000) : undefined}
									{thumbnailSize}
									onClick={() => handleItemClick(item, itemIndex)}
									onDoubleClick={() => handleItemDoubleClick(item, itemIndex)}
									onContextMenu={(e) => handleItemContextMenu(e, item)}
									onToggleSelection={() => handleToggleSelection(item, itemIndex)}
									onDelete={() => dispatch('deleteItem', { item })}
									onOpenAsBook={() => dispatch('openFolderAsBook', { item })}
									onOpenInNewTab={() => dispatch('openInNewTab', { item })}
								/>
								{#if showFullPath}
									<p class="text-[10px] text-muted-foreground/70 truncate px-1" title={item.path}>
										{item.path}
									</p>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/each}
		</div>

		<!-- 空白区域返回按钮 -->
		{#if showBackButton}
			<button
				class="empty-area-back-button flex items-center justify-center gap-2 w-full py-4 mt-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-lg border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
				onclick={(e) => { e.stopPropagation(); onBackButtonClick(); }}
				type="button"
			>
				<ChevronUp class="h-5 w-5" />
				<span class="text-sm">点击返回上级目录</span>
			</button>
		{/if}
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
