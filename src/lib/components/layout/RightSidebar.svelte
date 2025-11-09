<script lang="ts">
	/**
	 * NeoView - Right Sidebar Component
	 * 右侧边栏组件 - 垂直图标风格，支持拖拽排序
	 */
	import { Info, FileText, GripVertical } from '@lucide/svelte';
	import { activeRightPanel, setActiveRightPanel } from '$lib/stores';
	import type { RightPanelType } from '$lib/stores';
	import ImagePropertiesPanel from '$lib/components/panels/ImagePropertiesPanel.svelte';
	import InfoPanel from '$lib/components/panels/InfoPanel.svelte';

	let tabs = $state([
		{ value: 'info', label: '信息', icon: Info },
		{ value: 'properties', label: '属性', icon: FileText }
	]);

	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	function handleDragStart(e: DragEvent, index: number) {
		draggedIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(index));
		}
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
		dragOverIndex = index;
	}

	function handleDragEnd() {
		if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
			const newTabs = [...tabs];
			const [draggedItem] = newTabs.splice(draggedIndex, 1);
			newTabs.splice(dragOverIndex, 0, draggedItem);
			tabs = newTabs;
			
			// 保存到 localStorage
			localStorage.setItem('right-sidebar-tabs-order', JSON.stringify(tabs.map(t => t.value)));
		}
		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		handleDragEnd();
	}

	// 从 localStorage 加载排序
	$effect(() => {
		const savedOrder = localStorage.getItem('right-sidebar-tabs-order');
		if (savedOrder) {
			try {
				const order = JSON.parse(savedOrder) as string[];
				const orderedTabs = order
					.map(value => tabs.find(t => t.value === value))
					.filter(Boolean) as typeof tabs;
				if (orderedTabs.length === tabs.length) {
					tabs = orderedTabs;
				}
			} catch (e) {
				console.error('Failed to load right sidebar order:', e);
			}
		}
	});
</script>

<div class="h-full flex bg-background">
	<!-- 面板内容 -->
	<div class="flex-1 overflow-hidden">
		{#if $activeRightPanel === 'info'}
			<InfoPanel />
		{:else if $activeRightPanel === 'properties'}
			<ImagePropertiesPanel />
		{:else}
			<div class="p-4 text-center text-muted-foreground">
				<p>选择一个面板</p>
			</div>
		{/if}
	</div>

	<!-- 垂直图标标签栏（右侧，可拖拽） -->
	<div class="w-12 flex flex-col border-l bg-secondary/30">
		{#each tabs as tab, index (tab.value)}
			{@const IconComponent = tab.icon}
			<button
				draggable={true}
				ondragstart={(e) => handleDragStart(e, index)}
				ondragover={(e) => handleDragOver(e, index)}
				ondragend={handleDragEnd}
				ondrop={handleDrop}
				class="relative group h-14 flex items-center justify-center hover:bg-accent transition-colors cursor-move {$activeRightPanel === tab.value ? 'bg-accent border-r-2 border-primary' : ''} {dragOverIndex === index && draggedIndex !== index ? 'border-t-2 border-blue-500' : ''}"
				onclick={() => setActiveRightPanel(tab.value as RightPanelType)}
				title={tab.label}
			>
				<!-- 拖拽手柄 -->
				<div class="absolute right-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-50 bg-muted-foreground transition-opacity"></div>
				
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
