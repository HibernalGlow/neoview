<script lang="ts">
	/**
	 * NeoView - Sidebar Component
	 * 侧边栏组件 - 垂直图标风格
	 */
	import { Folder, History, Bookmark, Info, Image as ImageIcon, List } from '@lucide/svelte';
	import { activePanel, setActivePanel } from '$lib/stores';
	import type { PanelType } from '$lib/stores';
	import FileBrowser from '$lib/components/panels/FileBrowser.svelte';

	const tabs = [
		{ value: 'folder', label: '文件夹', icon: Folder },
		{ value: 'history', label: '历史记录', icon: History },
		{ value: 'bookmark', label: '书签', icon: Bookmark },
		{ value: 'thumbnail', label: '缩略图', icon: ImageIcon },
		{ value: 'playlist', label: '播放列表', icon: List },
		{ value: 'info', label: '信息', icon: Info }
	] as const;
</script>

<div class="h-full flex bg-background">
	<!-- 垂直图标标签栏 -->
	<div class="w-12 flex flex-col border-r bg-secondary/30">
		{#each tabs as tab}
			{@const IconComponent = tab.icon}
			<button
				class="relative group h-14 flex items-center justify-center hover:bg-accent transition-colors {$activePanel ===
				tab.value
					? 'bg-accent border-l-2 border-primary'
					: ''}"
				onclick={() => setActivePanel(tab.value as PanelType)}
				title={tab.label}
			>
				<IconComponent class="h-5 w-5" />
				
				<!-- 悬停提示 -->
				<div
					class="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-sm rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50"
				>
					{tab.label}
				</div>
			</button>
		{/each}
	</div>

	<!-- 面板内容 -->
	<div class="flex-1 overflow-hidden">
		{#if $activePanel === 'folder'}
			<FileBrowser />
		{:else if $activePanel === 'history'}
			<div class="p-4">
				<h3 class="text-lg font-semibold mb-2">历史记录</h3>
				<p class="text-sm text-muted-foreground">即将推出...</p>
			</div>
		{:else if $activePanel === 'bookmark'}
			<div class="p-4">
				<h3 class="text-lg font-semibold mb-2">书签</h3>
				<p class="text-sm text-muted-foreground">即将推出...</p>
			</div>
		{:else if $activePanel === 'thumbnail'}
			<div class="p-4">
				<h3 class="text-lg font-semibold mb-2">缩略图</h3>
				<p class="text-sm text-muted-foreground">即将推出...</p>
			</div>
		{:else if $activePanel === 'playlist'}
			<div class="p-4">
				<h3 class="text-lg font-semibold mb-2">播放列表</h3>
				<p class="text-sm text-muted-foreground">即将推出...</p>
			</div>
		{:else if $activePanel === 'info'}
			<div class="p-4">
				<h3 class="text-lg font-semibold mb-2">信息</h3>
				<p class="text-sm text-muted-foreground">即将推出...</p>
			</div>
		{/if}
	</div>
</div>
