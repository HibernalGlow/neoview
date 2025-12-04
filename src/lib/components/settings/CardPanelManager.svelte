<script lang="ts">
/**
 * CardPanelManager - 卡片面板管理器
 * 类似边栏管理：每个面板作为一个区域，卡片可以在面板内排序和跨面板移动
 */
import { cardConfigStore, type PanelId, type CardConfig, getCardSupportingPanels, getPanelTitle } from '$lib/stores/cardConfig.svelte';
import { Button } from '$lib/components/ui/button';
import { GripVertical, Eye, EyeOff, ChevronDown, ChevronRight, RotateCcw, LayoutGrid, ArrowLeft, ArrowRight } from '@lucide/svelte';

// 获取所有支持卡片的面板
const allPanels = getCardSupportingPanels();

// 拖拽状态
let draggedCard: { id: string; panelId: PanelId } | null = $state(null);
let dragOverPanel: PanelId | null = $state(null);

// 所有面板的卡片
const allCards = $derived.by(() => {
	const result: { panelId: PanelId; title: string; cards: CardConfig[] }[] = [];
	for (const panelId of allPanels) {
		result.push({
			panelId,
			title: getPanelTitle(panelId),
			cards: cardConfigStore.getPanelCards(panelId)
		});
	}
	return result;
});

function handleDragStart(e: DragEvent, cardId: string, panelId: PanelId) {
	draggedCard = { id: cardId, panelId };
	if (e.dataTransfer) {
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', `${panelId}:${cardId}`);
	}
}

function handleDragOverPanel(e: DragEvent, panelId: PanelId) {
	e.preventDefault();
	if (draggedCard && draggedCard.panelId !== panelId) {
		dragOverPanel = panelId;
	}
}

function handleDragLeavePanel() {
	dragOverPanel = null;
}

function handleDropOnPanel(e: DragEvent, targetPanelId: PanelId) {
	e.preventDefault();
	if (!draggedCard) return;
	
	// 跨面板移动（简化实现：暂时只支持同面板内排序）
	// TODO: 实现跨面板移动
	
	draggedCard = null;
	dragOverPanel = null;
}

function handleDragEnd() {
	draggedCard = null;
	dragOverPanel = null;
}

function toggleVisibility(panelId: PanelId, cardId: string, currentVisible: boolean) {
	cardConfigStore.setCardVisible(panelId, cardId, !currentVisible);
}

function toggleExpanded(panelId: PanelId, cardId: string, currentExpanded: boolean) {
	cardConfigStore.setCardExpanded(panelId, cardId, !currentExpanded);
}

function moveCardUp(panelId: PanelId, card: CardConfig) {
	if (card.order > 0) {
		cardConfigStore.moveCard(panelId, card.id, card.order - 1);
	}
}

function moveCardDown(panelId: PanelId, card: CardConfig, maxOrder: number) {
	if (card.order < maxOrder) {
		cardConfigStore.moveCard(panelId, card.id, card.order + 1);
	}
}

function resetAll() {
	cardConfigStore.resetAll();
}
</script>

<div class="card-panel-manager space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold flex items-center gap-2">
			<LayoutGrid class="h-5 w-5" />
			卡片管理
		</h3>
		<Button variant="outline" size="sm" onclick={resetAll}>
			<RotateCcw class="mr-2 h-4 w-4" />
			重置全部
		</Button>
	</div>
	
	<p class="text-sm text-muted-foreground">
		每个面板区域显示其包含的卡片，可调整顺序和显示状态。
	</p>
	
	<!-- 面板区域列表 -->
	<div class="space-y-4">
		{#each allCards as panel (panel.panelId)}
			<div 
				class="rounded-lg border {dragOverPanel === panel.panelId ? 'border-primary bg-accent/50' : ''}"
				ondragover={(e) => handleDragOverPanel(e, panel.panelId)}
				ondragleave={handleDragLeavePanel}
				ondrop={(e) => handleDropOnPanel(e, panel.panelId)}
			>
				<!-- 面板标题 -->
				<div class="px-3 py-2 border-b bg-muted/50 rounded-t-lg">
					<span class="font-semibold text-sm">{panel.title}</span>
					<span class="text-xs text-muted-foreground ml-2">({panel.cards.length} 张卡片)</span>
				</div>
				
				<!-- 卡片列表 -->
				<div class="p-2 space-y-1">
					{#each panel.cards as card (card.id)}
						<div
							class="flex items-center gap-2 rounded border p-2 transition-colors bg-card {!card.visible ? 'opacity-60' : ''}"
							draggable="true"
							ondragstart={(e) => handleDragStart(e, card.id, panel.panelId)}
							ondragend={handleDragEnd}
							role="listitem"
						>
							<!-- 拖拽手柄 -->
							<GripVertical class="h-4 w-4 cursor-grab text-muted-foreground" />
							
							<!-- 标题 -->
							<span class="flex-1 text-sm">{card.title}</span>
							
							<!-- 上下移动 -->
							<Button
								variant="ghost"
								size="icon"
								class="h-6 w-6"
								onclick={() => moveCardUp(panel.panelId, card)}
								disabled={card.order === 0}
								title="上移"
							>
								<ChevronDown class="h-3 w-3 rotate-180" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-6 w-6"
								onclick={() => moveCardDown(panel.panelId, card, panel.cards.length - 1)}
								disabled={card.order === panel.cards.length - 1}
								title="下移"
							>
								<ChevronDown class="h-3 w-3" />
							</Button>
							
							<!-- 展开/收起 -->
							<Button
								variant={card.expanded ? 'default' : 'ghost'}
								size="icon"
								class="h-6 w-6"
								onclick={() => toggleExpanded(panel.panelId, card.id, card.expanded)}
								title={card.expanded ? '收起' : '展开'}
							>
								{#if card.expanded}
									<ChevronRight class="h-3 w-3 rotate-90" />
								{:else}
									<ChevronRight class="h-3 w-3" />
								{/if}
							</Button>
							
							<!-- 显示/隐藏 -->
							{#if card.canHide}
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6"
									onclick={() => toggleVisibility(panel.panelId, card.id, card.visible)}
									title={card.visible ? '隐藏' : '显示'}
								>
									{#if card.visible}
										<Eye class="h-3 w-3" />
									{:else}
										<EyeOff class="h-3 w-3 text-muted-foreground" />
									{/if}
								</Button>
							{:else}
								<div class="h-6 w-6 flex items-center justify-center">
									<Eye class="h-3 w-3 text-muted-foreground/50" />
								</div>
							{/if}
						</div>
					{/each}
					
					{#if panel.cards.length === 0}
						<div class="text-center py-4 text-sm text-muted-foreground">
							暂无卡片
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
	
	<div class="text-xs text-muted-foreground space-y-1">
		<p>💡 使用上下箭头调整卡片顺序</p>
		<p>📌 设置会自动保存到本地</p>
	</div>
</div>
