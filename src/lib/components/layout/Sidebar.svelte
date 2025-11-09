<script lang="ts">
	/**
	 * NeoView - Sidebar Component (Refactored)
	 * 左侧边栏组件 - 使用 BaseSidebar
	 */
	import { Folder, History, Bookmark, Info, Image as ImageIcon, List } from '@lucide/svelte';
	import { activePanel, setActivePanel, sidebarWidth, sidebarPinned } from '$lib/stores';
	import type { PanelType } from '$lib/stores';
	import BaseSidebar from './BaseSidebar.svelte';
	import FileBrowser from '$lib/components/panels/FileBrowser.svelte';
	import HistoryPanel from '$lib/components/panels/HistoryPanel.svelte';
	import BookmarkPanel from '$lib/components/panels/BookmarkPanel.svelte';
	import InfoPanel from '$lib/components/panels/InfoPanel.svelte';

	interface Props {
		onResize?: (width: number) => void;
		isVisible: boolean;
	}

	let { onResize, isVisible = $bindable() }: Props = $props();

	const tabs = [
		{ value: 'folder', label: '文件夹', icon: Folder },
		{ value: 'history', label: '历史记录', icon: History },
		{ value: 'bookmark', label: '书签', icon: Bookmark },
		{ value: 'thumbnail', label: '缩略图', icon: ImageIcon },
		{ value: 'playlist', label: '播放列表', icon: List },
		{ value: 'info', label: '信息', icon: Info }
	];

	function handleTabChange(value: string) {
		setActivePanel(value as PanelType);
	}

	function handleVisibilityChange(visible: boolean) {
		isVisible = visible;
	}

	function handleOpenInNewWindow(panel: string) {
		// 打开独立窗口
		if (panel === 'left') {
			// 打开整个左侧边栏
			openStandaloneWindow('left-sidebar', '左侧边栏', 800, 600);
		} else {
			// 打开特定面板
			const panelName = panel.replace('left-', '');
			const panelInfo = tabs.find(t => t.value === panelName);
			if (panelInfo) {
				openStandaloneWindow(panel, panelInfo.label, 400, 600);
			}
		}
	}

	function openStandaloneWindow(id: string, title: string, width: number, height: number) {
		const url = `${window.location.origin}/standalone/${id}`;
		const features = `width=${width},height=${height},resizable=yes,scrollbars=yes,status=yes,toolbar=no,menubar=no,location=no`;
		window.open(url, title, features);
	}
</script>

<BaseSidebar
	position="left"
	bind:isVisible
	pinnedStore={sidebarPinned}
	widthStore={sidebarWidth}
	activeTabStore={activePanel}
	tabs={tabs}
	onTabChange={handleTabChange}
	onVisibilityChange={handleVisibilityChange}
	onOpenInNewWindow={handleOpenInNewWindow}
	{onResize}
	storageKey="sidebar"
>
	{#if $activePanel === 'folder'}
		<FileBrowser />
	{:else if $activePanel === 'history'}
		<HistoryPanel />
	{:else if $activePanel === 'bookmark'}
		<BookmarkPanel />
	{:else if $activePanel === 'thumbnail'}
		<div class="p-4 text-center text-muted-foreground">
			<p>缩略图面板</p>
			<p class="text-xs mt-2">开发中...</p>
		</div>
	{:else if $activePanel === 'playlist'}
		<div class="p-4 text-center text-muted-foreground">
			<p>播放列表面板</p>
			<p class="text-xs mt-2">开发中...</p>
		</div>
	{:else if $activePanel === 'info'}
		<InfoPanel />
	{:else}
		<div class="p-4 text-center text-muted-foreground">
			<p>选择一个面板</p>
		</div>
	{/if}
</BaseSidebar>
