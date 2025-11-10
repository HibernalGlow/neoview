<script lang="ts">
	/**
	 * Bottom Thumbnail Bar
	 * 底部缩略图栏 - 自动隐藏，鼠标悬停显示
	 */
	import { bookStore } from '$lib/stores/book.svelte';
	import { loadImage } from '$lib/api/fs';
	import { loadImageFromArchive } from '$lib/api/filesystem';
	import { bottomThumbnailBarPinned, bottomThumbnailBarHeight } from '$lib/stores';
	import { Button } from '$lib/components/ui/button';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as Progress from '$lib/components/ui/progress';
	import * as ScrollArea from '$lib/components/ui/scroll-area';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Image as ImageIcon, Pin, PinOff, GripHorizontal, ExternalLink, Minus, Settings, Layers } from '@lucide/svelte';

	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let thumbnails = $state<Record<number, {url: string, width: number, height: number}>>({});
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;
	let showProgressBar = $state(true);

	// 响应钉住状态
	$effect(() => {
		if ($bottomThumbnailBarPinned) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
		}
	});

	// 初始化时同步进度条状态
	$effect(() => {
		window.dispatchEvent(new CustomEvent('progressBarStateChange', {
			detail: { show: showProgressBar }
		}));
	});

	function showThumbnails() {
		isVisible = true;
		if (hideTimeout) clearTimeout(hideTimeout);
		loadVisibleThumbnails();
		if (!$bottomThumbnailBarPinned) {
			hideTimeout = setTimeout(() => {
				isVisible = false;
			}, 2000) as unknown as number;
		}
	}

	function handleMouseEnter() {
		showThumbnails();
	}

	function handleMouseLeave() {
		if ($bottomThumbnailBarPinned || isResizing) return;
		if (hideTimeout) clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			isVisible = false;
		}, 500) as unknown as number;
	}

	function togglePin() {
		bottomThumbnailBarPinned.update(p => !p);
	}

	function toggleProgressBar() {
		showProgressBar = !showProgressBar;
		// 通知ImageViewer进度条状态变化
		window.dispatchEvent(new CustomEvent('progressBarStateChange', {
			detail: { show: showProgressBar }
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

	async function loadVisibleThumbnails() {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		// 预加载当前页前后各5页的缩略图
		const start = Math.max(0, bookStore.currentPageIndex - 5);
		const end = Math.min(currentBook.pages.length - 1, bookStore.currentPageIndex + 5);

		for (let i = start; i <= end; i++) {
			if (!(i in thumbnails)) {
				loadThumbnail(i);
			}
		}
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

	async function loadThumbnail(pageIndex: number) {
		const currentBook = bookStore.currentBook;
		if (!currentBook || !currentBook.pages[pageIndex]) return;

		try {
			const page = currentBook.pages[pageIndex];
			let fullImageData: string;

			if (currentBook.type === 'archive') {
				fullImageData = await loadImageFromArchive(currentBook.path, page.path);
			} else {
				fullImageData = await loadImage(page.path);
			}

			const thumbnail = await generateThumbnailFromBase64(fullImageData);
			thumbnails = { ...thumbnails, [pageIndex]: thumbnail };
		} catch (err) {
			console.error(`Failed to load thumbnail for page ${pageIndex}:`, err);
		}
	}

	function handleScroll(e: Event) {
		const container = e.target as HTMLElement;
		const thumbnailElements = container.querySelectorAll('button');

		thumbnailElements.forEach((el, i) => {
			const rect = el.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();

			if (
				rect.left >= containerRect.left - 100 &&
				rect.right <= containerRect.right + 100
			) {
				if (!(i in thumbnails)) {
					loadThumbnail(i);
				}
			}
		});
	}

	// 清空缩略图缓存当书籍变化时
	$effect(() => {
		const currentBook = bookStore.currentBook;
		thumbnails = {};
	});

	// 当高度变化时重新生成缩略图
	$effect(() => {
		const currentBook = bookStore.currentBook;
		if (currentBook && Object.keys(thumbnails).length > 0) {
			// 重新加载当前可见的缩略图以适应新高度
			loadVisibleThumbnails();
		}
	});
</script>

{#if bookStore.currentBook}
	<!-- 缩略图栏触发区域（独立） -->
	<div
		class="fixed bottom-0 left-0 right-0 h-4 z-[48]"
		onmouseenter={handleMouseEnter}
		role="presentation"
		aria-label="底部缩略图栏触发区域"
	></div>

	<!-- 缩略图栏内容 -->
	<div
		class="absolute bottom-0 left-0 right-0 z-50 transition-transform duration-300 {isVisible
			? 'translate-y-0'
			: 'translate-y-full'}"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		role="toolbar"
		aria-label="缩略图工具栏"
		tabindex="-1"
	>
		<div class="bg-secondary/95 backdrop-blur-sm border-t shadow-lg overflow-hidden" style="height: {$bottomThumbnailBarHeight}px;">
			<!-- 拖拽手柄 -->
		<Tooltip.Root>
			<Tooltip.Trigger asChild>
				<button
					type="button"
					class="h-2 flex items-center justify-center cursor-ns-resize hover:bg-primary/20 transition-colors w-full"
					onmousedown={handleResizeStart}
					aria-label="拖拽调整缩略图栏高度"
				>
					<GripHorizontal class="h-3 w-3 text-muted-foreground" />
				</button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>拖拽调整高度</p>
			</Tooltip.Content>
		</Tooltip.Root>

			<!-- 控制区域 - 使用 Tabs -->
			<Tabs.Root class="w-full" value="thumbnails">
				<Tabs.List class="grid w-full grid-cols-3 h-8">
					<Tabs.Trigger value="thumbnails" class="text-xs">
						<Layers class="h-3 w-3 mr-1" />
						缩略图
					</Tabs.Trigger>
					<Tabs.Trigger value="settings" class="text-xs">
						<Settings class="h-3 w-3 mr-1" />
						设置
					</Tabs.Trigger>
					<Tabs.Trigger value="progress" class="text-xs">
						<Minus class="h-3 w-3 mr-1" />
						进度
					</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="thumbnails" class="mt-2">
					<div class="px-2 pb-2 h-[calc(100%-theme(spacing.12))] overflow-hidden">
						<ScrollArea.Root class="h-full w-full">
							<ScrollArea.Viewport class="h-full w-full">
								<div class="flex gap-2 pb-1 items-center" role="list" aria-label="页面缩略图列表">
									{#each bookStore.currentBook.pages as page, index (page.path)}
										<Tooltip.Root>
											<Tooltip.Trigger asChild>
												<button
													class="flex-shrink-0 rounded overflow-hidden border-2 {index ===
														bookStore.currentPageIndex
														? 'border-primary'
														: 'border-transparent'} hover:border-primary/50 transition-colors relative group"
													style="width: auto; height: {$bottomThumbnailBarHeight - 60}px; min-width: 60px; max-width: 120px;"
													onclick={() => bookStore.navigateToPage(index)}
												>
													{#if index in thumbnails}
														<img
															src={thumbnails[index].url}
															alt="Page {index + 1}"
															class="w-full h-full object-contain"
															style="object-position: center;"
														/>
													{:else}
														<div
															class="w-full h-full flex flex-col items-center justify-center bg-muted text-xs text-muted-foreground"
															style="min-width: 60px; max-width: 120px;"
														>
															<ImageIcon class="h-6 w-6 mb-1" />
															<span class="font-mono">{index + 1}</span>
														</div>
													{/if}

													<!-- 页码标签 -->
													<div
														class="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] text-center py-0.5 font-mono"
													>
														{index + 1}
													</div>
												</button>
											</Tooltip.Trigger>
											<Tooltip.Content>
												<p>第 {index + 1} 页</p>
											</Tooltip.Content>
										</Tooltip.Root>
									{/each}
								</div>
							</ScrollArea.Viewport>
							<ScrollArea.Scrollbar orientation="horizontal" class="flex h-2.5 touch-none select-none bg-transparent p-0.5 transition-colors">
								<ScrollArea.Thumb class="relative flex h-full flex-1 rounded-full bg-border hover:bg-primary/20" />
							</ScrollArea.Scrollbar>
						</ScrollArea.Root>
				</div>
			</Tabs.Content>

				<Tabs.Content value="settings" class="mt-2">
					<div class="px-4 py-2 space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium">钉住状态</span>
							<Button
								variant={$bottomThumbnailBarPinned ? 'default' : 'outline'}
								size="sm"
								onclick={togglePin}
							>
								{#if $bottomThumbnailBarPinned}
									<Pin class="h-3 w-3 mr-1" />
									已钉住
								{:else}
									<PinOff class="h-3 w-3 mr-1" />
									自动隐藏
								{/if}
							</Button>
						</div>
						<Separator.Root />
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium">独立窗口</span>
							<Tooltip.Root>
								<Tooltip.Trigger asChild>
									<Button variant="outline" size="sm" onclick={openInNewWindow}>
										<ExternalLink class="h-3 w-3 mr-1" />
										打开
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>在独立窗口中打开缩略图栏</p>
								</Tooltip.Content>
							</Tooltip.Root>
						</div>
					</div>
			</Tabs.Content>

				<Tabs.Content value="progress" class="mt-2">
					<div class="px-4 py-2 space-y-3">
						<div class="space-y-2">
							<div class="flex items-center justify-between text-sm">
								<span>阅读进度</span>
								<span class="font-mono">{bookStore.currentPageIndex + 1} / {bookStore.totalPages}</span>
							</div>
							<Progress.Root class="w-full h-2">
								<Progress.Progress value={((bookStore.currentPageIndex + 1) / bookStore.totalPages) * 100} />
							</Progress.Root>
						</div>
						<Separator.Root />
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium">显示进度条</span>
							<Button
								variant={showProgressBar ? 'default' : 'outline'}
								size="sm"
								onclick={toggleProgressBar}
							>
								{#if showProgressBar}
									<Minus class="h-3 w-3 mr-1" />
									显示中
								{:else}
									<Minus class="h-3 w-3 mr-1" />
									隐藏
								{/if}
							</Button>
						</div>
					</div>
			</Tabs.Content>
			</Tabs.Root>

			
		</div>
	
	<!-- 阅读进度条 -->
	{#if showProgressBar && bookStore.currentBook}
		<!-- 底部进度条 -->
		<div class="fixed bottom-0 left-0 right-0 h-1 z-[51] pointer-events-none">
			<Progress.Root class="h-full w-full">
				<Progress.Progress value={((bookStore.currentPageIndex + 1) / bookStore.currentBook.pages.length) * 100} class="h-full" />
			</Progress.Root>
		</div>
	{/if}
</div>
{/if}
