<script lang="ts">
	/**
	 * Standalone Window Component
	 * 独立窗口组件 - 用于显示边栏面板的独立窗口
	 */
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import { X, Minimize, Maximize } from '@lucide/svelte';

	let windowId = $state('');
	let windowTitle = $state('');
	let panelContent = $state('');

	const appWindow = getCurrentWebviewWindow();

	onMount(() => {
		// 从URL参数获取窗口ID
		const pathSegments = $page.url.pathname.split('/');
		windowId = pathSegments[pathSegments.length - 1];
		
		// 根据窗口ID设置标题和内容
		switch (windowId) {
			case 'left-sidebar':
				windowTitle = '左侧边栏';
				panelContent = 'folder';
				break;
			case 'right-sidebar':
				windowTitle = '右侧边栏';
				panelContent = 'info';
				break;
			case 'left-folder':
				windowTitle = '文件夹';
				panelContent = 'folder';
				break;
			case 'left-history':
				windowTitle = '历史记录';
				panelContent = 'history';
				break;
			case 'left-bookmark':
				windowTitle = '书签';
				panelContent = 'bookmark';
				break;
			case 'left-thumbnail':
				windowTitle = '缩略图';
				panelContent = 'thumbnail';
				break;
			case 'left-playlist':
				windowTitle = '播放列表';
				panelContent = 'playlist';
				break;
			case 'left-info':
				windowTitle = '信息';
				panelContent = 'info';
				break;
			case 'right-info':
				windowTitle = '信息';
				panelContent = 'info';
				break;
			case 'right-properties':
				windowTitle = '属性';
				panelContent = 'properties';
				break;
			case 'bottom-thumbnails':
				windowTitle = '缩略图栏';
				panelContent = 'thumbnails';
				break;
			default:
				windowTitle = '独立窗口';
				panelContent = '';
		}

		// 设置窗口标题
		appWindow.setTitle(windowTitle);
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

	// 动态导入组件
	async function getPanelComponent() {
		switch (panelContent) {
			case 'folder':
				const { default: FolderPanel } = await import('$lib/components/panels/folderPanel/FolderPanel.svelte');
				return FolderPanel;
			case 'history':
				const { default: HistoryPanel } = await import('$lib/components/panels/HistoryPanel.svelte');
				return HistoryPanel;
			case 'bookmark':
				const { default: BookmarkPanel } = await import('$lib/components/panels/BookmarkPanel.svelte');
				return BookmarkPanel;
			case 'info':
				const { default: InfoPanel } = await import('$lib/components/panels/InfoPanel.svelte');
				return InfoPanel;
			case 'properties':
				const { default: ImagePropertiesPanel } = await import('$lib/components/panels/ImagePropertiesPanel.svelte');
				return ImagePropertiesPanel;
			case 'thumbnails':
				const { default: BottomThumbnailBar } = await import('$lib/components/layout/BottomThumbnailBar.svelte');
				return BottomThumbnailBar;
			default:
				return null;
		}
	}

	let panelComponent = $state<any>(null);

	$effect(() => {
		void getPanelComponent().then((Component) => {
			panelComponent = Component;
		});
	});
</script>

<svelte:head>
	<title>{windowTitle} - NeoView</title>
</svelte:head>

<div class="h-screen w-screen flex flex-col bg-background">
	<!-- 标题栏 -->
	<div class="h-8 bg-secondary/95 backdrop-blur-sm flex items-center justify-between px-2 select-none border-b">
		<span class="text-sm font-semibold">{windowTitle}</span>
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

	<!-- 内容区域 -->
	<div class="flex-1 overflow-hidden">
		{#if panelComponent}
			{@const PanelComponent = panelComponent}
			{#if panelContent === 'thumbnails'}
				<!-- 特殊处理缩略图栏 -->
				<div class="h-full">
					<PanelComponent />
				</div>
			{:else}
				<PanelComponent />
			{/if}
		{:else if panelContent === 'thumbnail'}
			<div class="p-4 text-center text-muted-foreground">
				<p>缩略图面板</p>
				<p class="text-xs mt-2">开发中...</p>
			</div>
		{:else if panelContent === 'playlist'}
			<div class="p-4 text-center text-muted-foreground">
				<p>播放列表面板</p>
				<p class="text-xs mt-2">开发中...</p>
			</div>
		{:else}
			<div class="p-4 text-center text-muted-foreground">
				<p>选择一个面板</p>
			</div>
		{/if}
	</div>
</div>