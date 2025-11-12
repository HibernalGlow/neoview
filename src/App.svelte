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
	import { bookStore, zoomIn, zoomOut, resetZoom, toggleSidebar, toggleFullscreen, rotateClockwise, toggleViewMode, sidebarOpen, rightSidebarOpen } from '$lib/stores';
	import { keyBindingsStore } from '$lib/stores/keybindings.svelte';
	import { FolderOpen } from '@lucide/svelte';
	import { init_thumbnail_manager } from '$lib/api';
	import Toast from '$lib/components/ui/toast.svelte';
	import { onMount } from 'svelte';

	let loading = $state(false);

	// 初始化缩略图管理器
	onMount(async () => {
		try {
			console.log('🔧 初始化缩略图管理器...');
			
			// 使用统一的缩略图路径
			const thumbnailPath = 'D:\\temp\\neoview_thumbnails_test';
			
			// 设置根目录为系统根目录，这样可以处理任何路径
			const rootPath = 'C:\\';
			
			console.log('📁 缩略图路径:', thumbnailPath);
			console.log('📂 根目录路径:', rootPath);
			console.log('⚠️ 使用系统根目录，支持任意路径的缩略图生成');
			
			await init_thumbnail_manager(thumbnailPath, rootPath, 256);
			console.log('✅ 缩略图管理器初始化成功');
		} catch (error) {
			console.error('❌ 缩略图管理器初始化失败:', error);
		}
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
	keyBindingsStore.debugBindings();
	
	switch (action) {
		case 'nextPage':
			console.log('执行下一页操作');
			await bookStore.nextPage();
			break;
		case 'prevPage':
			console.log('执行上一页操作');
			await bookStore.previousPage();
			break;
		case 'firstPage':
			console.log('执行第一页操作');
			await bookStore.firstPage();
			break;
		case 'lastPage':
			console.log('执行最后一页操作');
			await bookStore.lastPage();
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
			resetZoom();
			break;
		case 'actualSize':
			console.log('执行实际大小操作');
			resetZoom();
			break;
		case 'fullscreen':
			console.log('执行全屏操作');
			toggleFullscreen();
			break;
		case 'toggleSidebar':
			console.log('执行切换侧边栏操作');
			toggleSidebar();
			break;
		case 'toggleBookMode':
			console.log('执行切换书籍模式操作');
			toggleViewMode();
			break;
		case 'rotate':
			console.log('执行旋转操作');
			rotateClockwise();
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
		default:
			console.warn('未实现的快捷操作：', action);
	}
}

function handleGlobalKeydown(e: KeyboardEvent) {
	// 不在输入框时响应
	if (isTypingInInput(e)) return;

	const combo = formatKeyCombo(e);
	console.log('按键按下:', combo); // 调试信息
	const action = keyBindingsStore.findActionByKey(combo);
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
	if ($sidebarOpen || $rightSidebarOpen || isInTopToolbar || isInBottomBar) {
		console.log('边栏已打开或点击在上下栏区域内，禁用全局区域点击响应', { 
			sidebarOpen: $sidebarOpen, 
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
	if ($sidebarOpen || $rightSidebarOpen || isInTopToolbar || isInBottomBar) {
		console.log('边栏已打开或点击在上下栏区域内，禁用全局区域按下响应', { 
			sidebarOpen: $sidebarOpen, 
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
	<MainLayout>
	<div class="h-full w-full flex items-center justify-center">
		<ImageViewer />
		
		<!-- 欢迎界面 (当没有打开书籍时显示) -->
		<!-- <div class="text-center">
			<h1 class="text-4xl font-bold mb-4">NeoView</h1>
			<p class="text-muted-foreground mb-8">Modern Image & Comic Viewer</p>
			<Button onclick={handleOpenFolder} disabled={loading} size="lg">
				<FolderOpen class="mr-2 h-5 w-5" />
				{loading ? 'Opening...' : 'Open Folder'}
			</Button>
		</div> -->
	</div>
</MainLayout>
</Tooltip.Provider>
