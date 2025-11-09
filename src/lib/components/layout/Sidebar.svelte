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
