<script lang="ts">
	/**
	 * NeoView - Panel Tab Bar Component
	 * 面板标签栏组件 - 竖排图标设计，支持拖拽排序
	 */
	import {
		Folder,
		History,
		Bookmark,
		Info,
		Grid,
		List,
		ArrowLeftRight,
		GripVertical
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Tooltip } from '$lib/components/ui/tooltip';
	import {
		activePanel,
		setActivePanelTab,
		type PanelConfig,
		type PanelLocation,
		movePanelToLocation,
		reorderPanels,
		startDraggingPanel,
		stopDraggingPanel,
		draggingPanel
	} from '$lib/stores/panels.svelte';

	interface Props {
		panels: PanelConfig[];
		location: PanelLocation;
		onMoveToOpposite?: () => void;
	}

	let { panels, location, onMoveToOpposite }: Props = $props();

	// 图标映射
	const iconMap = {
		Folder,
		History,
		Bookmark,
		Info,
		Grid,
		List
	};

	// 拖拽状态
	let dragOverIndex = $state<number | null>(null);

	function handlePanelClick(panelId: PanelConfig['id']) {
		setActivePanelTab($activePanel === panelId ? null : panelId);
	}

	function handleDragStart(event: DragEvent, panel: PanelConfig, index: number) {
		if (!event.dataTransfer) return;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', panel.id);
		startDraggingPanel(panel.id);
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		if (!event.dataTransfer) return;
		event.dataTransfer.dropEffect = 'move';
		dragOverIndex = index;
	}

	function handleDragLeave() {
		dragOverIndex = null;
	}

	function handleDrop(event: DragEvent, targetIndex: number) {
		event.preventDefault();
		const panelId = event.dataTransfer?.getData('text/plain');
		if (!panelId || !$draggingPanel) return;

		const currentPanels = panels.map((p) => p.id);
		const fromIndex = currentPanels.indexOf($draggingPanel);
		
		if (fromIndex !== -1 && fromIndex !== targetIndex) {
			// 重新排序
			const newOrder = [...currentPanels];
			newOrder.splice(fromIndex, 1);
			newOrder.splice(targetIndex, 0, $draggingPanel);
			reorderPanels(location, newOrder);
		}

		dragOverIndex = null;
		stopDraggingPanel();
	}

	function handleDragEnd() {
		dragOverIndex = null;
		stopDraggingPanel();
	}

	function getOppositeLocation(loc: PanelLocation): PanelLocation {
		if (loc === 'left') return 'right';
		if (loc === 'right') return 'left';
		return 'bottom';
	}

	function handleMoveToOpposite(panelId: PanelConfig['id']) {
		const opposite = getOppositeLocation(location);
		movePanelToLocation(panelId, opposite);
	}
</script>

<div
	class="flex flex-col bg-secondary/30 border-r {location === 'right' ? 'border-l' : ''}"
	style="width: 48px;"
>
	{#each panels as panel, index (panel.id)}
		{@const IconComponent = iconMap[panel.icon as keyof typeof iconMap]}
		{@const isActive = $activePanel === panel.id}
		{@const isDragOver = dragOverIndex === index}

		<div
			class="relative"
			ondragover={(e) => handleDragOver(e, index)}
			ondragleave={handleDragLeave}
			ondrop={(e) => handleDrop(e, index)}
		>
			{#if isDragOver}
				<div class="absolute inset-x-0 top-0 h-0.5 bg-primary z-10"></div>
			{/if}

			<Tooltip.Root>
				<Tooltip.Trigger asChild let:builder>
					<button
						use:builder.action
						{...builder}
						draggable="true"
						ondragstart={(e) => handleDragStart(e, panel, index)}
						ondragend={handleDragEnd}
						onclick={() => handlePanelClick(panel.id)}
						class="group relative w-full h-12 flex items-center justify-center border-b hover:bg-accent transition-colors {isActive
							? 'bg-accent border-l-2 border-l-primary'
							: ''}"
					>
						<!-- 拖拽手柄 -->
						<div
							class="absolute left-0 top-0 bottom-0 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
						>
							<GripVertical class="h-3 w-3 text-muted-foreground" />
						</div>

						<!-- 图标 -->
						<IconComponent class="h-5 w-5 {isActive ? 'text-primary' : 'text-muted-foreground'}" />

						<!-- 切换到对面按钮 -->
						<button
							onclick={(e) => {
								e.stopPropagation();
								handleMoveToOpposite(panel.id);
							}}
							class="absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10"
							title="移动到对面侧边栏"
						>
							<ArrowLeftRight class="h-3 w-3 text-muted-foreground" />
						</button>
					</button>
				</Tooltip.Trigger>
				<Tooltip.Content side={location === 'left' ? 'right' : 'left'}>
					<p>{panel.title}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		</div>
	{/each}

	<!-- 固定位置的分隔线 -->
	<div class="flex-1"></div>

	<!-- 底部：侧边栏切换按钮 -->
	{#if onMoveToOpposite}
		<Tooltip.Root>
			<Tooltip.Trigger asChild let:builder>
				<Button
					use:builder.action
					{...builder}
					variant="ghost"
					size="icon"
					class="h-12 rounded-none"
					onclick={onMoveToOpposite}
				>
					<ArrowLeftRight class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content side={location === 'left' ? 'right' : 'left'}>
				<p>切换到{location === 'left' ? '右' : '左'}侧边栏</p>
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}
</div>
