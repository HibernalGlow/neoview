<script lang="ts">
	/**
	 * Standalone Viewer Component
	 * 独立查看器组件 - 用于显示图片查看器的独立窗口
	 */
	import { onMount } from 'svelte';
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import { X, Minimize, Maximize } from '@lucide/svelte';
	import ImageViewer from '$lib/components/viewer/ImageViewer.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { 
		zoomLevel, 
		zoomIn, 
		zoomOut, 
		resetZoom, 
		rotateClockwise,
		rotationAngle,
		viewMode,
		setViewMode,
		toggleViewMode
	} from '$lib/stores';
	import {
		ChevronLeft,
		ChevronRight,
		ZoomIn,
		ZoomOut,
		RotateCw,
		RectangleVertical,
		Columns2,
		PanelsTopLeft
	} from '@lucide/svelte';

	const appWindow = getCurrentWebviewWindow();

	onMount(() => {
		// 设置窗口标题
		appWindow.setTitle('NeoView 独立查看器');
	});

	async function minimizeWindow() {
		await appWindow.minimize();
	}

	async function maximizeWindow() {
		await appWindow.toggleMaximize();
	}

	async function closeWindow() {
		await appWindow.close();
	}

	async function handlePreviousPage() {
		if (!bookStore.canPreviousPage) return;
		try {
			if ($viewMode === 'double') {
				const currentIndex = bookStore.currentPageIndex;
				const targetIndex = Math.max(currentIndex - 2, 0);
				await bookStore.navigateToPage(targetIndex);
			} else {
				await bookStore.previousPage();
			}
		} catch (err) {
			console.error('Failed to navigate to previous page:', err);
		}
	}

	async function handleNextPage() {
		if (!bookStore.canNextPage) return;
		try {
			if ($viewMode === 'double') {
				const currentIndex = bookStore.currentPageIndex;
				const targetIndex = Math.min(currentIndex + 2, bookStore.totalPages - 1);
				await bookStore.navigateToPage(targetIndex);
			} else {
				await bookStore.nextPage();
			}
		} catch (err) {
			console.error('Failed to navigate to next page:', err);
		}
	}
</script>

<svelte:head>
	<title>NeoView 独立查看器</title>
</svelte:head>

<div class="fixed inset-0 flex flex-col bg-background">
	<!-- 标题栏 -->
	<div class="h-8 bg-secondary/95 backdrop-blur-sm flex items-center justify-between px-2 select-none border-b">
		<span class="text-sm font-semibold">NeoView 独立查看器</span>
		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={minimizeWindow}>
				<Minimize class="h-3 w-3" />
			</Button>
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={maximizeWindow}>
				<Maximize class="h-3 w-3" />
			</Button>
			<Button variant="ghost" size="icon" class="h-6 w-6 hover:bg-destructive" onclick={closeWindow}>
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- 工具栏 -->
	{#if bookStore.currentBook}
		<div class="bg-secondary/95 backdrop-blur-sm border-b px-4 py-2 flex items-center justify-between gap-4">
			<!-- 左侧：导航按钮 -->
			<div class="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					class="h-8 w-8"
					onclick={handlePreviousPage}
					disabled={!bookStore.canPreviousPage}
					title="上一页"
				>
					<ChevronLeft class="h-4 w-4" />
				</Button>

				<Button
					variant="ghost"
					size="icon"
					class="h-8 w-8"
					onclick={handleNextPage}
					disabled={!bookStore.canNextPage}
					title="下一页"
				>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</div>

			<!-- 中间：页码信息 -->
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				<span>
					{bookStore.currentPageIndex + 1} / {bookStore.totalPages}
				</span>
			</div>

			<!-- 右侧：图片操作按钮 -->
			<div class="flex items-center gap-1">
				<!-- 缩放按钮 -->
				<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomOut} title="缩小">
					<ZoomOut class="h-4 w-4" />
				</Button>

				<Button
					variant="ghost"
					size="sm"
					class="h-8 px-2 font-mono text-xs"
					onclick={resetZoom}
					title="重置缩放"
				>
					{($zoomLevel * 100).toFixed(0)}%
				</Button>

				<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomIn} title="放大">
					<ZoomIn class="h-4 w-4" />
				</Button>

				<!-- 分隔线 -->
				<div class="w-px h-6 bg-border mx-1"></div>

				<!-- 视图模式切换 -->
				<Button
					variant={$viewMode === 'single' ? 'default' : 'ghost'}
					size="icon"
					class="h-8 w-8"
					onclick={() => setViewMode('single')}
					title="单页模式"
				>
					<RectangleVertical class="h-4 w-4" />
				</Button>

				<Button
					variant={$viewMode === 'double' ? 'default' : 'ghost'}
					size="icon"
					class="h-8 w-8"
					onclick={() => setViewMode('double')}
					title="双页模式"
				>
					<Columns2 class="h-4 w-4" />
				</Button>

				<Button
					variant={$viewMode === 'panorama' ? 'default' : 'ghost'}
					size="icon"
					class="h-8 w-8"
					onclick={() => setViewMode('panorama')}
					title="全景模式"
				>
					<PanelsTopLeft class="h-4 w-4" />
				</Button>

				<!-- 分隔线 -->
				<div class="w-px h-6 bg-border mx-1"></div>

				<!-- 旋转按钮 -->
				<Button variant="ghost" size="icon" class="h-8 w-8" onclick={rotateClockwise} title="旋转 90°">
					<RotateCw class="h-4 w-4" />
				</Button>
			</div>
		</div>
	{/if}

	<!-- 内容区域 -->
	<div class="flex-1 overflow-hidden">
		<ImageViewer />
	</div>
</div>