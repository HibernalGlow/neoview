<script lang="ts">
	/**
	 * NeoView - Sidebar Component
	 * 侧边栏组件
	 */
	import { Tabs } from '$lib/components/ui/tabs';
	import { Folder, History, Bookmark, Info } from '@lucide/svelte';
	import { activePanel, setActivePanel } from '$lib/stores';
	import type { PanelType } from '$lib/stores';
	import FileBrowser from '$lib/components/panels/FileBrowser.svelte';

	const tabs = [
		{ value: 'folder', label: 'Folder', icon: Folder },
		{ value: 'history', label: 'History', icon: History },
		{ value: 'bookmark', label: 'Bookmark', icon: Bookmark },
		{ value: 'info', label: 'Info', icon: Info }
	] as const;
</script>

<div class="h-full flex flex-col bg-background">
	<!-- 标签页 -->
	<div class="border-b">
		<div class="flex items-center h-10">
			{#each tabs as tab}
				{@const IconComponent = tab.icon}
				<button
					class="flex-1 flex items-center justify-center gap-2 h-full hover:bg-accent transition-colors {$activePanel ===
					tab.value
						? 'border-b-2 border-primary bg-accent'
						: ''}"
					onclick={() => setActivePanel(tab.value as PanelType)}
				>
					<IconComponent class="h-4 w-4" />
					<span class="text-sm">{tab.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- 面板内容 -->
	<div class="flex-1 overflow-hidden">
		{#if $activePanel === 'folder'}
			<FileBrowser />
		{:else if $activePanel === 'history'}
			<div class="p-2 text-sm text-muted-foreground">History panel - Coming soon</div>
		{:else if $activePanel === 'bookmark'}
			<div class="p-2 text-sm text-muted-foreground">Bookmark panel - Coming soon</div>
		{:else if $activePanel === 'info'}
			<div class="p-2 text-sm text-muted-foreground">Info panel - Coming soon</div>
		{/if}
	</div>
</div>
