<script lang="ts">
	/**
	 * Bottom Thumbnail Bar
	 * 底部缩略图栏 - 自动隐藏，鼠标悬停显示
	 */
	import { bookStore } from '$lib/stores/book.svelte';
	import { loadImage } from '$lib/api/fs';
	import { loadImageFromArchive } from '$lib/api/filesystem';
	import { Image as ImageIcon } from '@lucide/svelte';

	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let thumbnails = $state<Record<number, string>>({});

	function showThumbnails() {
		isVisible = true;
		if (hideTimeout) clearTimeout(hideTimeout);
		loadVisibleThumbnails();
	}

	function handleMouseEnter() {
		showThumbnails();
	}

	function handleMouseLeave() {
		if (hideTimeout) clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			isVisible = false;
		}, 500) as unknown as number;
	}

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
	function generateThumbnailFromBase64(base64Data: string, maxSize: number = 128): Promise<string> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Cannot get canvas context'));
					return;
				}

				let width = img.width;
				let height = img.height;
				if (width > height) {
					if (width > maxSize) {
						height = (height * maxSize) / width;
						width = maxSize;
					}
				} else {
					if (height > maxSize) {
						width = (width * maxSize) / height;
						height = maxSize;
					}
				}

				canvas.width = width;
				canvas.height = height;
				ctx.drawImage(img, 0, 0, width, height);

				try {
					const thumbnailData = canvas.toDataURL('image/webp', 0.8);
					resolve(thumbnailData);
				} catch (err) {
					const thumbnailData = canvas.toDataURL('image/jpeg', 0.8);
					resolve(thumbnailData);
				}
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

			const thumbnail = await generateThumbnailFromBase64(fullImageData, 128);
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
</script>

{#if bookStore.currentBook}
	<!-- 缩略图栏触发区域（独立，位于状态栏上方） -->
	<div
		class="fixed bottom-6 left-0 right-0 h-3 z-[48]"
		onmouseenter={handleMouseEnter}
		role="presentation"
		aria-label="底部缩略图栏触发区域"
	></div>

	<!-- 缩略图栏内容 -->
	<div
		class="absolute bottom-6 left-0 right-0 z-50 transition-transform duration-300 {isVisible
			? 'translate-y-0'
			: 'translate-y-full'}"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
	>
		<div class="bg-secondary/95 backdrop-blur-sm border-t shadow-lg">
			<div class="p-2">
				<div class="flex gap-2 overflow-x-auto pb-1" onscroll={handleScroll}>
					{#each bookStore.currentBook.pages as page, index (page.path)}
						<button
							class="flex-shrink-0 w-20 h-28 rounded overflow-hidden border-2 {index ===
							bookStore.currentPageIndex
								? 'border-primary'
								: 'border-transparent'} hover:border-primary/50 transition-colors relative group"
							onclick={() => bookStore.navigateToPage(index)}
							title="Page {index + 1}"
						>
							{#if index in thumbnails}
								<img
									src={thumbnails[index]}
									alt="Page {index + 1}"
									class="w-full h-full object-cover"
								/>
							{:else}
								<div
									class="w-full h-full flex flex-col items-center justify-center bg-muted text-xs text-muted-foreground"
								>
									<ImageIcon class="h-6 w-6 mb-1" />
									<span class="font-mono">{index + 1}</span>
								</div>
							{/if}

							<!-- 页码标签 -->
							<div
								class="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] text-center py-0.5 font-mono opacity-0 group-hover:opacity-100 transition-opacity"
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
