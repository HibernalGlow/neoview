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
	import { Image as ImageIcon, Pin, PinOff, GripHorizontal, ExternalLink } from '@lucide/svelte';

	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let thumbnails = $state<Record<number, {url: string, width: number, height: number}>>({});
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;

	// 响应钉住状态
	$effect(() => {
		if ($bottomThumbnailBarPinned) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
		}
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
	>
		<div class="bg-secondary/95 backdrop-blur-sm border-t shadow-lg overflow-hidden" style="height: {$bottomThumbnailBarHeight}px;">
			<!-- 拖拽手柄 -->
			<div
				class="h-2 flex items-center justify-center cursor-ns-resize hover:bg-primary/20 transition-colors"
				onmousedown={handleResizeStart}
				role="separator"
				aria-label="拖拽调整缩略图栏高度"
				tabindex="0"
			>
				<GripHorizontal class="h-3 w-3 text-muted-foreground" />
			</div>

			<!-- 控制按钮 -->
			<div class="px-2 pb-1 flex justify-center gap-2">
				<Button
					variant={$bottomThumbnailBarPinned ? 'default' : 'ghost'}
					size="sm"
					class="h-6"
					onclick={togglePin}
				>
					{#if $bottomThumbnailBarPinned}
						<Pin class="h-3 w-3 mr-1" />
					{:else}
						<PinOff class="h-3 w-3 mr-1" />
					{/if}
					<span class="text-xs">{$bottomThumbnailBarPinned ? '已钉住' : '钉住'}</span>
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="h-6"
					onclick={openInNewWindow}
					title="在独立窗口中打开"
				>
					<ExternalLink class="h-3 w-3 mr-1" />
					<span class="text-xs">独立窗口</span>
				</Button>
			</div>

			<div class="px-2 pb-2 h-[calc(100%-theme(spacing.8))] overflow-hidden">
				<div class="flex gap-2 overflow-x-auto h-full pb-1 items-center" onscroll={handleScroll}>
					{#each bookStore.currentBook.pages as page, index (page.path)}
						<button
							class="flex-shrink-0 rounded overflow-hidden border-2 {index ===
							bookStore.currentPageIndex
								? 'border-primary'
								: 'border-transparent'} hover:border-primary/50 transition-colors relative group"
							style="width: auto; height: {$bottomThumbnailBarHeight - 40}px; min-width: 60px; max-width: 120px;"
							onclick={() => bookStore.navigateToPage(index)}
							title="Page {index + 1}"
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
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}
