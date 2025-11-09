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
		isVisible: boolean;
	}

	let { onResize, isVisible = $bindable() }: Props = $props();

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

	function handleOpenInNewWindow(panel: string) {
		// 打开独立窗口
		if (panel === 'right') {
			// 打开整个右侧边栏
			openStandaloneWindow('right-sidebar', '右侧边栏', 800, 600);
		} else {
			// 打开特定面板
			const panelName = panel.replace('right-', '');
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
	position="right"
	bind:isVisible
	pinnedStore={rightSidebarPinned}
	widthStore={rightSidebarWidth}
	activeTabStore={activeRightPanel}
	tabs={tabs}
	onTabChange={handleTabChange}
	onVisibilityChange={handleVisibilityChange}
	onOpenInNewWindow={handleOpenInNewWindow}
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
