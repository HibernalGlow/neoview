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
	import { historyStore } from '$lib/stores/history.svelte';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import { isVideoFile } from '$lib/utils/videoUtils';

	// 使用全局 store 记录滚动位置，实现跨布局共享
	// 这样在无缝切换模式下，传统布局和 Flow 布局可以共享滚动位置
	function getScrollPosition(path: string): number {
		return fileBrowserStore.getState().scrollPositions[path] ?? 0;
	}

	function setScrollPosition(path: string, position: number): void {
		const current = fileBrowserStore.getState().scrollPositions;
		fileBrowserStore.setScrollPositions({ ...current, [path]: position });
	}

	function toRelativeKey(path: string): string {
		return path.replace(/\\/g, '/');
	}

	function enqueueVisible(path: string, items: any[], options?: any): void {
		const priority = options?.priority || 'normal';
		items.forEach((item) => {
			const isArchive =
				item.name.endsWith('.zip') ||
				item.name.endsWith('.cbz') ||
				item.name.endsWith('.rar') ||
				item.name.endsWith('.cbr');
			const isVideo = isVideoFile(item.path);

			if (item.isDir) {
				// 文件夹：只从数据库加载，不主动查找（避免超多子文件夹影响性能）
				// 文件夹缩略图由反向查找策略自动更新（当子文件/压缩包生成缩略图时）
				thumbnailManager.getThumbnail(item.path, undefined, false, priority).then((dataUrl) => {
					if (dataUrl) {
						const key = toRelativeKey(item.path);
						fileBrowserStore.addThumbnail(key, dataUrl);
					}
					// 如果没有找到，不主动查找，避免性能问题
				});
			} else if (item.isImage || isArchive || isVideo) {
				thumbnailManager.getThumbnail(item.path, undefined, isArchive, priority);
			}
		});
	}

	function bumpPriority(path: string): void {
		thumbnailManager.setCurrentDirectory(path);
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
		viewMode?: 'list' | 'thumbnails';
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

	// 处理可见范围变化（防抖）
	const handleVisibleRangeChange = debounce(() => {
		if (!currentPath || items.length === 0) return;

		const now = performance.now();
		if (now - lastScrollTime < scrollThrottleDelay) return;
		lastScrollTime = now;

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
			// 优化：使用 Map 避免 O(n²) 的 findIndex
			const pathToIndex = new Map<string, number>();
			for (let i = startIndex; i <= endIndex && i < items.length; i++) {
				pathToIndex.set(items[i].path, i);
			}

			// 按虚拟列表顺序处理：视野上方的先加载，下方的后加载
			const itemsWithOrder = needThumbnails.map((item) => {
				const itemIndex = pathToIndex.get(item.path) ?? startIndex;
				const distanceFromTop = itemIndex - startIndex;
				return { item, distanceFromTop, itemIndex };
			});

			// 按距离顶部距离排序（距离越近，优先级越高）
			itemsWithOrder.sort((a, b) => a.distanceFromTop - b.distanceFromTop);

			// 使用增量批量加载：支持流式加载，边查询边显示
			const paths = itemsWithOrder.map(({ item }) => item.path);

			scheduleIdleTask(async () => {
				try {
					// 使用增量批量加载（自动支持流式加载）
					await thumbnailManager.batchLoadFromDb(paths);
				} catch (err) {
					console.debug('批量加载缩略图失败:', err);
				}

				// 等待一小段时间让批量加载完成，然后检查哪些还需要生成
				setTimeout(() => {
					// 批量处理而不是每个都 setTimeout
					const itemsToEnqueue = itemsWithOrder.filter(({ item }) => {
						const key = getThumbnailKey(item);
						return !thumbnails.has(key);
					}).map(({ item }) => item);
					
					if (itemsToEnqueue.length > 0) {
						enqueueVisible(currentPath, itemsToEnqueue, { priority: 'immediate' });
					}
				}, 100);
			});
		}
	}, 100); // 增加防抖延迟到 100ms

	// 处理滚动事件（节流 + 预测性加载）
	const handleScroll = throttle(() => {
		if (!container) return;

		const newScrollTop = container.scrollTop;
		const newScrollLeft = container.scrollLeft;

		// 更新预测性加载器的滚动位置
		thumbnailManager.updateScroll(newScrollTop, newScrollLeft, startIndex, items.length);

		scrollTop = newScrollTop;
		// 按路径记录当前滚动位置到全局 store，用于下次返回时精确恢复
		if (currentPath) {
			setScrollPosition(currentPath, newScrollTop);
			console.debug('[VirtualizedFileList] save scroll to store', {
				path: currentPath,
				scrollTop: newScrollTop
			});
		}

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
		// 列表视图：96px，网格视图：240px（包含缩略图和信息）
		itemHeight = viewMode === 'list' ? 96 : 240;
		calculateVisibleRange();
	});

	// 监听路径变化，按路径恢复滚动位置
	$effect(() => {
		if (!container) return;

		// 没有有效路径时重置状态
		if (!currentPath) {
			lastPath = '';
			return;
		}

		if (currentPath !== lastPath) {
			const savedTop = getScrollPosition(currentPath);
			console.debug('[VirtualizedFileList] restore scroll from store', {
				path: currentPath,
				savedTop
			});

			// 等 DOM 和高度更新后再恢复滚动位置，保证虚拟列表计算正确
			requestAnimationFrame(() => {
				if (!container) return;
				container.scrollTo({ top: savedTop, behavior: 'auto' });
				scrollTop = savedTop;
				calculateVisibleRange();
			});

			lastPath = currentPath;
		}
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
							viewMode="grid"
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

<style>
	.virtual-list-container {
		height: 100%;
		overflow-y: auto;
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
