<script lang="ts">
	/**
	 * Bottom Thumbnail Bar
	 * 底部缩略图栏 - 自动隐藏，鼠标悬停显示
	 */
	import { onDestroy, onMount } from 'svelte';
	import { readable } from 'svelte/store';
	import { bookStore } from '$lib/stores/book.svelte';
	import { loadImage } from '$lib/api/fs';
	import { loadImageFromArchive } from '$lib/api/filesystem';
	import { bottomThumbnailBarPinned, bottomThumbnailBarHeight } from '$lib/stores';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Button } from '$lib/components/ui/button';
	import * as Progress from '$lib/components/ui/progress';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Image as ImageIcon, Pin, PinOff, GripHorizontal, ExternalLink, Minus, Target } from '@lucide/svelte';
	import { subscribeSharedPreloadManager } from '$lib/components/viewer/flow/sharedPreloadManager';
	import type { PreloadManager } from '$lib/components/viewer/flow/preloadManager.svelte';
	import { appState, type StateSelector } from '$lib/core/state/appState';

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);

	// 阅读方向状态
	let settings = $state(settingsManager.getSettings());
	let readingDirection = $derived(settings.book.readingDirection);

	// 监听设置变化
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	const LOCAL_MIN_THUMBNAILS = 6;
	const ARCHIVE_MIN_THUMBNAILS = 3;

	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let thumbnails = $state<Record<number, {url: string, width: number, height: number}>>({});
	let thumbnailScrollContainer = $state<HTMLDivElement | null>(null);
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;
	let showBottomProgressBar = $state(true);
	let hoverCount = $state(0); // 追踪悬停区域的计数
	let showAreaOverlay = $state(false); // 显示区域覆盖层
	
	// 共享预加载管理器引用
	let preloadManager: PreloadManager | null = null;
	let unsubscribeSharedManager: (() => void) | null = null;
	let unsubscribeThumbnailListener: (() => void) | null = null;

	// 响应钉住状态
	$effect(() => {
		if ($bottomThumbnailBarPinned) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
		}
	});

	// 初始化时同步进度条状态
	// Removed global progressBarStateChange initialization effect

const THUMBNAIL_DEBOUNCE_MS = 250;
let loadThumbnailsDebounce: number | null = null;
let lastThumbnailRange: { start: number; end: number } | null = null;
const noThumbnailPaths = new Set<string>();

function scheduleLoadVisibleThumbnails(immediate = false) {
	if (immediate) {
		if (loadThumbnailsDebounce) {
			clearTimeout(loadThumbnailsDebounce);
			loadThumbnailsDebounce = null;
		}
		void loadVisibleThumbnails();
		return;
	}
	if (loadThumbnailsDebounce) return;
	loadThumbnailsDebounce = window.setTimeout(() => {
		loadThumbnailsDebounce = null;
		void loadVisibleThumbnails();
	}, THUMBNAIL_DEBOUNCE_MS);
}

	function showThumbnails() {
		isVisible = true;
		if (hideTimeout) clearTimeout(hideTimeout);
	scheduleLoadVisibleThumbnails(true);
		// 不要在这里设置定时器，让 handleMouseLeave 来处理
	}

	function handleMouseEnter() {
		hoverCount++;
		showThumbnails();
	}

	function handleMouseLeave() {
		hoverCount--;
		if ($bottomThumbnailBarPinned || isResizing) return;
		if (hideTimeout) clearTimeout(hideTimeout);
		// 只有当计数为0时（即鼠标离开了所有相关区域）才开始延迟隐藏
		if (hoverCount <= 0) {
			hideTimeout = setTimeout(() => {
				if (hoverCount <= 0) {
					isVisible = false;
				}
			}, 300) as unknown as number;
		}
	}

	function togglePin() {
		bottomThumbnailBarPinned.update(p => !p);
	}

	function handlePinContextMenu(e: MouseEvent) {
		e.preventDefault();
		bottomThumbnailBarPinned.set(false);
		if (hideTimeout) clearTimeout(hideTimeout);
		hoverCount = 0;
		isVisible = false;
	}

	function toggleProgressBar() {
		showBottomProgressBar = !showBottomProgressBar;
	}

	function toggleAreaOverlay() {
		showAreaOverlay = !showAreaOverlay;
		// 通知主窗口显示/隐藏区域覆盖层
		window.dispatchEvent(new CustomEvent('areaOverlayToggle', {
			detail: { show: showAreaOverlay }
		}));
	}

	function openInNewWindow() {
		const url = `${window.location.origin}/standalone/bottom-thumbnails`;
		const features = 'width=1200,height=300,resizable=yes,scrollbars=yes,status=yes,toolbar=no,menubar=no,location=no';
		window.open(url, '缩略图栏', features);
	}

	function handleResizeStart(e: MouseEvent) {
		isResizing = true;
		resizeStartY = e.clientY;
		resizeStartHeight = $bottomThumbnailBarHeight;
		e.preventDefault();
	}

	function handleResizeMove(e: MouseEvent) {
		if (!isResizing) return;
		const deltaY = resizeStartY - e.clientY; // 反向，因为是从底部拖拽
		const newHeight = Math.max(80, Math.min(400, resizeStartHeight + deltaY));
		bottomThumbnailBarHeight.set(newHeight);
	}

	function handleResizeEnd() {
		isResizing = false;
	}

	$effect(() => {
		if (isResizing) {
			window.addEventListener('mousemove', handleResizeMove);
			window.addEventListener('mouseup', handleResizeEnd);
			return () => {
				window.removeEventListener('mousemove', handleResizeMove);
				window.removeEventListener('mouseup', handleResizeEnd);
			};
		}
	});

	function getMinVisibleThumbnails(): number {
		const bookType = bookStore.currentBook?.type;
		return bookType === 'archive' ? ARCHIVE_MIN_THUMBNAILS : LOCAL_MIN_THUMBNAILS;
	}

	function ensureMinimumSpan(
		start: number,
		end: number,
		totalPages: number,
		targetLength: number
	): { start: number; end: number } {
		let newStart = start;
		let newEnd = end;
		const currentSpan = newEnd - newStart + 1;
		if (currentSpan >= targetLength) {
			return { start: newStart, end: newEnd };
		}

		let deficit = targetLength - currentSpan;
		while (deficit > 0 && (newStart > 0 || newEnd < totalPages - 1)) {
			if (newStart > 0) {
				newStart -= 1;
				deficit -= 1;
			}
			if (deficit > 0 && newEnd < totalPages - 1) {
				newEnd += 1;
				deficit -= 1;
			}
		}

		return { start: newStart, end: newEnd };
	}

	function getWindowRange(totalPages: number): { start: number; end: number } {
		const windowState = $viewerState.pageWindow;
		const minVisible = getMinVisibleThumbnails();
		const fallbackRadius = Math.max(minVisible, Math.floor(($bottomThumbnailBarHeight - 40) / 60));

		if (!windowState || windowState.stale) {
			const start = Math.max(0, bookStore.currentPageIndex - fallbackRadius);
			const end = Math.min(totalPages - 1, bookStore.currentPageIndex + fallbackRadius);
			return ensureMinimumSpan(start, end, totalPages, minVisible);
		}

		let minIndex = windowState.center;
		let maxIndex = windowState.center;
		if (windowState.backward.length) {
			minIndex = Math.min(minIndex, ...windowState.backward);
		}
		if (windowState.forward.length) {
			maxIndex = Math.max(maxIndex, ...windowState.forward);
		}
		minIndex = Math.max(0, minIndex);
		maxIndex = Math.min(totalPages - 1, maxIndex);

		const currentSpan = maxIndex - minIndex + 1;
		if (currentSpan <= minVisible) {
			return ensureMinimumSpan(minIndex, maxIndex, totalPages, minVisible);
		}

		const center = windowState.center;
		const half = Math.floor((minVisible - 1) / 2);
		let start = Math.max(minIndex, center - half);
		let end = start + minVisible - 1;
		if (end > maxIndex) {
			end = maxIndex;
			start = Math.max(minIndex, end - minVisible + 1);
		}
		if (end >= totalPages) {
			end = totalPages - 1;
			start = Math.max(0, end - minVisible + 1);
		}

		return { start, end };
	}

	function windowBadgeLabel(index: number): string | null {
		const windowState = $viewerState.pageWindow;
		if (!windowState || windowState.stale) return null;
		if (index === windowState.center) return 'C';
		if (windowState.forward.includes(index)) return '+';
		if (windowState.backward.includes(index)) return '-';
		return null;
	}

	function windowBadgeClass(index: number): string {
		const windowState = $viewerState.pageWindow;
		if (!windowState || windowState.stale) return '';
		if (index === windowState.center) return 'bg-primary/80';
		if (windowState.forward.includes(index)) return 'bg-accent/80';
		if (windowState.backward.includes(index)) return 'bg-secondary/80';
		return '';
	}

	async function loadVisibleThumbnails() {
		const currentBook = bookStore.currentBook;
		if (!currentBook || !preloadManager) return;

		const totalPages = currentBook.pages.length;
		const { start, end } = getWindowRange(totalPages);
		const desired = getMinVisibleThumbnails();

	if (
		lastThumbnailRange &&
		lastThumbnailRange.start === start &&
		lastThumbnailRange.end === end
	) {
		return;
	}
	lastThumbnailRange = { start, end };

		console.log(`Loading thumbnails from ${start} to ${end} (total: ${end - start + 1}, desired: ${desired})`);

		// 并行请求所有缩略图
		const promises: Promise<void>[] = [];
		for (let i = start; i <= end; i++) {
			if (!(i in thumbnails)) {
				promises.push(loadThumbnail(i));
			}
		}
		await Promise.all(promises);
	}

	// 在前端从 base64 生成缩略图
	function generateThumbnailFromBase64(base64Data: string, maxHeight: number = $bottomThumbnailBarHeight - 40): Promise<{url: string, width: number, height: number}> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Cannot get canvas context'));
					return;
				}

				// 根据容器高度自适应调整缩略图大小
				let width = img.width;
				let height = img.height;
				if (height > maxHeight) {
					width = (width * maxHeight) / height;
					height = maxHeight;
				}

				canvas.width = width;
				canvas.height = height;
				ctx.drawImage(img, 0, 0, width, height);

				// 直接使用 JPEG 格式
				const thumbnailData = canvas.toDataURL('image/jpeg', 0.85);
				resolve({
					url: thumbnailData,
					width: width,
					height: height
				});
			};
			img.onerror = () => reject(new Error('Failed to load image'));
			img.src = base64Data;
		});
	}

	let loadingIndices = new Set<number>();

async function loadThumbnail(pageIndex: number) {
	if (!preloadManager || loadingIndices.has(pageIndex)) return;

	const currentBook = bookStore.currentBook;
	const page = currentBook?.pages[pageIndex];
	const pathKey =
		currentBook && page ? `${currentBook.path}::${page.path}` : null;

	if (pathKey && noThumbnailPaths.has(pathKey)) {
		return;
	}

	loadingIndices.add(pageIndex);
	try {
		await preloadManager.requestThumbnail(pageIndex, 'bottom-bar');
		if (pathKey) {
			noThumbnailPaths.delete(pathKey);
		}
	} catch (err) {
		console.error(`Failed to load thumbnail for page ${pageIndex}:`, err);
		if (!currentBook || !page) return;

		try {
			let fullImageData: string;

			if (currentBook.type === 'archive') {
				fullImageData = await loadImageFromArchive(currentBook.path, page.path);
			} else {
				fullImageData = await loadImage(page.path);
			}

			const thumbnail = await generateThumbnailFromBase64(fullImageData);
			thumbnails = { ...thumbnails, [pageIndex]: thumbnail };
			noThumbnailPaths.delete(pathKey!);
		} catch (fallbackErr) {
			console.error(`Fallback also failed for page ${pageIndex}:`, fallbackErr);
			if (pathKey) {
				noThumbnailPaths.add(pathKey);
			}
		}
	} finally {
		loadingIndices.delete(pageIndex);
	}
}

	function handleScroll(e: Event) {
		const container = e.target as HTMLElement;
		const thumbnailElements = container.querySelectorAll('button');

		// 加载所有可见的缩略图，包括缓冲区
		thumbnailElements.forEach((el, i) => {
			const rect = el.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();

			// 扩大可见范围，提前加载即将进入视野的缩略图
			const buffer = 200; // 200px 缓冲区
			if (
				rect.left >= containerRect.left - buffer &&
				rect.right <= containerRect.right + buffer
			) {
				if (!(i in thumbnails)) {
					void loadThumbnail(i);
				}
			}
		});
	}

	function scrollCurrentThumbnailIntoCenter() {
		if (!thumbnailScrollContainer) return;
		const currentIndex = bookStore.currentPageIndex;
		const currentButton = thumbnailScrollContainer.querySelector<HTMLButtonElement>(
			`[data-page-index="${currentIndex}"]`
		);
		if (!currentButton) return;
		const containerRect = thumbnailScrollContainer.getBoundingClientRect();
		const itemRect = currentButton.getBoundingClientRect();
		const offset = itemRect.left - containerRect.left;
		const itemCenter = offset + itemRect.width / 2;
		const targetScrollLeft =
			thumbnailScrollContainer.scrollLeft + itemCenter - containerRect.width / 2;
		thumbnailScrollContainer.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
	}

	function getThumbnailStyle(pageIndex: number): string {
		const containerHeight = Math.max(40, $bottomThumbnailBarHeight - 40);
		const minWidth = 40;
		const maxWidth = 200;
		const thumb = thumbnails[pageIndex];
		if (!thumb) {
			const placeholderWidth = Math.min(Math.max(containerHeight * 0.75, minWidth), maxWidth);
			return `height:${containerHeight}px;min-width:${placeholderWidth}px;max-width:${maxWidth}px;`;
		}
		const aspect = thumb.height > 0 ? thumb.width / thumb.height : 1;
		let width = containerHeight * aspect;
		if (width < minWidth) width = minWidth;
		if (width > maxWidth) width = maxWidth;
		return `height:${containerHeight}px;width:${width}px;min-width:${width}px;max-width:${width}px;`;
	}

	function handleSharedThumbnailReady(pageIndex: number, dataURL: string) {
		const img = new Image();
		img.onload = () => {
			const maxHeight = $bottomThumbnailBarHeight - 40;
			let width = img.width;
			let height = img.height;
			if (height > maxHeight) {
				width = (width * maxHeight) / height;
				height = maxHeight;
			}
			thumbnails = { ...thumbnails, [pageIndex]: { url: dataURL, width, height } };
		};
		img.src = dataURL;
	}

onMount(() => {
	unsubscribeSharedManager = subscribeSharedPreloadManager((manager) => {
		if (unsubscribeThumbnailListener) {
			unsubscribeThumbnailListener();
			unsubscribeThumbnailListener = null;
		}
		preloadManager = manager;
		if (preloadManager) {
			lastThumbnailRange = null;
			unsubscribeThumbnailListener = preloadManager.addThumbnailListener((pageIndex, dataURL, source) => {
				if (source !== 'bottom-bar') {
					return;
				}
				handleSharedThumbnailReady(pageIndex, dataURL);
			});
			scheduleLoadVisibleThumbnails();
		}
	});
});

	onDestroy(() => {
		if (unsubscribeThumbnailListener) {
			unsubscribeThumbnailListener();
			unsubscribeThumbnailListener = null;
		}
		if (unsubscribeSharedManager) {
			unsubscribeSharedManager();
			unsubscribeSharedManager = null;
		}
	if (loadThumbnailsDebounce) {
		clearTimeout(loadThumbnailsDebounce);
		loadThumbnailsDebounce = null;
	}
	});

	$effect(() => {
		const windowState = $viewerState.pageWindow;
		if (!bookStore.currentBook || !windowState) return;
		scheduleLoadVisibleThumbnails();
	});

	// 根据阅读方向获取排序后的页面
	function getOrderedPages() {
		if (!bookStore.currentBook) return [];
		
		const pages = bookStore.currentBook.pages;
		if (readingDirection === 'right-to-left') {
			// 右开阅读：反向排列
			return pages.map((page, index) => ({ ...page, originalIndex: index })).reverse();
		} else {
			// 左开阅读：正常排列
			return pages.map((page, index) => ({ ...page, originalIndex: index }));
		}
	}

	// 清空缩略图缓存当书籍变化时
	$effect(() => {
		const currentBook = bookStore.currentBook;
		if (currentBook) {
			thumbnails = {};
		lastThumbnailRange = null;
		}
	});

	// 当高度变化时重新生成缩略图
	$effect(() => {
		const currentBook = bookStore.currentBook;
		if (currentBook && Object.keys(thumbnails).length > 0) {
			// 重新加载当前可见的缩略图以适应新高度
			scheduleLoadVisibleThumbnails();
		}
	});

	$effect(() => {
		const _currentIndex = bookStore.currentPageIndex;
		if (!bookStore.currentBook) return;
		if (!isVisible) return;
		if (readingDirection !== 'right-to-left') return;
		scrollCurrentThumbnailIntoCenter();
	});
</script>

{#if bookStore.currentBook && bookStore.currentBook.pages.length > 0}
	<!-- 缩略图栏触发区域（独立） -->
	<div
		class="fixed bottom-0 left-0 right-0 h-4 z-[57]"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		role="presentation"
		aria-label="底部缩略图栏触发区域"
	></div>

	<!-- 缩略图栏内容 -->
	<div
		data-bottom-bar="true"
		class="absolute bottom-0 left-0 right-0 z-[58] transition-transform duration-300 {isVisible
			? 'translate-y-0'
			: 'translate-y-full'}"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		role="application"
		aria-label="底部缩略图栏"
	>
		<div class="bg-sidebar/95 backdrop-blur-sm border-t shadow-lg overflow-hidden relative" style="height: {$bottomThumbnailBarHeight}px;">
			<!-- 拖拽手柄 -->
			<button
				type="button"
				class="h-2 w-full flex items-center justify-center cursor-ns-resize hover:bg-primary/20 transition-colors"
				onmousedown={handleResizeStart}
				aria-label="拖拽调整缩略图栏高度"
			>
				<GripHorizontal class="h-3 w-3 text-muted-foreground" />
			</button>

			<!-- 控制按钮 -->
			<div class="px-2 pb-1 flex justify-center gap-2">
				<Button
					variant={$bottomThumbnailBarPinned ? 'default' : 'ghost'}
					size="sm"
					class="h-6"
					onclick={togglePin}
					oncontextmenu={handlePinContextMenu}
				>
					{#if $bottomThumbnailBarPinned}
						<Pin class="h-3 w-3 mr-1" />
					{:else}
						<PinOff class="h-3 w-3 mr-1" />
					{/if}
					<span class="text-xs">{$bottomThumbnailBarPinned ? '已钉住' : '钉住'}</span>
				</Button>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="sm"
							class="h-6"
							onclick={openInNewWindow}
						>
							<ExternalLink class="h-3 w-3 mr-1" />
							<span class="text-xs">独立窗口</span>
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>在独立窗口中打开</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={showBottomProgressBar ? 'default' : 'ghost'}
							size="sm"
							class="h-6"
							onclick={toggleProgressBar}
						>
							<Minus class="h-3 w-3 mr-1" />
							<span class="text-xs">进度条</span>
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>显示阅读进度条</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={showAreaOverlay ? 'default' : 'ghost'}
							size="sm"
							class="h-6"
							onclick={toggleAreaOverlay}
						>
							<Target class="h-3 w-3 mr-1" />
							<span class="text-xs">区域</span>
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>显示/隐藏 9 区域点击测试</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>

			{#if $viewerState.pageWindow && !$viewerState.pageWindow.stale}
				<div class="px-3 pb-1 text-[11px] text-muted-foreground flex flex-wrap gap-3">
					<span>窗口中心：{$viewerState.pageWindow.center + 1}</span>
					<span>前向覆盖：{$viewerState.pageWindow.forward.length} 页</span>
					<span>后向覆盖：{$viewerState.pageWindow.backward.length} 页</span>
				</div>
			{/if}

			{#if $viewerState.taskCursor}
				<div class="px-3 text-[11px] text-muted-foreground flex flex-wrap gap-3 pb-1">
					<span>任务：{$viewerState.taskCursor.running}/{$viewerState.taskCursor.concurrency}</span>
					<span>Current {$viewerState.taskCursor.activeBuckets.current}</span>
					<span>Forward {$viewerState.taskCursor.activeBuckets.forward}</span>
					<span>Backward {$viewerState.taskCursor.activeBuckets.backward}</span>
					<span>Background {$viewerState.taskCursor.activeBuckets.background}</span>
				</div>
			{/if}

			<div class="px-2 pb-2 h-[calc(100%-theme(spacing.12))] overflow-hidden">
				<div class="flex gap-2 overflow-x-auto h-full pb-1 items-center" onscroll={handleScroll} bind:this={thumbnailScrollContainer}>
					{#each getOrderedPages() as page, index (page.path)}
						{@const originalIndex = page.originalIndex}
						{@const status = bookStore.getPageUpscaleStatus(originalIndex)}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<button
									class="flex-shrink-0 rounded overflow-hidden border-2 border-border transition-colors relative group
										{originalIndex === bookStore.currentPageIndex ? 'outline outline-2 outline-sidebar-ring' : ''}
										{status === 'preupscaled' ? 'ring-2 ring-accent' : ''}
										{status === 'done' ? 'ring-2 ring-primary' : ''}
										{status === 'failed' ? 'ring-2 ring-destructive' : ''}
										hover:border-primary/50"
									style={getThumbnailStyle(originalIndex)}
									onclick={() => bookStore.navigateToPage(originalIndex)}
									data-page-index={originalIndex}
								>
									{#if originalIndex in thumbnails}
										<img
											src={thumbnails[originalIndex].url}
											alt="Page {originalIndex + 1}"
											class="w-full h-full object-contain"
											style="object-position: center;"
										/>
									{:else}
										<div
											class="w-full h-full flex flex-col items-center justify-center bg-muted text-xs text-muted-foreground"
											style="min-width: 60px; max-width: 120px;"
										>
											<ImageIcon class="h-6 w-6 mb-1" />
											<span class="font-mono">{originalIndex + 1}</span>
										</div>
									{/if}

									{#if windowBadgeLabel(originalIndex)}
										<div
											class={`absolute top-0 right-0 text-[10px] px-1 py-[1px] text-white font-mono ${windowBadgeClass(originalIndex)}`}
										>
											{windowBadgeLabel(originalIndex)}
										</div>
									{/if}

									<!-- 页码标签 -->
									<div
										class="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] text-center py-0.5 font-mono"
									>
										{index + 1}
									</div>

									<!-- 状态角标 -->
									{#if status === 'done'}
										<span class="absolute right-1 top-1 w-2 h-2 rounded-full bg-primary"></span>
									{:else if status === 'preupscaled'}
										<span class="absolute right-1 top-1 w-2 h-2 rounded-full bg-accent"></span>
									{:else if status === 'failed'}
										<span class="absolute right-1 top-1 w-2 h-2 rounded-full bg-destructive"></span>
									{/if}
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>
									第 {originalIndex + 1} 页
									{#if status === 'done'} · 已超分{/if}
									{#if status === 'preupscaled'} · 已预超分{/if}
									{#if status === 'failed'} · 超分失败{/if}
								</p>
							</Tooltip.Content>
						</Tooltip.Root>
						{/each}
					</div>
				</div>
				{#if showBottomProgressBar && bookStore.currentBook}
					<!-- 底部进度条（跟随缩略图栏） -->
					<div class={`absolute left-0 right-0 bottom-0 h-1 z-[60] pointer-events-none ${readingDirection === 'right-to-left' ? 'rtl-progress-wrapper' : ''}`}>
						<Progress.Root
							value={((bookStore.currentPageIndex + 1) / bookStore.currentBook.pages.length) * 100}
							class="h-full"
						/>
					</div>
				{/if}
			</div>
		</div>
	{/if}

<style>
	.rtl-progress-wrapper {
		transform: scaleX(-1);
		transform-origin: center;
	}
</style>
