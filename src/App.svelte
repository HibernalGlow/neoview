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
	import { convertFileSrc } from '@tauri-apps/api/core';
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
		toggleTemporaryFitZoom,
		initFullscreenState,
		setActivePanelTab
	} from '$lib/stores';
	import { keyBindingsStore } from '$lib/stores/keybindings';
	import { FolderOpen, Eye, EyeOff, ImageUp, X, Video, Settings2 } from '@lucide/svelte';
	import ProjectCard from '$lib/components/ui/ProjectCard.svelte';
	import BackgroundVideo from '$lib/components/viewer/BackgroundVideo.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';
	import { isVideoFile } from '$lib/utils/videoUtils';
	import { videoStore } from '$lib/stores/video.svelte';
	import { animatedVideoModeStore } from '$lib/stores/animatedVideoMode.svelte';
	import { isAnimatedImageVideoCandidate } from '$lib/utils/animatedVideoModeUtils';
	import { updateUpscaleSettings } from '$lib/utils/upscale/settings';
	import { slideshowStore } from '$lib/stores/slideshow.svelte';
	import { deleteArchiveEntry } from '$lib/api/archive';
	// V3 缩略图系统（复刻 NeeView 架构）
	import {
		initThumbnailServiceV3,
		cleanup as cleanupThumbnailService
	} from '$lib/stores/thumbnailStoreV3.svelte';
	// 页面尺寸扫描事件监听
	import {
		initDimensionScanListener,
		cleanupDimensionScanListener
	} from '$lib/stores/dimensionScanListener';
	import Toast from '$lib/components/ui/toast.svelte';
	import GlobalConfirmDialog from '$lib/components/ui/GlobalConfirmDialog.svelte';
	import { confirm as confirmDialog } from '$lib/stores/confirmDialog.svelte';
	import { showInfoToast, showErrorToast } from '$lib/utils/toast';
	import SettingsOverlay from '$lib/components/SettingsOverlay.svelte';
	import { settingsOverlayOpen } from '$lib/stores/settingsOverlay.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { getMatches } from '@tauri-apps/plugin-cli';
	import { restoreStateCurrent, saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state';
	import { getFileMetadata } from '$lib/api/filesystem';
	import { openFileSystemItem } from '$lib/utils/navigationUtils';
	import { windowManager } from '$lib/core/windows/windowManager';
	import { initCardWindowSystem, restoreCardWindows } from '$lib/core/windows/cardWindowManager';
	// CLI 路径处理工具 (Requirements: 4.1, 4.2, 4.3, 4.4)
	import { normalizePath, validatePath, getPathType } from '$lib/utils/pathUtils';
	// Folder Panel 标签页管理
	import { folderTabActions } from '$lib/components/panels/folderPanel/stores/folderTabStore';
	import { folderPanelActions } from '$lib/components/panels/folderPanel/stores/folderPanelStore';
	import {
		dispatchViewerAction,
		isVideoAction,
		isSlideshowAction,
		remapPageActionForVideoSeekMode
	} from '$lib/utils/viewerActionDispatcher';
	import { executeAppAction, type ActionHandlerContext } from '$lib/utils/appActionHandlers';

	const WINDOW_STATE_SAFE_FLAGS = StateFlags.SIZE | StateFlags.POSITION | StateFlags.MAXIMIZED;

	// 卡片显示/隐藏状态
	let showProjectCard = $state(true);
	let loading = $state(false);
	// 背景图片URL
	let backgroundImageUrl = $state<string | null>(null);
	// 背景视频URL
	let backgroundVideoUrl = $state<string | null>(null);
	// 背景视频设置
	let videoOpacity = $state(0.3);
	let videoBlur = $state(0);
	let videoPlaybackRate = $state(1.0);
	// 隐藏的文件输入引用
	let fileInputRef: HTMLInputElement | null = null;
	// 视频设置面板显示状态
	let showVideoSettings = $state(false);

	// 转换视频 URL，如果是文件路径则使用 convertFileSrc
	let convertedVideoUrl = $derived.by(() => {
		if (!backgroundVideoUrl) return null;
		// 如果是 data: URL 或 http(s): URL，直接返回
		if (backgroundVideoUrl.startsWith('data:') || backgroundVideoUrl.startsWith('http')) {
			return backgroundVideoUrl;
		}
		// 否则是文件路径，使用 convertFileSrc 转换
		return convertFileSrc(backgroundVideoUrl);
	});

	// 从 localStorage 加载设置
	function loadEmptySettings() {
		try {
			const saved = localStorage.getItem('neoview-empty-settings');
			if (saved) {
				const settings = JSON.parse(saved);
				showProjectCard = settings.showProjectCard ?? true;
				backgroundImageUrl = settings.backgroundImageUrl ?? null;
				backgroundVideoUrl = settings.backgroundVideoUrl ?? null;
				videoOpacity = settings.videoOpacity ?? 0.3;
				videoBlur = settings.videoBlur ?? 0;
				videoPlaybackRate = settings.videoPlaybackRate ?? 1.0;
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
					backgroundImageUrl,
					backgroundVideoUrl,
					videoOpacity,
					videoBlur,
					videoPlaybackRate
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

	// 处理背景视频上传
	async function handleBackgroundVideoUpload() {
		// 使用 Tauri 的 open 对话框选择文件，直接获取文件路径
		try {
			const selected = await open({
				multiple: false,
				filters: [
					{
						name: '视频文件',
						extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']
					}
				]
			});

			if (selected) {
				// 保存原始文件路径，显示时会通过 convertedVideoUrl 自动转换
				backgroundVideoUrl = selected as string;
				saveEmptySettings();
				console.log('✅ 视频背景路径已保存:', selected);
			}
		} catch (error) {
			console.error('❌ 选择视频文件失败:', error);
		}
	}

	// 清除背景视频
	function clearBackgroundVideo() {
		backgroundVideoUrl = null;
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
	// 语音命令事件监听器
	let voiceCommandHandler: ((event: Event) => void) | null = null;

	onMount(async () => {
		// 加载空页面设置
		loadEmptySettings();

		// 显式恢复窗口状态（位置/尺寸/最大化/全屏），避免自动恢复时序差异。
		try {
			await restoreStateCurrent(WINDOW_STATE_SAFE_FLAGS);
			console.log('✅ Window state restored');
		} catch (error) {
			console.warn('⚠️ Window state restore failed:', error);
		}

		// 初始化卡片窗口系统
		try {
			await initCardWindowSystem();
			// 注意：不在主窗口启动时恢复卡片窗口，避免干扰用户
			// 用户可以通过右键菜单手动打开卡片窗口
			console.log('✅ 卡片窗口系统初始化成功');
		} catch (error) {
			console.error('❌ 卡片窗口系统初始化失败:', error);
		}

		// 初始化默认上下文为图片浏览模式
		keyBindingsStore.setContexts(['global', 'viewer']);

		try {
			// V3 缩略图系统初始化
			const thumbnailPath = 'D:\\temp\\neoview';
			await initThumbnailServiceV3(thumbnailPath, 256);
			console.log('✅ ThumbnailServiceV3 初始化成功');
		} catch (error) {
			console.error('❌ 缩略图初始化失败:', error);
		}

		// 初始化页面尺寸扫描事件监听
		try {
			await initDimensionScanListener();
			console.log('✅ 尺寸扫描监听器初始化成功');
		} catch (error) {
			console.error('❌ 尺寸扫描监听器初始化失败:', error);
		}

		// CLI 启动参数处理（类似 NeeView 的 FirstLoader）
		// Requirements: 1.1, 1.2, 1.3, 1.4, 4.1, 4.2, 4.3, 4.4
		try {
			console.log('📂 CLI: 开始解析启动参数...');
			const matches = await getMatches();
			console.log('📂 CLI: matches =', JSON.stringify(matches, null, 2));
			const arg = matches.args?.path?.value as string | string[] | undefined;
			console.log('📂 CLI: arg =', arg);
			const cliPath =
				typeof arg === 'string' ? arg : Array.isArray(arg) && arg.length > 0 ? arg[0] : undefined;
			console.log('📂 CLI: cliPath =', cliPath);

			if (cliPath) {
				console.log('📂 CLI 启动: 原始路径:', cliPath);

				// 1. 规范化路径（处理相对路径、空格、特殊字符）
				let normalizedPath: string;
				try {
					normalizedPath = await normalizePath(cliPath);
					console.log('📂 CLI 启动: 规范化路径:', normalizedPath);
				} catch (normalizeError) {
					console.error('❌ CLI 路径规范化失败:', normalizeError);
					showErrorToast('路径无效', `无法解析路径: ${cliPath}`);
					return;
				}

				// 2. 验证路径是否存在
				const exists = await validatePath(normalizedPath);
				if (!exists) {
					console.error('❌ CLI 路径不存在:', normalizedPath);
					showErrorToast('路径不存在', normalizedPath);
					return;
				}

				// 3. 获取路径类型
				console.log('📂 CLI 启动: 开始获取路径类型...');
				const pathType = await getPathType(normalizedPath);
				console.log('📂 CLI 启动: 路径类型:', pathType);

				// 4. 根据路径类型打开
				// 复刻 NeeView 行为：在 folder 卡片中用新标签页打开
				switch (pathType) {
					case 'directory':
						// 文件夹：在 folder 卡片中用新标签页打开
						console.log('📂 CLI: 在 folder 卡片中打开文件夹:', normalizedPath);
						// 1. 切换到 folder 面板
						setActivePanelTab('folder');
						// 2. 创建新标签页（homePath 和 currentPath 都设置为目标路径）
						const newTabId = folderTabActions.createTab(normalizedPath);
						console.log('📂 CLI: 新标签页已创建, tabId:', newTabId);
						// 3. 等待一帧让 Svelte 更新 DOM
						await new Promise((resolve) => requestAnimationFrame(resolve));
						console.log('📂 CLI: DOM 更新完成');
						break;
					case 'archive': {
						// 压缩包：在 viewer 中打开，同时在 folder 面板中定位到压缩包所在文件夹
						console.log('📦 CLI: 打开压缩包作为书籍:', normalizedPath);

						// 1. 获取压缩包所在的父文件夹
						const archiveParentDir = normalizedPath.substring(
							0,
							Math.max(normalizedPath.lastIndexOf('\\'), normalizedPath.lastIndexOf('/'))
						);
						console.log('📦 CLI: 压缩包所在文件夹:', archiveParentDir);

						// 2. 在 folder 面板中创建新标签页，定位到父文件夹
						if (archiveParentDir) {
							setActivePanelTab('folder');
							folderTabActions.createTab(archiveParentDir);
							// 设置待聚焦路径，FolderStack 加载完成后会自动定位并高亮
							folderTabActions.focusOnPath(normalizedPath);
							console.log('📦 CLI: 设置待聚焦路径:', normalizedPath);
						}

						// 3. 在 viewer 中打开压缩包
						await bookStore.openBook(normalizedPath);
						break;
					}
					case 'file': {
						// 普通文件：在 viewer 中打开，同时在 folder 面板中定位到文件所在文件夹
						console.log('📄 CLI: 打开文件:', normalizedPath);

						// 1. 获取文件所在的父文件夹
						const parentDir = normalizedPath.substring(
							0,
							Math.max(normalizedPath.lastIndexOf('\\'), normalizedPath.lastIndexOf('/'))
						);
						console.log('📄 CLI: 文件所在文件夹:', parentDir);

						// 2. 在 folder 面板中创建新标签页，定位到父文件夹
						if (parentDir) {
							setActivePanelTab('folder');
							folderTabActions.createTab(parentDir);
							// 设置待聚焦路径，FolderStack 加载完成后会自动定位并高亮
							folderTabActions.focusOnPath(normalizedPath);
							console.log('📄 CLI: 设置待聚焦路径:', normalizedPath);
						}

						// 3. 在 viewer 中打开文件
						const meta = await getFileMetadata(normalizedPath);
						await openFileSystemItem(normalizedPath, meta.isDir, { forceInApp: true });
						break;
					}
					default:
						console.error('❌ CLI: 无效的路径类型');
						showErrorToast('无法打开', '不支持的文件类型');
				}
			}
		} catch (error) {
			console.error('❌ CLI 启动失败:', error);
			showErrorToast('启动失败', error instanceof Error ? error.message : '未知错误');
		}

		// 初始化全屏状态同步（Requirements: 1.1, 1.2）
		try {
			await initFullscreenState();
			console.log('✅ 全屏状态同步初始化成功');
		} catch (error) {
			console.error('❌ 全屏状态同步初始化失败:', error);
		}

		// 语音命令事件监听器
		voiceCommandHandler = (event: Event) => {
			const customEvent = event as CustomEvent<{ action: string; transcript: string }>;
			const { action, transcript } = customEvent.detail;
			console.log(`🎤 语音命令: "${transcript}" -> ${action}`);
			dispatchAction(action);
		};

		window.addEventListener('neoview-voice-command', voiceCommandHandler);
	});

	// 清理语音命令监听器和全屏状态监听器
	onDestroy(() => {
		void saveWindowState(WINDOW_STATE_SAFE_FLAGS).catch((error) => {
			console.warn('⚠️ Window state save failed:', error);
		});

		if (voiceCommandHandler) {
			window.removeEventListener('neoview-voice-command', voiceCommandHandler);
		}
		// 清理全屏状态同步监听器（Requirements: 4.1）
		windowManager.cleanupFullscreenSync();
		// 清理尺寸扫描监听器
		cleanupDimensionScanListener();
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
		const currentMediaName =
			currentPage?.name || currentPage?.innerPath || currentPage?.path || '';
		const isAnimatedVideoPage =
			animatedVideoModeStore.canUse && isAnimatedImageVideoCandidate(currentMediaName);
		const isVideoPage = Boolean(
			currentPage &&
				(isVideoFile(currentMediaName) ||
					isAnimatedVideoPage ||
					keyBindingsStore.isContextActive('videoPlayer'))
		);

		if (isVideoPage) {
			// 如果启用了快进模式，将翻页操作映射为快进/快退
			// 统一方向：右/下一页 = 快进，左/上一页 = 快退（不受阅读方向影响）
			if (videoStore.seekMode) {
				action = remapPageActionForVideoSeekMode(action);
			}

			// 使用 isVideoAction 检查并分发视频操作
			if (isVideoAction(action)) {
				console.log(`执行视频操作: ${action}`);
				dispatchViewerAction(action);
			}
		}

		// 使用统一的动作处理器执行动作
		const ctx: ActionHandlerContext = { handleDeleteCurrentArchivePage };
		const handled = await executeAppAction(action, ctx);
		if (!handled) {
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
		const isInSidebar = target.closest('[data-sidebar]') !== null;

		// 如果点击在侧边栏内容、上栏或下栏区域内，则不处理区域点击
		if (isInSidebar || isInTopToolbar || isInBottomBar) {
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
		const isInSidebar = target.closest('[data-sidebar]') !== null;

		// 如果点击在侧边栏内容、上栏或下栏区域内，则不处理区域点击
		if (isInSidebar || isInTopToolbar || isInBottomBar) {
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
			<!-- 背景视频 (最底层) -->
			{#if convertedVideoUrl}
				<div class="absolute inset-0" style="z-index: -10;">
					<BackgroundVideo
						src={convertedVideoUrl}
						opacity={videoOpacity}
						blur={videoBlur}
						playbackRate={videoPlaybackRate}
					/>
				</div>
			{/if}

			<!-- 自定义背景图片 -->
			{#if backgroundImageUrl}
				<div
					class="pointer-events-none absolute inset-0 h-full w-full bg-cover bg-center bg-no-repeat"
					style="background-image: url({backgroundImageUrl}); z-index: -5;"
				></div>
			{:else if !backgroundVideoUrl}
				<!-- 网点背景 (仅当没有图片和视频时显示) -->
				<div
					class="pointer-events-none absolute inset-0 h-full w-full bg-[radial-gradient(#00000026_1px,transparent_1px)] bg-size-[20px_20px] dark:bg-[radial-gradient(#ffffff26_1px,transparent_1px)]"
					style="z-index: -5;"
				></div>
			{/if}
			<!-- <EmptyHeader>
				<EmptyTitle class="mb-4 text-4xl font-bold">NeoView</EmptyTitle>
				<EmptyDescription class="mb-6 text-base">Modern Image & Comic Viewer</EmptyDescription>
			</EmptyHeader> -->
			<EmptyContent class="relative z-10">
				<!-- 项目卡片 - 隐藏时变透明，保持布局 -->
				<ProjectCard
					class="mb-6 transition-opacity duration-300 {showProjectCard
						? 'opacity-100'
						: 'pointer-events-none opacity-0'}"
				/>

				<!-- 控制按钮组容器 - 使用group实现悬停显示 -->
				<div class="empty-controls-container group">
					<div
						class="empty-controls flex items-center gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
					>
						<!-- 隐藏/显示卡片按钮 -->
						<button
							onclick={toggleProjectCard}
							class="empty-control-btn flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:scale-105"
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
							class="empty-control-btn flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:scale-105"
							title="上传背景图"
						>
							<ImageUp class="h-4 w-4" />
						</button>

						<!-- 清除背景图按钮（仅当有背景图时显示） -->
						{#if backgroundImageUrl}
							<button
								onclick={clearBackgroundImage}
								class="empty-control-btn flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:scale-105"
								title="清除背景图"
							>
								<X class="h-4 w-4" />
							</button>
						{/if}

						<!-- 上传背景视频按钮 -->
						<button
							onclick={handleBackgroundVideoUpload}
							class="empty-control-btn flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:scale-105"
							title="上传背景视频"
						>
							<Video class="h-4 w-4" />
						</button>

						<!-- 清除背景视频按钮（仅当有背景视频时显示） -->
						{#if backgroundVideoUrl}
							<button
								onclick={clearBackgroundVideo}
								class="empty-control-btn flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:scale-105"
								title="清除背景视频"
							>
								<X class="h-4 w-4" />
							</button>
						{/if}

						<!-- 视频设置按钮（仅当有背景视频时显示） -->
						{#if backgroundVideoUrl}
							<div class="relative">
								<button
									onclick={() => (showVideoSettings = !showVideoSettings)}
									class="empty-control-btn flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:scale-105 {showVideoSettings
										? 'bg-primary/20'
										: ''}"
									title="视频设置"
								>
									<Settings2 class="h-4 w-4" />
								</button>

								<!-- 视频设置面板 -->
								{#if showVideoSettings}
									<div
										class="absolute bottom-full left-0 mb-2 w-64 rounded-lg p-4 shadow-lg"
										style="background: hsl(var(--card) / 0.95); backdrop-filter: blur(16px); border: 1px solid hsl(var(--border) / 0.5);"
										onpointerdown={(e) => e.stopPropagation()}
										role="dialog"
										aria-label="视频设置面板"
										tabindex="-1"
									>
										<div class="mb-3 flex items-center justify-between">
											<span class="text-sm font-medium">视频设置</span>
											<button
												class="text-muted-foreground hover:text-foreground transition-colors"
												onclick={() => (showVideoSettings = false)}
											>
												<X class="h-4 w-4" />
											</button>
										</div>

										<!-- 透明度 -->
										<div class="mb-4">
											<div class="mb-1 flex items-center justify-between">
												<span class="text-muted-foreground text-xs">透明度</span>
												<span class="font-mono text-xs">{Math.round(videoOpacity * 100)}%</span>
											</div>
											<input
												type="range"
												min="0"
												max="1"
												step="0.05"
												bind:value={videoOpacity}
												oninput={saveEmptySettings}
												class="bg-primary/20 h-1 w-full cursor-pointer appearance-none rounded-lg"
											/>
										</div>

										<!-- 模糊度 -->
										<div class="mb-4">
											<div class="mb-1 flex items-center justify-between">
												<span class="text-muted-foreground text-xs">模糊度</span>
												<span class="font-mono text-xs">{videoBlur}px</span>
											</div>
											<input
												type="range"
												min="0"
												max="20"
												step="1"
												bind:value={videoBlur}
												oninput={saveEmptySettings}
												class="bg-primary/20 h-1 w-full cursor-pointer appearance-none rounded-lg"
											/>
										</div>

										<!-- 播放速率 -->
										<div>
											<div class="mb-1 flex items-center justify-between">
												<span class="text-muted-foreground text-xs">播放速率</span>
												<span class="font-mono text-xs">{videoPlaybackRate.toFixed(2)}x</span>
											</div>
											<input
												type="range"
												min="0.25"
												max="2"
												step="0.1"
												bind:value={videoPlaybackRate}
												oninput={saveEmptySettings}
												class="bg-primary/20 h-1 w-full cursor-pointer appearance-none rounded-lg"
											/>
										</div>

										<!-- 重置按钮 -->
										<div class="border-border/50 mt-4 border-t pt-3">
											<button
												onclick={() => {
													videoOpacity = 0.3;
													videoBlur = 0;
													videoPlaybackRate = 1.0;
													saveEmptySettings();
												}}
												class="bg-primary/10 hover:bg-primary/20 w-full rounded-md px-3 py-1.5 text-xs transition-colors"
											>
												重置为默认值
											</button>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
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

	/* 控制按钮容器 - 扩大悬停区域 */
	.empty-controls-container {
		padding: 2rem;
		display: inline-block;
	}
</style>
