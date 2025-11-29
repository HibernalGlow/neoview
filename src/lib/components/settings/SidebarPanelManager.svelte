<script lang="ts">
/**
 * SidebarPanelManager - 侧边栏面板管理器
 * 用于在设置中配置面板的显示、顺序和位置
 */
import { sidebarConfigStore, sidebarAllPanels, type PanelId, type PanelPosition } from '$lib/stores/sidebarConfig.svelte';
import { Button } from '$lib/components/ui/button';
import * as Switch from '$lib/components/ui/switch';
import { GripVertical, Eye, EyeOff, ArrowLeft, ArrowRight, RotateCcw } from '@lucide/svelte';

// 位置选项
const positionOptions: { value: PanelPosition; label: string }[] = [
	{ value: 'left', label: '左侧' },
	{ value: 'right', label: '右侧' }
];

// 拖拽状态
let draggedPanel: PanelId | null = $state(null);
let dragOverPanel: PanelId | null = $state(null);

function handleDragStart(e: DragEvent, panelId: PanelId) {
	draggedPanel = panelId;
	if (e.dataTransfer) {
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', panelId);
	}
}

function handleDragOver(e: DragEvent, panelId: PanelId) {
	e.preventDefault();
	if (draggedPanel && draggedPanel !== panelId) {
		dragOverPanel = panelId;
	}
}

function handleDragLeave() {
	dragOverPanel = null;
}

function handleDrop(e: DragEvent, targetPanelId: PanelId) {
	e.preventDefault();
	if (!draggedPanel || draggedPanel === targetPanelId) return;
	
	const panels = $sidebarAllPanels;
	const draggedIndex = panels.findIndex((p: { id: PanelId }) => p.id === draggedPanel);
	const targetIndex = panels.findIndex((p: { id: PanelId }) => p.id === targetPanelId);
	
	if (draggedIndex !== -1 && targetIndex !== -1) {
		const targetPanel = panels[targetIndex];
		sidebarConfigStore.movePanel(draggedPanel, targetPanel.order, targetPanel.position);
	}
	
	draggedPanel = null;
	dragOverPanel = null;
}

function handleDragEnd() {
	draggedPanel = null;
	dragOverPanel = null;
}

function toggleVisibility(panelId: PanelId, currentVisible: boolean) {
	sidebarConfigStore.setPanelVisible(panelId, !currentVisible);
}

function changePosition(panelId: PanelId, newPosition: PanelPosition) {
	sidebarConfigStore.setPanelPosition(panelId, newPosition);
}

function resetPanels() {
	sidebarConfigStore.resetPanels();
}
</script>

<div class="sidebar-panel-manager space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">面板管理</h3>
		<Button variant="outline" size="sm" onclick={resetPanels}>
			<RotateCcw class="mr-2 h-4 w-4" />
			重置
		</Button>
	</div>
	
	<p class="text-sm text-muted-foreground">
		拖拽调整面板顺序，点击开关控制显示/隐藏，点击箭头切换位置。
	</p>
	
	<div class="space-y-2">
		{#each $sidebarAllPanels as panel (panel.id)}
			<div
				class="flex items-center gap-3 rounded-lg border p-3 transition-colors {dragOverPanel === panel.id ? 'border-primary bg-accent' : 'bg-card'} {draggedPanel === panel.id ? 'opacity-50' : ''}"
				draggable={panel.canMove}
				ondragstart={(e) => handleDragStart(e, panel.id)}
				ondragover={(e) => handleDragOver(e, panel.id)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, panel.id)}
				ondragend={handleDragEnd}
				role="listitem"
			>
				<!-- 拖拽手柄 -->
				{#if panel.canMove}
					<GripVertical class="h-5 w-5 cursor-grab text-muted-foreground" />
				{:else}
					<div class="w-5"></div>
				{/if}
				
				<!-- 图标和标题 -->
				<div class="flex flex-1 items-center gap-2">
					{@const Icon = panel.icon}
					<Icon class="h-5 w-5 text-muted-foreground" />
					<span class="font-medium">{panel.title}</span>
					<span class="text-xs text-muted-foreground">
						({panel.position === 'left' ? '左侧' : '右侧'})
					</span>
				</div>
				
				<!-- 位置切换 -->
				{#if panel.canMove}
					<div class="flex items-center gap-1">
						<Button
							variant={panel.position === 'left' ? 'default' : 'ghost'}
							size="icon"
							class="h-7 w-7"
							onclick={() => changePosition(panel.id, 'left')}
							title="移到左侧"
						>
							<ArrowLeft class="h-4 w-4" />
						</Button>
						<Button
							variant={panel.position === 'right' ? 'default' : 'ghost'}
							size="icon"
							class="h-7 w-7"
							onclick={() => changePosition(panel.id, 'right')}
							title="移到右侧"
						>
							<ArrowRight class="h-4 w-4" />
						</Button>
					</div>
				{/if}
				
				<!-- 显示/隐藏开关 -->
				{#if panel.canHide}
					<Button
						variant="ghost"
						size="icon"
						class="h-8 w-8"
						onclick={() => toggleVisibility(panel.id, panel.visible)}
						title={panel.visible ? '隐藏面板' : '显示面板'}
					>
						{#if panel.visible}
							<Eye class="h-4 w-4" />
						{:else}
							<EyeOff class="h-4 w-4 text-muted-foreground" />
						{/if}
					</Button>
				{:else}
					<div class="h-8 w-8 flex items-center justify-center" title="此面板不可隐藏">
						<Eye class="h-4 w-4 text-muted-foreground/50" />
					</div>
				{/if}
			</div>
		{/each}
	</div>
	
	<div class="text-xs text-muted-foreground mt-4">
		<p>提示：文件夹面板为核心功能，不可隐藏。</p>
	</div>
</div>
