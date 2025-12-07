<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import type { FsItem } from '$lib/types';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { Folder, File, Image, FileArchive } from '@lucide/svelte';
	import {
		throttle,
		debounce,
		scheduleIdleTask,
		getAdaptivePerformanceConfig
	} from '$lib/utils/performance';
	import FileItemCard from './FileItemCard.svelte';
	import ListSlider from './ListSlider.svelte';
	import { historyStore } from '$lib/stores/history.svelte';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import { isVideoFile } from '$lib/utils/videoUtils';


	function toRelativeKey(path: string): string {
		return path.replace(/\\/g, '/');
	}

	const {
		items = [],
		currentPath = '',
		thumbnails = new Map(),
		selectedIndex = -1,
		scrollToSelectedToken = 0,
		isCheckMode = false,
		isDeleteMode = false,
		selectedItems = new Set(),
		viewMode = 'list',
		onSelectionChange = (_: { selectedItems: Set<string> }) => {},
		onSelectedIndexChange = (_: { index: number }) => {},
		onItemSelect = (_: { item: FsItem; index: number; multiSelect: boolean }) => {},
		onItemDoubleClick = (_: { item: FsItem; index: number }) => {}
	}: {
		items?: FsItem[];
		currentPath?: string;
		thumbnails?: Map<string, string>;
		selectedIndex?: number;
		isCheckMode?: boolean;
		isDeleteMode?: boolean;
		selectedItems?: Set<string>;
		viewMode?: 'list' | 'content' | 'banner' | 'thumbnail';
		scrollToSelectedToken?: number;
		onSelectionChange?: (payload: { selectedItems: Set<string> }) => void;
		onSelectedIndexChange?: (payload: { index: number }) => void;
		onItemSelect?: (payload: { item: FsItem; index: number; multiSelect: boolean }) => void;
		onItemDoubleClick?: (payload: { item: FsItem; index: number }) => void;
	} = $props();

	const dispatch = createEventDispatcher();

	// 虚拟滚动状态
	let container = $state<HTMLDivElement | undefined>(undefined);
	let viewportHeight = $state(600);
	let viewportWidth = $state(800);
	let scrollTop = $state(0);
	let itemHeight = $state(96);
	let overscan = $state(20); // 增加预渲染数量，提高滚动流畅度

	// 计算可见范围
	let startIndex = $state(0);
	let endIndex = $state(0);
	let totalHeight = $state(0);
	let offsetY = $state(0);

	// 网格布局状态
	let columns = $state(1);

	// 滚动节流
	let scrollTimer: number | null = null;
	let resizeObserver: ResizeObserver | null = null;

	// 性能配置
	const perfConfig = getAdaptivePerformanceConfig();
	// overscan = perfConfig.virtualScroll.overscan; // 使用手动设置的更大值
	let scrollThrottleDelay = perfConfig.virtualScroll.throttleDelay;

	// 性能监控
	let lastScrollTime = 0;

	// 滚动进度（0-1）
	let scrollProgress = $derived(() => {
		if (totalHeight <= viewportHeight) return 0;
		return scrollTop / (totalHeight - viewportHeight);
	});

	// 是否显示侧边滑块（至少5个项目时显示）
	let showSlider = $derived(items.length > 5);

	// 上一次的路径，用于检测路径切换
	let lastPath = $state('');

	// 获取缩略图键 - 统一使用toRelativeKey
	function getThumbnailKey(item: FsItem): string {
		return toRelativeKey(item.path);
	}

	// 计算可见项目范围
	function calculateVisibleRange() {
		if (!container) return;

		// 确定列数
		if (viewMode === 'list') {
			columns = 1;
		} else {
			// 根据CSS grid断点计算列数: grid-cols-2 sm:grid-cols-3
			// sm断点通常是640px
			columns = viewportWidth >= 640 ? 3 : 2;
		}

		const totalRows = Math.ceil(items.length / columns);
		totalHeight = totalRows * itemHeight;

		const visibleRowCount = Math.ceil(viewportHeight / itemHeight);
		const startRow = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
		const endRow = Math.min(totalRows - 1, startRow + visibleRowCount + overscan * 2);

		// 将行索引转换为项目索引
		startIndex = startRow * columns;
		endIndex = Math.min(items.length - 1, (endRow + 1) * columns - 1);

		offsetY = startRow * itemHeight;

		// 触发可见范围变化事件
		handleVisibleRangeChange();
	}

	/**
	 * 核心加载逻辑：加载可见区域的缩略图
	 * 【优化】直接调用 V3 API，一次请求完成
	 */
	function loadVisibleThumbnails() {
		if (!currentPath || items.length === 0) return;

		const visibleItems = items.slice(startIndex, endIndex + 1);

		// 过滤需要缩略图的项目（文件夹、图片、视频、压缩包）
		const thumbnailItems = visibleItems.filter((item) => {
			return (
				item.isDir ||
				item.isImage ||
				isVideoFile(item.path) ||
				item.name.endsWith('.zip') ||
				item.name.endsWith('.cbz') ||
				item.name.endsWith('.rar') ||
				item.name.endsWith('.cbr')
			);
		});

		// 过滤已有缩略图的项目
		const needThumbnails = thumbnailItems.filter((item) => {
			const key = getThumbnailKey(item);
			return !thumbnails.has(key);
		});

		if (needThumbnails.length > 0) {
			// 【优化】直接收集路径，按可见区域顺序排列（靠前的先加载）
			const paths = needThumbnails.map(item => item.path);
			
			// 直接调用 requestVisibleThumbnails，V3 后端会处理优先级和缓存
			thumbnailManager.requestVisibleThumbnails(paths, currentPath);
		}
	}

	// 处理可见范围变化（防抖）- 滚动时使用
	const handleVisibleRangeChange = debounce(() => {
		const now = performance.now();
		if (now - lastScrollTime < scrollThrottleDelay) return;
		lastScrollTime = now;
		loadVisibleThumbnails();
	}, 50); // 50ms 防抖延迟

	/**
	 * 【优化】立即加载可见区域缩略图（跳过 debounce）
	 * 用于路径切换时快速响应
	 */
	function triggerImmediateVisibleLoad() {
		loadVisibleThumbnails();
	}

	// 处理滚动事件（节流 + 预测性加载）
	const handleScroll = throttle(() => {
		if (!container) return;

		const newScrollTop = container.scrollTop;
		const newScrollLeft = container.scrollLeft;

		// 更新预测性加载器的滚动位置
		thumbnailManager.updateScroll(newScrollTop, newScrollLeft, startIndex, items.length);

		scrollTop = newScrollTop;

		// 节流处理
		if (scrollTimer) {
			cancelAnimationFrame(scrollTimer);
		}

		scrollTimer = requestAnimationFrame(() => {
			calculateVisibleRange();
			scrollTimer = null;
		});
	}, scrollThrottleDelay);

	// 处理容器大小变化
	function handleResize() {
		if (!container) return;

		const newHeight = container.clientHeight;
		const newWidth = container.clientWidth;

		if (newHeight !== viewportHeight || newWidth !== viewportWidth) {
			viewportHeight = newHeight;
			viewportWidth = newWidth;
			calculateVisibleRange();
		}
	}

	// 处理项目点击
	function handleItemClick(item: FsItem, index: number) {
		dispatch('itemClick', { item, index });
		onItemSelect({ item, index, multiSelect: false });
	}

	function handleOpenFolderAsBook(item: FsItem, index: number) {
		dispatch('openFolderAsBook', { item, index });
	}

	// 处理项目右键
	function handleItemContextMenu(event: MouseEvent, item: FsItem) {
		console.log('[VirtualizedFileList] handleItemContextMenu', {
			clientX: event.clientX,
			clientY: event.clientY,
			targetTag: (event.target as HTMLElement | null)?.tagName,
			viewMode,
			path: item.path
		});
		dispatch('itemContextMenu', { event, item });
	}

	// 处理项目双击（快速打开）
	function handleItemDoubleClick(item: FsItem, index: number) {
		dispatch('itemDoubleClick', { item, index });
		onItemDoubleClick({ item, index });
	}

	// 处理项目选择（多选模式）
	function handleItemSelect(item: FsItem, index: number, multiSelect: boolean = false) {
		dispatch('itemSelect', { item, index, multiSelect });
		onItemSelect({ item, index, multiSelect });
	}

	// 处理项目键盘事件
	function handleItemKeydown(event: KeyboardEvent, item: FsItem, index: number) {
		switch (event.key) {
			case 'Enter':
			case ' ':
				event.preventDefault();
				handleItemClick(item, index);
				break;
			case 'ContextMenu':
				event.preventDefault();
				// 模拟右键点击：使用当前元素的中心点作为坐标，避免菜单出现在 (0,0)
				let clientX = 0;
				let clientY = 0;
				const target = event.target as HTMLElement | null;
				if (target && typeof target.getBoundingClientRect === 'function') {
					const rect = target.getBoundingClientRect();
					clientX = rect.left + rect.width / 2;
					clientY = rect.top + rect.height / 2;
				}
				const mouseEvent = new MouseEvent('contextmenu', {
					bubbles: true,
					cancelable: true,
					clientX,
					clientY
				});
				handleItemContextMenu(mouseEvent, item);
				break;
		}
	}

	// 格式化文件大小
	function formatSize(bytes: number, isDir: boolean): string {
		if (isDir) {
			return bytes === 0 ? '空文件夹' : `${bytes} 项`;
		}
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
	}

	// 格式化日期
	function formatDate(timestamp?: number): string {
		if (!timestamp) return '-';
		const date = new Date(timestamp * 1000);
		return date.toLocaleString();
	}

	// 切换项目选中状态
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

	// 获取项目在列表中的实际索引
	function getItemIndex(item: FsItem): number {
		return items.findIndex((i) => i.path === item.path);
	}

	// 组件挂载时初始化
	onMount(() => {
		if (container) {
			viewportHeight = container.clientHeight;
			viewportWidth = container.clientWidth;
			calculateVisibleRange();

			// 设置ResizeObserver监听容器大小变化
			resizeObserver = new ResizeObserver(handleResize);
			resizeObserver.observe(container);
		}
	});

	// 组件销毁时清理
	onDestroy(() => {
		if (scrollTimer) {
			cancelAnimationFrame(scrollTimer);
		}
		if (resizeObserver) {
			resizeObserver.disconnect();
		}
	});

	// 监听项目变化
	$effect(() => {
		if (items.length > 0) {
			calculateVisibleRange();
		} else {
			totalHeight = 0;
		}
	});

	// 监听视图模式变化，调整项目高度
	$effect(() => {
		// 列表/内容视图：96px，缩略图/横幅视图：180px（使用 4:3 比例）
		itemHeight = (viewMode === 'list' || viewMode === 'content') ? 96 : 180;
		calculateVisibleRange();
	});

	// 监听路径变化，立即加载可见区域缩略图（不预热整个目录）
	$effect(() => {
		if (!currentPath || currentPath === lastPath) return;
		
		// 【优化】路径切换时立即加载可见区域缩略图
		// 不再预热整个目录，避免与可见区域加载竞争资源
		if (items.length > 0) {
			// warmupDirectory 已禁用，优先可见区域加载
			// thumbnailManager.warmupDirectory(items, currentPath);
			
			// 立即计算并触发可见区域加载（不等 debounce）
			requestAnimationFrame(() => {
				calculateVisibleRange();
				// 直接调用加载逻辑，绕过 debounce
				triggerImmediateVisibleLoad();
			});
		}
		
		lastPath = currentPath;
	});

	let lastScrollToken = -1;
	$effect(() => {
		if (!container) {
			return;
		}
		if (scrollToSelectedToken > lastScrollToken) {
			lastScrollToken = scrollToSelectedToken;
			if (selectedIndex >= 0) {
				requestAnimationFrame(() => {
					scrollToItem(selectedIndex);
				});
			}
		}
	});

	// 键盘导航支持
	function handleKeydown(e: KeyboardEvent) {
		if (items.length === 0) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				const nextIndex = Math.min(selectedIndex + 1, items.length - 1);
				if (nextIndex !== selectedIndex) {
					onSelectedIndexChange({ index: nextIndex });
					dispatch('selectedIndexChange', { index: nextIndex });
					// 确保选中项在视口中可见
					scrollToItem(nextIndex);
				}
				break;
			case 'ArrowUp':
				e.preventDefault();
				const prevIndex = Math.max(selectedIndex - 1, 0);
				if (prevIndex !== selectedIndex) {
					onSelectedIndexChange({ index: prevIndex });
					dispatch('selectedIndexChange', { index: prevIndex });
					scrollToItem(prevIndex);
				}
				break;
			case 'Home':
				e.preventDefault();
				if (selectedIndex !== 0) {
					onSelectedIndexChange({ index: 0 });
					dispatch('selectedIndexChange', { index: 0 });
					scrollToItem(0);
				}
				break;
			case 'End':
				e.preventDefault();
				if (selectedIndex !== items.length - 1) {
					const last = items.length - 1;
					onSelectedIndexChange({ index: last });
					dispatch('selectedIndexChange', { index: last });
					scrollToItem(last);
				}
				break;
		}
	}

	// 滚动到指定项目
	function scrollToItem(index: number) {
		if (!container || index < 0 || index >= items.length) return;

		// 计算项目所在的行
		const row = Math.floor(index / columns);
		const targetScrollTop = row * itemHeight - viewportHeight / 2 + itemHeight / 2;

		container.scrollTo({
			top: Math.max(0, targetScrollTop),
			behavior: 'smooth'
		});
	}

	export function isIndexVisible(index: number): boolean {
		if (!container || index < 0 || index >= items.length) return false;

		const row = Math.floor(index / columns);
		const rowTop = row * itemHeight;
		const rowBottom = rowTop + itemHeight;
		const viewTop = scrollTop;
		const viewBottom = viewTop + viewportHeight;

		return rowBottom > viewTop && rowTop < viewBottom;
	}

	// 滚动到指定进度（0-1）
	function scrollToProgress(progress: number) {
		if (!container) return;
		const maxScroll = totalHeight - viewportHeight;
		const targetScroll = Math.max(0, Math.min(maxScroll, progress * maxScroll));
		container.scrollTo({ top: targetScroll, behavior: 'auto' });
	}

	// 跳转到指定索引
	function jumpToIndex(index: number) {
		if (!container || index < 0 || index >= items.length) return;
		onSelectedIndexChange({ index });
		dispatch('selectedIndexChange', { index });
		scrollToItem(index);
	}
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
	{#if viewMode === 'list'}
		<!-- 列表视图 - 虚拟滚动 -->
		<div
			class="virtual-list"
			style="height: {totalHeight}px; position: relative;"
			role="presentation"
		>
			<div
				class="virtual-list-viewport"
				style="transform: translateY({offsetY}px); position: absolute; top: 0; left: 0; right: 0;"
				role="presentation"
			>
				{#each items.slice(startIndex, endIndex + 1) as item, i (item.path)}
					{@const actualIndex = startIndex + i}
					{@const rowSelected = selectedIndex === actualIndex}
					{@const isChecked = selectedItems.has(item.path)}
					{@const historyEntry = (() => {
						try {
							return historyStore.findByPath(item.path);
						} catch {
							return undefined;
						}
					})()}
					<FileItemCard
						{item}
						thumbnail={thumbnails.get(getThumbnailKey(item))}
						viewMode="list"
						isSelected={rowSelected}
						isChecked={isChecked}
						{isCheckMode}
						{isDeleteMode}
						showReadMark={!!historyEntry}
						showBookmarkMark={true}
						showSizeAndModified={true}
						currentPage={historyEntry?.currentPage}
						totalPages={historyEntry?.totalPages}
						timestamp={item.modified ? item.modified * 1000 : undefined}
						onClick={() => handleItemClick(item, actualIndex)}
						onDoubleClick={() => handleItemDoubleClick(item, actualIndex)}
						onContextMenu={(e) => handleItemContextMenu(e, item)}
						onToggleSelection={() => toggleItemSelection(item.path)}
						onDelete={() => dispatch('deleteItem', { item })}
						onOpenAsBook={item.isDir ? () => handleOpenFolderAsBook(item, actualIndex) : undefined}
					/>
				{/each}
			</div>
		</div>
	{:else}
		<!-- 缩略图网格视图 - 虚拟滚动 -->
		<div
			class="virtual-grid"
			style="height: {totalHeight}px; position: relative;"
			role="grid"
			aria-label="缩略图网格"
		>
			<div
				class="virtual-grid-viewport"
				style="transform: translateY({offsetY}px); position: absolute; top: 0; left: 0; right: 0;"
				role="presentation"
			>
				<div class="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3" role="presentation">
					{#each items.slice(startIndex, endIndex + 1) as item, i (item.path)}
						{@const actualIndex = startIndex + i}
						{@const rowSelected = selectedIndex === actualIndex}
						{@const isChecked = selectedItems.has(item.path)}
						{@const historyEntry = (() => {
							try {
								return historyStore.findByPath(item.path);
							} catch {
								return undefined;
							}
						})()}
						<FileItemCard
							{item}
							thumbnail={thumbnails.get(getThumbnailKey(item))}
							viewMode="thumbnail"
							isSelected={rowSelected}
							isChecked={isChecked}
							{isCheckMode}
							{isDeleteMode}
							showReadMark={!!historyEntry}
							showBookmarkMark={true}
							showSizeAndModified={true}
							currentPage={historyEntry?.currentPage}
							totalPages={historyEntry?.totalPages}
							timestamp={item.modified ? item.modified * 1000 : undefined}
							onClick={() => handleItemClick(item, actualIndex)}
							onDoubleClick={() => handleItemDoubleClick(item, actualIndex)}
							onContextMenu={(e) => handleItemContextMenu(e, item)}
							onToggleSelection={() => toggleItemSelection(item.path)}
							onDelete={() => dispatch('deleteItem', { item })}
							onOpenAsBook={item.isDir
								? () => handleOpenFolderAsBook(item, actualIndex)
								: undefined}
						/>
					{/each}
				</div>
			</div>
		</div>
	{/if}
	</div>

	<!-- 侧边进度条滑块 -->
	{#if showSlider}
		<div class="h-full">
			<ListSlider
				totalItems={items.length}
				currentIndex={selectedIndex >= 0 ? selectedIndex : 0}
				visibleStart={startIndex}
				visibleEnd={endIndex}
				scrollProgress={scrollProgress()}
				onJumpToIndex={jumpToIndex}
				onScrollToProgress={scrollToProgress}
			/>
		</div>
	{/if}
</div>

<style>
	.virtual-list-container {
		height: 100%;
		overflow-y: auto;
		/* CSS Containment 优化 */
		contain: layout style paint;
	}

	/* 自定义滚动条样式 */
	.virtual-list-container::-webkit-scrollbar {
		width: 8px;
	}

	.virtual-list-container::-webkit-scrollbar-track {
		background: transparent;
	}

	.virtual-list-container::-webkit-scrollbar-thumb {
		background-color: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		border: 2px solid transparent;
		background-clip: content-box;
	}

	.virtual-list-container::-webkit-scrollbar-thumb:hover {
		background-color: rgba(0, 0, 0, 0.3);
	}

	/* 确保项目高度一致 */
	.virtual-list-viewport > * {
		box-sizing: border-box;
	}

	.virtual-grid-viewport > div > * {
		box-sizing: border-box;
	}
</style>
