<script lang="ts">
	/**
	 * NeoView - Right Sidebar Component (Refactored)
	 * 右侧边栏组件 - 使用 BaseSidebar
	 */
	import { Info, FileText } from '@lucide/svelte';
	import { activeRightPanel, setActiveRightPanel, rightSidebarWidth, rightSidebarPinned } from '$lib/stores';
	import type { RightPanelType } from '$lib/stores';
	import BaseSidebar from './BaseSidebar.svelte';
	import ImagePropertiesPanel from '$lib/components/panels/ImagePropertiesPanel.svelte';
	import InfoPanel from '$lib/components/panels/InfoPanel.svelte';

	interface Props {
		onResize?: (width: number) => void;
	}

	let { onResize }: Props = $props();

	let isVisible = $state(false);

	const tabs = [
		{ value: 'info', label: '信息', icon: Info },
		{ value: 'properties', label: '属性', icon: FileText }
	];

	function handleTabChange(value: string) {
		setActiveRightPanel(value as RightPanelType);
	}

	function handleVisibilityChange(visible: boolean) {
		isVisible = visible;
	}
</script>

<BaseSidebar
	position="right"
	bind:isVisible
	pinnedStore={rightSidebarPinned}
	widthStore={rightSidebarWidth}
	activeTabStore={activeRightPanel}
	tabs={tabs}
	onTabChange={handleTabChange}
	onVisibilityChange={handleVisibilityChange}
	{onResize}
	storageKey="right-sidebar"
>
	{#if $activeRightPanel === 'info'}
		<InfoPanel />
	{:else if $activeRightPanel === 'properties'}
		<ImagePropertiesPanel />
	{:else}
		<div class="p-4 text-center text-muted-foreground">
			<p>选择一个面板</p>
		</div>
	{/if}
</BaseSidebar>
