<script lang="ts">
/**
 * CardPanelManager - 卡片面板管理器
 * 用于在设置中配置各面板内卡片的顺序、显示和展开状态
 * 使用通用 DraggableListManager 组件
 */
import { cardConfigStore, type PanelId } from '$lib/stores/cardConfig.svelte';
import { Button } from '$lib/components/ui/button';
import { RotateCcw, LayoutGrid } from '@lucide/svelte';
import { DraggableListManager } from '$lib/components/ui/draggable-list';

// 当前选中的面板
let selectedPanel = $state<PanelId>('benchmark');

function handleMove(cardId: string, newOrder: number) {
	cardConfigStore.moveCard(selectedPanel, cardId, newOrder);
}

function handleVisibilityChange(cardId: string, visible: boolean) {
	cardConfigStore.setCardVisible(selectedPanel, cardId, visible);
}

function handleExpandChange(cardId: string, expanded: boolean) {
	cardConfigStore.setCardExpanded(selectedPanel, cardId, expanded);
}

function resetCurrentPanel() {
	cardConfigStore.resetPanel(selectedPanel);
}

function resetAll() {
	cardConfigStore.resetAll();
}

const panels = cardConfigStore.getAllPanels();
const currentPanelCards = $derived(cardConfigStore.getPanelCards(selectedPanel));
</script>

<div class="card-panel-manager space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold flex items-center gap-2">
			<LayoutGrid class="h-5 w-5" />
			卡片管理
		</h3>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={resetCurrentPanel}>
				<RotateCcw class="mr-2 h-4 w-4" />
				重置当前
			</Button>
			<Button variant="outline" size="sm" onclick={resetAll}>
				<RotateCcw class="mr-2 h-4 w-4" />
				重置全部
			</Button>
		</div>
	</div>
	
	<p class="text-sm text-muted-foreground">
		选择面板后，拖拽调整卡片顺序，点击眼睛控制显示/隐藏，点击箭头控制展开/收起。
	</p>
	
	<!-- 面板选择 -->
	<div class="flex flex-wrap gap-2 border-b pb-2">
		{#each panels as panel}
			<Button
				variant={selectedPanel === panel.panelId ? 'default' : 'outline'}
				size="sm"
				onclick={() => selectedPanel = panel.panelId}
			>
				{panel.title}
			</Button>
		{/each}
	</div>
	
	<!-- 卡片列表 -->
	<DraggableListManager
		items={currentPanelCards}
		showExpand={true}
		onMove={handleMove}
		onVisibilityChange={handleVisibilityChange}
		onExpandChange={handleExpandChange}
	/>
	
	<div class="text-xs text-muted-foreground mt-4 space-y-1">
		<p>💡 拖拽卡片可调整顺序</p>
		<p>👁️ 部分核心卡片不可隐藏</p>
		<p>📌 设置会自动保存到本地</p>
	</div>
</div>
