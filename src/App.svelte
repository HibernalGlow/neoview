<script lang="ts">
	/**
	 * NeoView - Main App Component
	 * 主应用程序组件
	 */
	import MainLayout from '$lib/components/layout/MainLayout.svelte';
	import ImageViewer from '$lib/components/viewer/ImageViewer.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { open } from '@tauri-apps/plugin-dialog';
	import { bookStore, zoomIn, zoomOut, toggleLeftSidebar, toggleRightSidebar, toggleFullscreen, rotateClockwise, toggleViewMode, leftSidebarOpen, rightSidebarOpen, pageLeft, pageRight, topToolbarPinned, bottomThumbnailBarPinned, toggleReadingDirection, toggleSinglePanoramaView, toggleTemporaryFitZoom } from '$lib/stores';
	import { keyBindingsStore } from '$lib/stores/keybindings.svelte';
	import { FolderOpen } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';
	import { isVideoFile } from '$lib/utils/videoUtils';
	import { videoStore } from '$lib/stores/video.svelte';
	import { updateUpscaleSettings } from '$lib/utils/upscale/settings';
	import { deleteArchiveEntry } from '$lib/api/archive';
	// V3 缩略图系统（复刻 NeeView 架构）
	import { initThumbnailServiceV3, cleanup as cleanupThumbnailService } from '$lib/stores/thumbnailStoreV3.svelte';
	import Toast from '$lib/components/ui/toast.svelte';
	import { onMount } from 'svelte';

	let loading = $state(false);

async function handleDeleteCurrentArchivePage() {
	const book = bookStore.currentBook;
	if (!book || book.type !== 'archive') {
		console.warn('删除操作仅适用于压缩包书籍');
		return;
	}

	const currentPage = bookStore.currentPage;
	if (!currentPage) {
		console.warn('当前没有页面可删除');
		return;
	}

	const archivePath = book.path;
	const innerPath = currentPage.innerPath ?? currentPage.path;
	if (!innerPath) {
		console.warn('无法确定压缩包内路径，删除已取消');
		return;
	}

	const archiveSettings = settingsManager.getSettings().archive;
	if (!archiveSettings?.allowFileOperations) {
		alert('请先在设置 > 压缩包中启用“允许压缩包文件操作”。');
		return;
	}

	if (archiveSettings.confirmBeforeDelete) {
		const confirmed = confirm(`确定从压缩包中删除当前页面吗？\n文件：${currentPage.name}`);
		if (!confirmed) return;
	}

	try {
		await deleteArchiveEntry(archivePath, innerPath);
		await bookStore.reloadCurrentBook();
		console.info('✅ 压缩包页面已删除');
	} catch (error) {
		console.error('❌ 删除压缩包页面失败:', error);
		alert('删除失败，请查看控制台日志。');
	}
}

	// TODO: 缩略图功能已移除，待重新实现
	// 初始化缩略图管理器
	onMount(() => {
		// 字体管理器已在 main.ts 顶层初始化，无需在此重复初始化
		
		// 异步初始化缩略图
		(async () => {
			try {
				// V3 缩略图系统初始化
				const thumbnailPath = 'D:\\temp\\neoview';
				await initThumbnailServiceV3(thumbnailPath, 256);
				console.log('✅ ThumbnailServiceV3 初始化成功');
			} catch (error) {
				console.error('❌ 初始化失败:', error);
			}
		})();
	});

	async function handleOpenFolder() {
		try {
			loading = true;
			const selected = await open({
				directory: true,
				multiple: false,
				title: 'Select a folder to open'
			});

			if (selected) {
				await bookStore.openBook(selected);
			}
		} catch (error) {
			console.error('Failed to open folder:', error);
		} finally {
			loading = false;
		}
	}

// 全局按键处理：根据 keyBindingsStore 的配置查找操作并分发
function isTypingInInput(event: Event) {
	const el = event.target as HTMLElement | null;
	if (!el) return false;
	const tag = el.tagName?.toLowerCase();
	const editable = el.getAttribute && (el.getAttribute('contenteditable') === 'true');
	return tag === 'input' || tag === 'textarea' || editable;
}

function formatKeyCombo(e: KeyboardEvent) {
	const parts: string[] = [];
	if (e.ctrlKey) parts.push('Ctrl');
	if (e.shiftKey) parts.push('Shift');
	if (e.altKey) parts.push('Alt');

	// Map some special keys to consistent names used in keybindings
	const keyMap: Record<string, string> = {
		' ': 'Space',
		'+': 'Plus',
		'ArrowUp': 'ArrowUp',
		'ArrowDown': 'ArrowDown',
		'ArrowLeft': 'ArrowLeft',
		'ArrowRight': 'ArrowRight'
	};

	const keyName = keyMap[e.key] || e.key;
	parts.push(keyName);
	return parts.join('+');
}

async function dispatchAction(action: string) {
	console.log('执行操作:', action);
	
	// 添加调试信息
	// keyBindingsStore.debugBindings();
	
	// 如果当前是视频页，对部分导航动作做视频模式优先的重解释
	const currentPage = bookStore.currentPage;
	const isVideoPage = Boolean(
		currentPage && (isVideoFile(currentPage.name) || isVideoFile(currentPage.path))
	);

	if (isVideoPage) {
		// 如果启用了快进模式，将翻页操作映射为快进/快退
		// 统一方向：右/下一页 = 快进，左/上一页 = 快退（不受阅读方向影响）
		if (videoStore.seekMode) {
			switch (action) {
				case 'nextPage':
				case 'pageRight':
					action = 'videoSeekForward';
					break;
				case 'prevPage':
				case 'pageLeft':
					action = 'videoSeekBackward';
					break;
			}
		}
		
		switch (action) {
			case 'videoPlayPause': {
				console.log('执行视频 播放/暂停');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoPlayPause');
				break;
			}
			case 'videoSeekForward': {
				console.log('执行视频 快进10秒');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoSeekForward');
				break;
			}
			case 'videoSeekBackward': {
				console.log('执行视频 快退10秒');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoSeekBackward');
				break;
			}
			case 'videoToggleMute': {
				console.log('执行视频 静音切换');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoToggleMute');
				break;
			}
			case 'videoToggleLoopMode': {
				console.log('执行视频 循环模式切换');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoToggleLoopMode');
				break;
			}
			case 'videoVolumeUp': {
				console.log('执行视频 音量增加');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoVolumeUp');
				break;
			}
			case 'videoVolumeDown': {
				console.log('执行视频 音量降低');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoVolumeDown');
				break;
			}
			case 'videoSpeedUp': {
				console.log('执行视频 倍速增加');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoSpeedUp');
				break;
			}
			case 'videoSpeedDown': {
				console.log('执行视频 倍速降低');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoSpeedDown');
				break;
			}
			case 'videoSpeedToggle': {
				console.log('执行视频 倍速切换');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoSpeedToggle');
				break;
			}
			case 'videoSeekModeToggle': {
				console.log('执行视频 快进模式切换');
				const dispatchViewerAction = (viewerAction: string) => {
					if (typeof window !== 'undefined') {
						window.dispatchEvent(
							new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
						);
					}
				};
				dispatchViewerAction('videoSeekModeToggle');
				break;
			}
		}
	}

	const dispatchViewerAction = (viewerAction: string) => {
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('neoview-viewer-action', { detail: { action: viewerAction } })
			);
		}
	};

	switch (action) {
		case 'nextPage': {
			console.log('执行下一页操作');
			await pageRight();
			break;
		}
		case 'prevPage': {
			console.log('执行上一页操作');
			await pageLeft();
			break;
		}
		case 'firstPage':
			console.log('执行第一页操作');
			await bookStore.firstPage();
			break;
		case 'lastPage':
			console.log('执行最后一页操作');
			await bookStore.lastPage();
			break;
		case 'nextBook':
			console.log('执行下一个书籍操作');
			await bookStore.openNextBook();
			break;
		case 'prevBook':
			console.log('执行上一个书籍操作');
			await bookStore.openPreviousBook();
			break;
		case 'zoomIn':
			console.log('执行放大操作');
			zoomIn();
			break;
		case 'zoomOut':
			console.log('执行缩小操作');
			zoomOut();
			break;
		case 'fitWindow':
			console.log('执行适应窗口操作');
			dispatchApplyZoomMode('fit');
			break;
		case 'actualSize':
			console.log('执行实际大小操作');
			dispatchApplyZoomMode('original');
			break;
		case 'fullscreen':
			console.log('执行全屏操作');
			toggleFullscreen();
			break;
		case 'toggleLeftSidebar':
			console.log('执行切换左侧边栏操作');
			toggleLeftSidebar();
			break;
		case 'toggleRightSidebar':
			console.log('执行切换右侧边栏操作');
			toggleRightSidebar();
			break;
		case 'toggleBookMode':
			console.log('执行切换书籍模式操作');
			toggleViewMode();
			break;
		case 'toggleSinglePanoramaView':
			console.log('执行全景/单页视图互切操作');
			toggleSinglePanoramaView();
			break;
		case 'toggleTemporaryFitZoom':
			console.log('执行临时适应窗口缩放操作');
			toggleTemporaryFitZoom();
			break;
		case 'rotate':
			console.log('执行旋转操作');
			rotateClockwise();
			break;
		case 'toggleTopToolbarPin':
			console.log('执行顶部工具栏钉住切换');
			topToolbarPinned.update((p) => !p);
			break;
		case 'toggleBottomThumbnailBarPin':
			console.log('执行底部缩略图栏钉住切换');
			bottomThumbnailBarPinned.update((p) => !p);
			break;
		case 'toggleReadingDirection':
			console.log('执行阅读方向切换');
			toggleReadingDirection();
			break;
		case 'toggleAutoUpscale':
			console.log('执行自动超分开关切换');
			const settings = settingsManager.getSettings();
			const current = settings.image.enableSuperResolution ?? false;
			const next = !current;
			settingsManager.updateNestedSettings('image', {
				enableSuperResolution: next
			});
			updateUpscaleSettings({
				autoUpscaleEnabled: next,
				globalUpscaleEnabled: next,
				currentImageUpscaleEnabled: next
			});
			break;
		case 'openFile':
			console.log('执行打开文件操作');
			try {
				const selected = await open({ multiple: false });
				if (selected) await bookStore.openBook(selected as string);
			} catch (err) {
				console.error('openFile action failed', err);
			}
			break;
		case 'closeFile':
			console.log('执行关闭文件操作');
			await bookStore.closeFile();
			break;
		case 'deleteFile':
			console.log('执行删除文件操作');
			// 删除需要额外确认/实现，这里调用 bookStore.closeBook() 作为占位
			await bookStore.closeBook();
			break;
		case 'deleteCurrentPage':
			console.log('执行删除当前页操作');
			await handleDeleteCurrentArchivePage();
			break;
		case 'pageLeft': {
			console.log('执行向左翻页操作');
			const settings = settingsManager.getSettings();
			const readingDirection = settings.book.readingDirection;
			if (readingDirection === 'right-to-left') {
				// 右开模式下，逻辑上的“向左翻页”对应物理向右翻
				await pageRight();
			} else {
				await pageLeft();
			}
			break;
		}
		case 'pageRight': {
			console.log('执行向右翻页操作');
			const settings = settingsManager.getSettings();
			const readingDirection = settings.book.readingDirection;
			if (readingDirection === 'right-to-left') {
				// 右开模式下，逻辑上的“向右翻页”对应物理向左翻
				await pageLeft();
			} else {
				await pageRight();
			}
			break;
		}
		case 'toggleLayoutMode':
			console.log('布局模式切换已禁用');
			break;
		// 视频相关操作（已在 isVideoPage 块内处理）
		case 'videoPlayPause':
		case 'videoSeekForward':
		case 'videoSeekBackward':
		case 'videoToggleMute':
		case 'videoToggleLoopMode':
		case 'videoVolumeUp':
		case 'videoVolumeDown':
		case 'videoSpeedUp':
		case 'videoSpeedDown':
		case 'videoSpeedToggle':
		case 'videoSeekModeToggle':
			// 已在 isVideoPage 块内处理，这里只是防止 default 警告
			break;
		default:
			console.warn('未实现的快捷操作：', action);
		}
	}

function handleGlobalKeydown(e: KeyboardEvent) {
	// 不在输入框时响应
	if (isTypingInInput(e)) return;

	const combo = formatKeyCombo(e);
	console.log('按键按下:', combo); // 调试信息
	// 使用统一的按键组合查找逻辑（与绑定面板、ImageViewer 保持一致）
	const action = keyBindingsStore.findActionByKeyCombo(combo);
	console.log('找到的操作:', action); // 调试信息
	if (action) {
		e.preventDefault();
		dispatchAction(action);
	}
}



// 处理鼠标点击事件
function handleGlobalMouseClick(e: MouseEvent) {
	// 不在输入框时响应
	if (isTypingInInput(e)) return;

	// 检查点击是否在上下栏区域内
	const target = e.target as HTMLElement;
	const isInTopToolbar = target.closest('[data-top-toolbar]') !== null;
	const isInBottomBar = target.closest('[data-bottom-bar]') !== null;
	
	// 如果任一边栏打开，或点击在上下栏区域内，则不处理区域点击
	if ($leftSidebarOpen || $rightSidebarOpen || isInTopToolbar || isInBottomBar) {
		console.log('边栏已打开或点击在上下栏区域内，禁用全局区域点击响应', { 
			leftSidebarOpen: $leftSidebarOpen, 
			rightSidebarOpen: $rightSidebarOpen, 
			isInTopToolbar, 
			isInBottomBar,
			targetElement: target.tagName,
			targetClass: target.className
		});
		return;
	}

	const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';
	const clickType = e.detail === 2 ? 'double-click' : 'click';
	
	console.log('鼠标点击:', button, clickType); // 调试信息
	
	// 首先检查是否是区域点击
	const area = keyBindingsStore.calculateClickArea(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
	console.log('点击区域:', area); // 调试信息
	
	const areaAction = keyBindingsStore.findActionByAreaClick(area, button, clickType);
	if (areaAction) {
		console.log('找到的区域操作:', areaAction); // 调试信息
		e.preventDefault();
		dispatchAction(areaAction);
		return;
	}
	
	// 如果没有区域绑定，检查普通鼠标点击绑定
	const action = keyBindingsStore.findActionByMouseClick(button, clickType);
	console.log('找到的操作:', action); // 调试信息
	if (action) {
		e.preventDefault();
		dispatchAction(action);
	}
}

// 处理鼠标按下事件
function handleGlobalMouseDown(e: MouseEvent) {
	// 不在输入框时响应
	if (isTypingInInput(e)) return;

	// 检查点击是否在上下栏区域内
	const target = e.target as HTMLElement;
	const isInTopToolbar = target.closest('[data-top-toolbar]') !== null;
	const isInBottomBar = target.closest('[data-bottom-bar]') !== null;
	
	// 如果任一边栏打开，或点击在上下栏区域内，则不处理区域点击
	if ($leftSidebarOpen || $rightSidebarOpen || isInTopToolbar || isInBottomBar) {
		console.log('边栏已打开或点击在上下栏区域内，禁用全局区域按下响应', { 
			leftSidebarOpen: $leftSidebarOpen, 
			rightSidebarOpen: $rightSidebarOpen, 
			isInTopToolbar, 
			isInBottomBar,
			targetElement: target.tagName,
			targetClass: target.className
		});
		return;
	}

	const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';
	
	// 首先检查是否是区域点击
	const area = keyBindingsStore.calculateClickArea(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
	console.log('鼠标按下区域:', area); // 调试信息
	
	const areaAction = keyBindingsStore.findActionByAreaClick(area, button, 'press');
	if (areaAction) {
		console.log('找到的区域按下操作:', areaAction); // 调试信息
		e.preventDefault();
		dispatchAction(areaAction);
		return;
	}
	
	// 检查是否有按键绑定（不是手势）
	const action = keyBindingsStore.findActionByMouseGesture('press', button, 'press');
	console.log('鼠标按下:', button, '找到的操作:', action); // 调试信息
	if (action) {
		e.preventDefault();
		dispatchAction(action);
	}
}
</script>

<svelte:window 
	onkeydown={handleGlobalKeydown}
	onclick={handleGlobalMouseClick}
	onmousedown={handleGlobalMouseDown}
/>

<Tooltip.Provider>
	<Toast />
	
	<!-- 仅使用传统布局模式，禁用 Flow 画布以提升性能 -->
	<MainLayout>
		<div class="flex h-full w-full items-center justify-center">
			<div class="text-center">
				<h1 class="mb-4 text-4xl font-bold">NeoView</h1>
				<p class="text-muted-foreground mb-8">Modern Image & Comic Viewer</p>
				<Button onclick={handleOpenFolder} disabled={loading} size="lg">
					<FolderOpen class="mr-2 h-5 w-5" />
					{loading ? 'Opening...' : 'Open Folder'}
				</Button>
			</div>
		</div>
	</MainLayout>
</Tooltip.Provider>
