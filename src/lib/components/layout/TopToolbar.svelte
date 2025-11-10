<script lang="ts">
	/**
	 * Top Toolbar Component
	 * 顶部工具栏 - 自动隐藏，包含标题栏、面包屑和图片操作按钮
	 */
	import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Progress from '$lib/components/ui/progress';
	
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
		toggleViewMode,
		toggleSidebar,
		topToolbarPinned,
		topToolbarHeight
	} from '$lib/stores';
	import PathBar from '../ui/PathBar.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		ZoomIn,
		ZoomOut,
		RotateCw,
		RectangleVertical,
		Columns2,
		PanelsTopLeft,
		X,
		Folder,
		FileArchive,
		Menu,
		Minimize,
		Maximize,
		Settings,
		Pin,
		PinOff,
		GripHorizontal,
		ExternalLink,
		Eye
	} from '@lucide/svelte';

	const appWindow = getCurrentWebviewWindow();
	
	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;

	// 响应钉住状态
	$effect(() => {
		if ($topToolbarPinned) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
		}
	});

	function showToolbar() {
		isVisible = true;
		if (hideTimeout) clearTimeout(hideTimeout);
		if (!$topToolbarPinned) {
			hideTimeout = setTimeout(() => {
				isVisible = false;
			}, 2000) as unknown as number;
		}
	}

	function handleMouseEnter() {
		showToolbar();
	}

	function handleMouseLeave() {
		if ($topToolbarPinned || isResizing) return;
		if (hideTimeout) clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			isVisible = false;
		}, 500) as unknown as number;
	}

	function togglePin() {
		topToolbarPinned.update(p => !p);
	}

	function handleResizeStart(e: MouseEvent) {
		isResizing = true;
		resizeStartY = e.clientY;
		resizeStartHeight = $topToolbarHeight;
		e.preventDefault();
	}

	function handleResizeMove(e: MouseEvent) {
		if (!isResizing) return;
		const deltaY = e.clientY - resizeStartY;
		const newHeight = Math.max(80, Math.min(400, resizeStartHeight + deltaY));
		topToolbarHeight.set(newHeight);
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

	function openStandaloneViewer() {
		const url = `${window.location.origin}/standalone/viewer`;
		const features = 'width=1200,height=800,resizable=yes,scrollbars=yes,status=yes,toolbar=no,menubar=no,location=no';
		window.open(url, 'NeoView 独立查看器', features);
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
			<!-- 钉住按钮 -->
			<Button
				variant={$topToolbarPinned ? 'default' : 'ghost'}
				size="icon"
				class="h-6 w-6"
				onclick={togglePin}
				title={$topToolbarPinned ? '松开工具栏（自动隐藏）' : '钉住工具栏（始终显示）'}
			>
				{#if $topToolbarPinned}
					<Pin class="h-4 w-4" />
				{:else}
					<PinOff class="h-4 w-4" />
				{/if}
			</Button>

			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={openSettings} title="设置">
				<Settings class="h-4 w-4" />
			</Button>

			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={openStandaloneViewer} title="在独立窗口中打开查看器">
				<ExternalLink class="h-4 w-4" />
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
	<div class="bg-secondary/95 backdrop-blur-sm border-b shadow-lg overflow-hidden" style="height: {$topToolbarHeight}px;">
		<div class="px-4 py-2 flex items-center justify-between gap-4 h-full overflow-y-auto">
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

			<!-- 中间：页码信息和进度 -->
			{#if bookStore.currentBook}
				<div class="flex items-center gap-3 text-sm text-muted-foreground whitespace-nowrap">
					{#if bookStore.currentBook.type === 'archive'}
						<FileArchive class="h-3 w-3" />
					{:else}
						<Folder class="h-3 w-3" />
					{/if}
					<span class="font-mono text-xs">
						{bookStore.currentPageIndex + 1} / {bookStore.totalPages}
					</span>
					<Progress.Root class="w-20 h-2">
						<Progress.Progress value={((bookStore.currentPageIndex + 1) / bookStore.totalPages) * 100} />
					</Progress.Root>
				</div>
			{/if}

			<!-- 右侧：图片操作按钮 -->
			<div class="flex items-center gap-1 flex-shrink-0">
				<!-- 导航按钮 -->
				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							onclick={handlePreviousPage}
							disabled={!bookStore.canPreviousPage}
						>
							<ChevronLeft class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>上一页</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							onclick={handleNextPage}
							disabled={!bookStore.canNextPage}
						>
							<ChevronRight class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>下一页</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<!-- 分隔线 -->
				<Separator.Root orientation="vertical" class="h-6 mx-1" />

				<!-- 缩放按钮 -->
				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomOut}>
							<ZoomOut class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>缩小</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<Button
							variant="ghost"
							size="sm"
							class="h-8 px-2 font-mono text-xs"
							onclick={resetZoom}
						>
							{($zoomLevel * 100).toFixed(0)}%
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>重置缩放</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomIn}>
							<ZoomIn class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>放大</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<!-- 分隔线 -->
				<Separator.Root orientation="vertical" class="h-6 mx-1" />

				<!-- 视图模式切换 - 下拉菜单 -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger asChild>
						<Button variant="outline" size="sm" class="h-8 px-3">
							<Eye class="h-4 w-4 mr-2" />
							{#if $viewMode === 'single'}单页{:else if $viewMode === 'double'}双页{:else}全景{/if}
						</Button>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="w-48">
						<DropdownMenu.Item onclick={() => setViewMode('single')} class={$viewMode === 'single' ? 'bg-accent' : ''}>
							<RectangleVertical class="h-4 w-4 mr-2" />
							<span>单页模式</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setViewMode('double')} class={$viewMode === 'double' ? 'bg-accent' : ''}>
							<Columns2 class="h-4 w-4 mr-2" />
							<span>双页模式</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setViewMode('panorama')} class={$viewMode === 'panorama' ? 'bg-accent' : ''}>
							<PanelsTopLeft class="h-4 w-4 mr-2" />
							<span>全景模式</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<!-- 分隔线 -->
				<Separator.Root orientation="vertical" class="h-6 mx-1" />

				<!-- 旋转按钮 -->
				<Tooltip.Root>
					<Tooltip.Trigger asChild>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={rotateClockwise}>
							<RotateCw class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>旋转 90°</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
		</div>

		<!-- 拖拽手柄 -->
		<div
			class="h-2 flex items-center justify-center cursor-ns-resize hover:bg-primary/20 transition-colors"
			onmousedown={handleResizeStart}
			role="separator"
			aria-label="拖拽调整工具栏高度"
			tabindex="0"
		>
			<GripHorizontal class="h-3 w-3 text-muted-foreground" />
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
