<script lang="ts">
	/**
	 * NeoView - Main App Component
	 * 主应用程序组件
	 */
	import MainLayout from '$lib/components/layout/MainLayout.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyTitle
	} from '$lib/components/ui/empty';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { open } from '@tauri-apps/plugin-dialog';
	import {
		bookStore,
		zoomIn,
		zoomOut,
		toggleLeftSidebar,
		toggleRightSidebar,
		toggleFullscreen,
		rotateClockwise,
		toggleViewMode,
		leftSidebarOpen,
		rightSidebarOpen,
		pageLeft,
		pageRight,
		topToolbarPinned,
		bottomThumbnailBarPinned,
		toggleReadingDirection,
		toggleSinglePanoramaView,
		toggleTemporaryFitZoom
	} from '$lib/stores';
	import { keyBindingsStore } from '$lib/stores/keybindings.svelte';
	import { FolderOpen, Eye, EyeOff, ImageUp, X } from '@lucide/svelte';
	import ProjectCard from '$lib/components/ui/ProjectCard.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';
	import { isVideoFile } from '$lib/utils/videoUtils';
	import { videoStore } from '$lib/stores/video.svelte';
	import { updateUpscaleSettings } from '$lib/utils/upscale/settings';
	import { deleteArchiveEntry } from '$lib/api/archive';
	// V3 缩略图系统（复刻 NeeView 架构）
	import {
		initThumbnailServiceV3,
		cleanup as cleanupThumbnailService
	} from '$lib/stores/thumbnailStoreV3.svelte';
	import Toast from '$lib/components/ui/toast.svelte';
	import GlobalConfirmDialog from '$lib/components/ui/GlobalConfirmDialog.svelte';
	import { confirm as confirmDialog } from '$lib/stores/confirmDialog.svelte';
	import { showInfoToast, showErrorToast } from '$lib/utils/toast';
	import SettingsOverlay from '$lib/components/SettingsOverlay.svelte';
	import { settingsOverlayOpen } from '$lib/stores/settingsOverlay.svelte';
	import { onMount } from 'svelte';
	import { getMatches } from '@tauri-apps/plugin-cli';
	import { getFileMetadata } from '$lib/api/filesystem';
	import { openFileSystemItem } from '$lib/utils/navigationUtils';

	let loading = $state(false);

	// 卡片显示/隐藏状态
	let showProjectCard = $state(true);
	// 背景图片URL
	let backgroundImageUrl = $state<string | null>(null);
	// 隐藏的文件输入引用
	let fileInputRef: HTMLInputElement | null = null;

	// 从 localStorage 加载设置
	function loadEmptySettings() {
		try {
			const saved = localStorage.getItem('neoview-empty-settings');
			if (saved) {
				const settings = JSON.parse(saved);
				showProjectCard = settings.showProjectCard ?? true;
				backgroundImageUrl = settings.backgroundImageUrl ?? null;
			}
		} catch (e) {
			console.error('加载空页面设置失败:', e);
		}
	}

	// 保存设置到 localStorage
	function saveEmptySettings() {
		try {
			localStorage.setItem(
				'neoview-empty-settings',
				JSON.stringify({
					showProjectCard,
					backgroundImageUrl
				})
			);
		} catch (e) {
			console.error('保存空页面设置失败:', e);
		}
	}

	// 切换卡片显示
	function toggleProjectCard() {
		showProjectCard = !showProjectCard;
		saveEmptySettings();
	}

	// 处理背景图片上传
	function handleBackgroundUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			backgroundImageUrl = e.target?.result as string;
			saveEmptySettings();
		};
		reader.readAsDataURL(file);
	}

	// 清除背景图片
	function clearBackgroundImage() {
		backgroundImageUrl = null;
		saveEmptySettings();
	}

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
			showInfoToast('请先启用压缩包操作', '设置 > 压缩包 > 允许压缩包文件操作');
			return;
		}

		if (archiveSettings.confirmBeforeDelete) {
			const confirmed = await confirmDialog({
				title: '确定从压缩包中删除当前页面',
				description: `文件：${currentPage.name}`,
				confirmText: '删除',
				cancelText: '取消',
				variant: 'destructive'
			});
			if (!confirmed) return;
		}

		try {
			await deleteArchiveEntry(archivePath, innerPath);
			await bookStore.reloadCurrentBook();
			console.info('✅ 压缩包页面已删除');
		} catch (error) {
			console.error('❌ 删除压缩包页面失败:', error);
			showErrorToast('删除失败', '请查看控制台日志');
		}
	}

	// 初始化缩略图管理器和处理 CLI 启动参数
	onMount(async () => {
		// 加载空页面设置
		loadEmptySettings();
		try {
			// V3 缩略图系统初始化
			const thumbnailPath = 'D:\\temp\\neoview';
			await initThumbnailServiceV3(thumbnailPath, 256);
			console.log('✅ ThumbnailServiceV3 初始化成功');
		} catch (error) {
			console.error('❌ 缩略图初始化失败:', error);
		}

		// CLI 启动参数处理（类似 NeeView 的 FirstLoader）
		try {
			const matches = await getMatches();
			const arg = matches.args?.path?.value as string | string[] | undefined;
			const cliPath =
				typeof arg === 'string' ? arg : Array.isArray(arg) && arg.length > 0 ? arg[0] : undefined;

			if (cliPath) {
				console.log('📂 CLI 启动: 打开路径:', cliPath);
				const meta = await getFileMetadata(cliPath);
				console.log('📂 CLI 启动: 文件元数据:', meta);
				// 强制在应用内打开，不使用系统默认程序
				await openFileSystemItem(cliPath, meta.isDir, { forceInApp: true });
			}
		} catch (error) {
			console.error('❌ CLI 启动失败:', error);
		}

		// 语音命令事件监听器
		const handleVoiceCommand = (event: CustomEvent<{ action: string; transcript: string }>) => {
			const { action, transcript } = event.detail;
			console.log(`🎤 语音命令: "${transcript}" -> ${action}`);
			dispatchAction(action);
		};

		window.addEventListener('neoview-voice-command', handleVoiceCommand as EventListener);

		// 返回清理函数
		return () => {
			window.removeEventListener('neoview-voice-command', handleVoiceCommand as EventListener);
		};
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
		const editable = el.getAttribute && el.getAttribute('contenteditable') === 'true';
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
			ArrowUp: 'ArrowUp',
			ArrowDown: 'ArrowDown',
			ArrowLeft: 'ArrowLeft',
			ArrowRight: 'ArrowRight'
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
		// 设置覆盖层打开时不响应全局快捷键
		if ($settingsOverlayOpen) return;
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
		// 设置覆盖层打开时不响应
		if ($settingsOverlayOpen) return;
		// 不在输入框时响应
		if (isTypingInInput(e)) return;

		// 检查点击是否在上下栏区域内
		const target = e.target as HTMLElement;
		const isInTopToolbar = target.closest('[data-top-toolbar]') !== null;
		const isInBottomBar = target.closest('[data-bottom-bar]') !== null;

		// 如果任一边栏打开，或点击在上下栏区域内，则不处理区域点击
		if ($leftSidebarOpen || $rightSidebarOpen || isInTopToolbar || isInBottomBar) {
			// console.log('边栏已打开或点击在上下栏区域内，禁用全局区域点击响应', {
			// 	leftSidebarOpen: $leftSidebarOpen,
			// 	rightSidebarOpen: $rightSidebarOpen,
			// 	isInTopToolbar,
			// 	isInBottomBar,
			// 	targetElement: target.tagName,
			// 	targetClass: target.className
			// });
			return;
		}

		const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';
		const clickType = e.detail === 2 ? 'double-click' : 'click';

		console.log('鼠标点击:', button, clickType); // 调试信息

		// 首先检查是否是区域点击
		const area = keyBindingsStore.calculateClickArea(
			e.clientX,
			e.clientY,
			window.innerWidth,
			window.innerHeight
		);
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
		// 设置覆盖层打开时不响应
		if ($settingsOverlayOpen) return;
		// 不在输入框时响应
		if (isTypingInInput(e)) return;

		// 检查点击是否在上下栏区域内
		const target = e.target as HTMLElement;
		const isInTopToolbar = target.closest('[data-top-toolbar]') !== null;
		const isInBottomBar = target.closest('[data-bottom-bar]') !== null;

		// 如果任一边栏打开，或点击在上下栏区域内，则不处理区域点击
		if ($leftSidebarOpen || $rightSidebarOpen || isInTopToolbar || isInBottomBar) {
			// console.log('边栏已打开或点击在上下栏区域内，禁用全局区域按下响应', {
			// 	leftSidebarOpen: $leftSidebarOpen,
			// 	rightSidebarOpen: $rightSidebarOpen,
			// 	isInTopToolbar,
			// 	isInBottomBar,
			// 	targetElement: target.tagName,
			// 	targetClass: target.className
			// });
			return;
		}

		const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';

		// 首先检查是否是区域点击
		const area = keyBindingsStore.calculateClickArea(
			e.clientX,
			e.clientY,
			window.innerWidth,
			window.innerHeight
		);
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
	<GlobalConfirmDialog />
	<SettingsOverlay />

	<!-- 仅使用传统布局模式，禁用 Flow 画布以提升性能 -->
	<MainLayout>
		<Empty class="relative h-full w-full border-0">
			<!-- 自定义背景图片 -->
			{#if backgroundImageUrl}
				<div
					class="pointer-events-none absolute inset-0 z-0 h-full w-full bg-cover bg-center bg-no-repeat"
					style="background-image: url({backgroundImageUrl});"
				></div>
			{:else}
				<!-- 网点背景 -->
				<div
					class="pointer-events-none absolute inset-0 z-0 h-full w-full bg-[radial-gradient(#00000026_1px,transparent_1px)] [background-size:20px_20px] dark:bg-[radial-gradient(#ffffff26_1px,transparent_1px)]"
				></div>
			{/if}
			<!-- <EmptyHeader>
				<EmptyTitle class="mb-4 text-4xl font-bold">NeoView</EmptyTitle>
				<EmptyDescription class="mb-6 text-base">Modern Image & Comic Viewer</EmptyDescription>
			</EmptyHeader> -->
			<EmptyContent class="relative z-10">
				<!-- 项目卡片 - 隐藏时变透明，保持布局 -->
				<ProjectCard class="mb-6 transition-opacity duration-300 {showProjectCard ? 'opacity-100' : 'opacity-0 pointer-events-none'}" />

				<!-- 控制按钮组 - 默认隐藏，悬停显示 -->
				<div class="empty-controls opacity-0 transition-opacity duration-300 hover:opacity-100 flex items-center gap-2">
					<!-- 隐藏/显示卡片按钮 -->
					<button
						onclick={toggleProjectCard}
						class="empty-control-btn h-9 w-9 rounded-lg flex items-center justify-center transition-all hover:scale-105"
						title={showProjectCard ? '隐藏卡片' : '显示卡片'}
					>
						{#if showProjectCard}
							<EyeOff class="h-4 w-4" />
						{:else}
							<Eye class="h-4 w-4" />
						{/if}
					</button>

					<!-- 上传背景图按钮 -->
					<button
						onclick={() => fileInputRef?.click()}
						class="empty-control-btn h-9 w-9 rounded-lg flex items-center justify-center transition-all hover:scale-105"
						title="上传背景图"
					>
						<ImageUp class="h-4 w-4" />
					</button>

					<!-- 清除背景图按钮（仅当有背景图时显示） -->
					{#if backgroundImageUrl}
						<button
							onclick={clearBackgroundImage}
							class="empty-control-btn h-9 w-9 rounded-lg flex items-center justify-center transition-all hover:scale-105"
							title="清除背景图"
						>
							<X class="h-4 w-4" />
						</button>
					{/if}
				</div>

				<!-- 隐藏的文件输入 -->
				<input
					type="file"
					accept="image/*"
					class="hidden"
					bind:this={fileInputRef}
					onchange={handleBackgroundUpload}
				/>

				<!-- 操作按钮 -->
				<!-- <Button onclick={handleOpenFolder} disabled={loading} size="lg">
					<FolderOpen class="mr-2 h-5 w-5" />
					{loading ? 'Opening...' : 'Open Folder'}
				</Button> -->
			</EmptyContent>
		</Empty>
	</MainLayout>
</Tooltip.Provider>

<style>
	/* 控制按钮毛玻璃样式 - 与卡片一致 */
	.empty-control-btn {
		background: hsl(var(--card) / 0.6);
		backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		color: hsl(var(--foreground));
		cursor: pointer;
	}

	.empty-control-btn:hover {
		background: hsl(var(--card) / 0.8);
		border-color: hsl(var(--primary) / 0.3);
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.1);
	}

	.empty-control-btn:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: 2px;
	}
</style>
