<script lang="ts">
	/**
	 * Bottom Thumbnail Bar
	 * 底部缩略图栏 - 自动隐藏，鼠标悬停显示
	 */
	import { bookStore } from '$lib/stores/book.svelte';
import { loadImage } from '$lib/api/fs';
import { loadImageFromArchive } from '$lib/api/filesystem';
import toAssetUrl from '$lib/utils/assetProxy';
	import { bottomThumbnailBarPinned, bottomThumbnailBarHeight } from '$lib/stores';
	import { Button } from '$lib/components/ui/button';
	import * as Progress from '$lib/components/ui/progress';
	import { Image as ImageIcon, Pin, PinOff, GripHorizontal, ExternalLink, Minus, Target } from '@lucide/svelte';

	let isVisible = $state(false);
	let hideTimeout: number | undefined;
let thumbnails = $state<Record<number, {url: string, width: number, height: number}>>({});
let upscaledPages = $state<Set<number>>(new Set());
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;
	let showProgressBar = $state(true);
	let hoverCount = $state(0); // 追踪悬停区域的计数
	let showAreaOverlay = $state(false); // 显示区域覆盖层

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

	function toggleProgressBar() {
		showProgressBar = !showProgressBar;
		// 通知ImageViewer进度条状态变化
		window.dispatchEvent(new CustomEvent('progressBarStateChange', {
			detail: { show: showProgressBar }
		}));
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

async function loadVisibleThumbnails() {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		// 动态计算预加载范围，确保至少显示6页
		const preloadRange = Math.max(5, Math.floor(($bottomThumbnailBarHeight - 40) / 60)); // 基于高度计算
		const start = Math.max(0, bookStore.currentPageIndex - preloadRange);
		const end = Math.min(currentBook.pages.length - 1, bookStore.currentPageIndex + preloadRange);

		console.log(`Loading thumbnails from ${start} to ${end} (total: ${end - start + 1})`);

		for (let i = start; i <= end; i++) {
			if (!(i in thumbnails)) {
				loadThumbnail(i);
			}
		}
	}

// 直接使用已加载的完整图片URL并由CSS缩放展示（避免额外生成缩略图）
function toThumb(url: string | null, maxHeight: number = $bottomThumbnailBarHeight - 40): { url: string, width: number, height: number } {
    if (!url) return { url: '', width: 0, height: 0 };
    return { url, width: 0, height: maxHeight };
}

	async function loadThumbnail(pageIndex: number) {
		const currentBook = bookStore.currentBook;
		if (!currentBook || !currentBook.pages[pageIndex]) return;

    try {
        const page = currentBook.pages[pageIndex];
        let url: string | null = null;

        // 优先向 ImageViewer 请求该页已加载的图片数据
        url = await new Promise<string | null>((resolve) => {
            const cb = (data: string | null) => resolve(data || null);
            window.dispatchEvent(new CustomEvent('request-page-image-data', { detail: { index: pageIndex, callback: cb } }));
            // 如果 120ms 内未返回，后续会走回退加载
            setTimeout(() => resolve(null), 120);
        });

        // 回退：未命中则自行加载该页原图
        if (!url) {
            if (currentBook.type === 'archive') {
                url = await loadImageFromArchive(currentBook.path, page.path);
            } else {
                url = await loadImage(page.path);
            }
        }

        // 文件路径可转换为资产URL以利于多处复用
        if (url && !url.startsWith('blob:') && !url.startsWith('data:')) {
            url = toAssetUrl(url) || url;
        }

        const thumb = toThumb(url);
        thumbnails = { ...thumbnails, [pageIndex]: thumb };
    } catch (err) {
        console.error(`Failed to load thumbnail for page ${pageIndex}:`, err);
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
					loadThumbnail(i);
				}
			}
		});
	}

	// 清空缩略图缓存当书籍变化时
	$effect(() => {
    const currentBook = bookStore.currentBook;
    thumbnails = {};
    upscaledPages = new Set();
	});

	// 当高度变化时重新生成缩略图
	$effect(() => {
		const currentBook = bookStore.currentBook;
        if (currentBook && Object.keys(thumbnails).length > 0) {
            // 重新加载当前可见的缩略图以适应新高度
            loadVisibleThumbnails();
        }
    });

    // 监听已超分页索引集合变化，更新绿边显示
    $effect(() => {
        const handler = (e: CustomEvent) => {
            try {
                const arr = (e.detail && e.detail.indices) || [];
                upscaledPages = new Set(arr.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x)));
            } catch {}
        };
        window.addEventListener('upscaled-pages-changed', handler as EventListener);
        return () => window.removeEventListener('upscaled-pages-changed', handler as EventListener);
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
				<Button
					variant={showProgressBar ? 'default' : 'ghost'}
					size="sm"
					class="h-6"
					onclick={toggleProgressBar}
					title="显示阅读进度条"
				>
					<Minus class="h-3 w-3 mr-1" />
					<span class="text-xs">进度条</span>
				</Button>
				<Button
					variant={showAreaOverlay ? 'default' : 'ghost'}
					size="sm"
					class="h-6"
					onclick={toggleAreaOverlay}
					title="显示/隐藏6区域点击测试"
				>
					<Target class="h-3 w-3 mr-1" />
					<span class="text-xs">区域</span>
				</Button>
			</div>

			<div class="px-2 pb-2 h-[calc(100%-theme(spacing.8))] overflow-hidden">
				<div class="flex gap-2 overflow-x-auto h-full pb-1 items-center" onscroll={handleScroll}>
					{#each bookStore.currentBook.pages as page, index (page.path)}
						<button
							class="flex-shrink-0 rounded overflow-hidden border-2 {upscaledPages.has(index) ? 'border-green-500' : (index === bookStore.currentPageIndex ? 'border-primary' : 'border-transparent')} hover:border-primary/50 transition-colors relative group"
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
	
	<!-- 阅读进度条 -->
	{#if showProgressBar && bookStore.currentBook}
		<!-- 底部进度条 -->
		<div class="fixed bottom-0 left-0 right-0 h-1 z-[51] pointer-events-none">
			<Progress.Root 
				value={((bookStore.currentPageIndex + 1) / bookStore.currentBook.pages.length) * 100}
				class="h-full"
			>
				<Progress.Indicator class="h-full bg-primary transition-all duration-300" />
			</Progress.Root>
		</div>
	{/if}
</div>
{/if}
