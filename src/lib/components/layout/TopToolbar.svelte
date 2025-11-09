<script lang="ts">
	/**
	 * Top Toolbar Component
	 * 顶部工具栏 - 自动隐藏，包含标题栏、面包屑和图片操作按钮
	 */
	import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import { bookStore } from '$lib/stores/book.svelte';
	import { 
		zoomLevel, 
		zoomIn, 
		zoomOut, 
		resetZoom, 
		rotateClockwise,
		rotationAngle,
		viewMode,
		toggleViewMode,
		toggleSidebar,
		toggleRightSidebar
	} from '$lib/stores';
	import PathBar from '../ui/PathBar.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		ZoomIn,
		ZoomOut,
		RotateCw,
		PanelLeft,
		Grid,
		Maximize2,
		X,
		Folder,
		FileArchive,
		Menu,
		Minimize,
		Maximize,
		Settings,
		PanelRightOpen
	} from '@lucide/svelte';

	const appWindow = getCurrentWebviewWindow();
	
	let isVisible = $state(false);
	let hideTimeout: number | undefined;

	function showToolbar() {
		isVisible = true;
		if (hideTimeout) clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			isVisible = false;
		}, 2000) as unknown as number;
	}

	function handleMouseEnter() {
		showToolbar();
	}

	function handleMouseLeave() {
		if (hideTimeout) clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			isVisible = false;
		}, 500) as unknown as number;
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

	function handleClose() {
		bookStore.closeBook();
	}

	async function openSettings() {
		try {
			const existingWindow = await WebviewWindow.getByLabel('settings');
			if (existingWindow) {
				await existingWindow.setFocus();
				return;
			}
		} catch (e) {}

		try {
			const settingsWindow = new WebviewWindow('settings', {
				url: '/settings.html',
				title: '设置',
				width: 900,
				height: 700,
				center: true,
				resizable: true,
				decorations: false
			});
		} catch (error) {
			console.error('Failed to create settings window:', error);
		}
	}

	async function minimizeWindow() {
		await appWindow.minimize();
	}

	async function maximizeWindow() {
		await appWindow.toggleMaximize();
	}

	async function closeWindow() {
		await appWindow.close();
	}
</script>

<div
	class="absolute top-0 left-0 right-0 z-50 transition-transform duration-300 {isVisible
		? 'translate-y-0'
		: '-translate-y-full'}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<!-- 标题栏（窗口控制） -->
	<div
		data-tauri-drag-region
		class="h-8 bg-secondary/95 backdrop-blur-sm flex items-center justify-between px-2 select-none border-b"
	>
		<!-- 左侧：菜单和应用名 -->
		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={toggleSidebar}>
				<Menu class="h-4 w-4" />
			</Button>
			<span class="text-sm font-semibold ml-2">NeoView</span>
		</div>

		<!-- 中间：功能按钮 -->
		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={toggleRightSidebar} title="右侧边栏">
				<PanelRightOpen class="h-4 w-4" />
			</Button>
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={openSettings} title="设置">
				<Settings class="h-4 w-4" />
			</Button>
		</div>

		<!-- 右侧：窗口控制按钮 -->
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

	<!-- 工具栏（图片操作） -->
	<div class="bg-secondary/95 backdrop-blur-sm border-b shadow-lg">
		<div class="px-4 py-2 flex items-center justify-between gap-4">
			<!-- 左侧：关闭按钮 + 面包屑导航 -->
			<div class="flex items-center gap-2 flex-1 min-w-0">
				<Button variant="ghost" size="icon" class="h-8 w-8 flex-shrink-0" onclick={handleClose}>
					<X class="h-4 w-4" />
				</Button>

				{#if bookStore.currentBook}
					<div class="flex-1 min-w-0">
						<PathBar
							currentPath={bookStore.currentBook.path}
							isArchive={bookStore.currentBook.type === 'archive'}
						/>
					</div>
				{/if}
			</div>

			<!-- 中间：页码信息 -->
			{#if bookStore.currentBook}
				<div class="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
					{#if bookStore.currentBook.type === 'archive'}
						<FileArchive class="h-3 w-3" />
					{:else}
						<Folder class="h-3 w-3" />
					{/if}
					<span>
						{bookStore.currentPageIndex + 1} / {bookStore.totalPages}
					</span>
				</div>
			{/if}

			<!-- 右侧：图片操作按钮 -->
			<div class="flex items-center gap-1 flex-shrink-0">
				<!-- 导航按钮 -->
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

				<!-- 分隔线 -->
				<div class="w-px h-6 bg-border mx-1"></div>

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
					variant="ghost"
					size="icon"
					class="h-8 w-8"
					onclick={toggleViewMode}
					title="切换视图模式: {$viewMode === 'single'
						? '单页'
						: $viewMode === 'double'
							? '双页'
							: '全景'}"
				>
					{#if $viewMode === 'single'}
						<PanelLeft class="h-4 w-4" />
					{:else if $viewMode === 'double'}
						<Grid class="h-4 w-4" />
					{:else}
						<Maximize2 class="h-4 w-4" />
					{/if}
				</Button>

				<!-- 旋转按钮 -->
				<Button variant="ghost" size="icon" class="h-8 w-8" onclick={rotateClockwise} title="旋转 90°">
					<RotateCw class="h-4 w-4" />
				</Button>
			</div>
		</div>
	</div>
</div>

<!-- 触发区域（独立于工具栏，始终存在） -->
<div
	class="fixed top-0 left-0 right-0 h-4 z-[49]"
	onmouseenter={handleMouseEnter}
	role="presentation"
	aria-label="顶部工具栏触发区域"
></div>
