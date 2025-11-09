<script lang="ts">
	/**
	 * NeoView - Right Sidebar Component
	 * 右侧边栏组件 - 垂直图标风格
	 */
	import { Info, FileText } from '@lucide/svelte';
	import { activeRightPanel, setActiveRightPanel } from '$lib/stores';
	import type { RightPanelType } from '$lib/stores';
	import ImagePropertiesPanel from '$lib/components/panels/ImagePropertiesPanel.svelte';

	const tabs = [
		{ value: 'info', label: '信息', icon: Info },
		{ value: 'properties', label: '属性', icon: FileText }
	] as const;
</script>

<div class="h-full flex bg-background">
	<!-- 面板内容 -->
	<div class="flex-1 overflow-hidden">
		{#if $activeRightPanel === 'info'}
			<div class="p-4">
				<h3 class="text-lg font-semibold mb-2">图片信息</h3>
				<p class="text-sm text-muted-foreground">即将推出...</p>
			</div>
		{:else if $activeRightPanel === 'properties'}
			<ImagePropertiesPanel />
		{:else}
			<div class="p-4 text-center text-muted-foreground">
				<p>选择一个面板</p>
			</div>
		{/if}
	</div>

	<!-- 垂直图标标签栏（右侧） -->
	<div class="w-12 flex flex-col border-l bg-secondary/30">
		{#each tabs as tab}
			{@const IconComponent = tab.icon}
			<button
				class="relative group h-14 flex items-center justify-center hover:bg-accent transition-colors {$activeRightPanel === tab.value ? 'bg-accent border-r-2 border-primary' : ''}"
				onclick={() => setActiveRightPanel(tab.value)}
				title={tab.label}
			>
				<IconComponent class="h-5 w-5" />

				<!-- 悬停提示 -->
				<div
					class="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-sm rounded shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50"
				>
					{tab.label}
				</div>
			</button>
		{/each}
	</div>
</div>
