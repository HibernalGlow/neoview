<script lang="ts">
	/**
	 * CardPanelManager - 卡片面板管理器
	 * 提供现代化的列表管理界面，支持搜索、快速分配和拖拽
	 */
	import {
		cardConfigStore,
		type PanelId,
		type CardConfig,
		getCardSupportingPanels,
		getPanelTitle
	} from '$lib/stores/cardConfig.svelte';
	import { confirm } from '$lib/stores/confirmDialog.svelte';
	import { cardRegistry } from '$lib/cards/registry';
	import { 
		LayoutGrid, Settings2, EyeOff, RotateCcw, ListChecks, 
		PanelLeft, PanelRight, MapPin 
	} from '@lucide/svelte';
	import ManagementListView from '$lib/components/settings/ManagementListView.svelte';
	import ManagementItemCard from '$lib/components/settings/ManagementItemCard.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	// 获取所有支持卡片的面板 ID
	const allPanelIds = getCardSupportingPanels();

	let searchQuery = $state('');
	let viewMode = $state<'grid' | 'list'>('grid');

	// 合并后的所有卡片数据
	const allCards = $derived.by(() => {
		const result: (CardConfig & { panelTitle: string })[] = [];
		for (const panelId of allPanelIds) {
			const cards = cardConfigStore.getPanelCards(panelId);
			result.push(...cards.map(c => ({
				...c,
				panelTitle: getPanelTitle(panelId)
			})));
		}
		return result;
	});

	// 搜索过滤后的卡片
	const filteredCards = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		if (!query) return allCards;
		return allCards.filter(c => 
			c.title.toLowerCase().includes(query) || 
			c.id.toLowerCase().includes(query) ||
			c.panelTitle.toLowerCase().includes(query)
		);
	});

	// 拖拽状态
	type AreaId = 'waitingArea' | PanelId;
	let draggedCard = $state<{ card: CardConfig; source: AreaId } | null>(null);
	let dragOverArea = $state<AreaId | null>(null);
	let isPointerDragging = $state(false);
	let dragPreview = $state<{ x: number; y: number } | null>(null);

	// 拖拽处理函数
	function handlePointerDown(event: PointerEvent, card: CardConfig, source: AreaId) {
		event.preventDefault();
		draggedCard = { card, source };
		isPointerDragging = true;
		dragPreview = { x: event.clientX, y: event.clientY };
	}

	function handleAreaPointerEnter(targetArea: AreaId) {
		if (!isPointerDragging) return;
		dragOverArea = targetArea;
	}

	function handleAreaPointerLeave(targetArea: AreaId) {
		if (!isPointerDragging) return;
		if (dragOverArea === targetArea) {
			dragOverArea = null;
		}
	}

	function finalizeDrop() {
		if (!isPointerDragging || !draggedCard || !dragOverArea) {
			draggedCard = null;
			isPointerDragging = false;
			dragOverArea = null;
			dragPreview = null;
			return;
		}

		const { card, source } = draggedCard;
		const targetArea = dragOverArea;

		if (source === targetArea) {
			draggedCard = null;
			isPointerDragging = false;
			dragOverArea = null;
			dragPreview = null;
			return;
		}

		if (targetArea === 'waitingArea') {
			if (card.canHide) {
				cardConfigStore.setCardVisible(card.panelId, card.id, false);
			}
		} else {
			// 移动到另一个面板（暂不支持跨面板直接拖拽逻辑，除非先移动到目标面板再设为可见，
			// 这里简单处理为在当前面板内切换可见性，真正的跨面板通过下拉菜单实现）
			cardConfigStore.setCardVisible(card.panelId, card.id, true);
		}

		draggedCard = null;
		isPointerDragging = false;
		dragOverArea = null;
		dragPreview = null;
	}

	// 保存提示消息
	let saveMessage = $state<string | null>(null);

	// 重置布局
	async function resetLayout() {
		const confirmed = await confirm({
			title: '确认重置',
			description: '确定要重置所有卡片布局吗？',
			confirmText: '重置',
			cancelText: '取消',
			variant: 'warning'
		});
		if (confirmed) {
			cardConfigStore.resetAll();
			saveMessage = '✓ 布局已重置';
			setTimeout(() => { saveMessage = null; }, 2000);
		}
	}

	// 分配卡片到面板
	function assignCard(card: CardConfig, targetPanelId: PanelId | 'hidden') {
		if (targetPanelId === 'hidden') {
			cardConfigStore.setCardVisible(card.panelId, card.id, false);
		} else {
			// 如果已经在该面板，仅显示
			if (card.panelId === targetPanelId) {
				cardConfigStore.setCardVisible(card.panelId, card.id, true);
			} else {
				// 跨面板移动：目前 store 主要是通过 visible 控制，
				// 实际业务逻辑中，某些卡片可能固定在某些面板。
				// 这里遵循 registry 中的定义或允许灵活移动。
				cardConfigStore.moveCardToPanel?.(card.id, targetPanelId);
				cardConfigStore.setCardVisible(targetPanelId, card.id, true);
			}
		}
	}

	$effect(() => {
		function handleWindowPointerUp() {
			if (!isPointerDragging) return;
			finalizeDrop();
		}
		window.addEventListener('pointerup', handleWindowPointerUp);
		return () => { window.removeEventListener('pointerup', handleWindowPointerUp); };
	});

	$effect(() => {
		if (!isPointerDragging) return;
		function handleWindowPointerMove(e: PointerEvent) {
			dragPreview = { x: e.clientX, y: e.clientY };
		}
		window.addEventListener('pointermove', handleWindowPointerMove);
		return () => { window.removeEventListener('pointermove', handleWindowPointerMove); };
	});
</script>

<div class="h-full flex flex-col bg-background p-6 overflow-auto">
	<ManagementListView
		title="卡片管理"
		description="管理所有功能卡片的放置面板、排列顺序和显示状态。"
		bind:searchQuery
		onSearchChange={(val) => searchQuery = val}
		{viewMode}
		onViewModeChange={(mode) => viewMode = mode}
	>
		{#snippet actions()}
			<div class="flex items-center gap-2">
				{#if saveMessage}
					<span class="text-xs text-green-600 font-medium animate-in fade-in slide-in-from-right-2">{saveMessage}</span>
				{/if}
				<Button variant="outline" size="sm" onclick={resetLayout} class="h-10 rounded-xl gap-2">
					<RotateCcw class="h-4 w-4" />
					归位
				</Button>
				<Button variant="default" size="sm" onclick={() => { saveMessage = '✓ 已应用'; setTimeout(() => saveMessage = null, 2000); }} class="h-10 rounded-xl gap-2 shadow-sm">
					<ListChecks class="h-4 w-4" />
					保存配置
				</Button>
			</div>
		{/snippet}

		{#each filteredCards as card, index (card.id)}
			{@const cardDef = cardRegistry[card.id]}
			<ManagementItemCard
				id={card.id}
				title={card.title}
				icon={cardDef?.icon}
				subtitle={`ID: ${card.id}`}
				status={card.visible ? card.panelTitle : '隐藏'}
				statusColor={card.visible ? 'default' : 'outline'}
				active={isPointerDragging && draggedCard?.card.id === card.id}
				isFirst={index === 0}
				isLast={index === filteredCards.length - 1}
				onMoveUp={() => {
					const list = cardConfigStore.getPanelCards(card.panelId);
					const currentIndex = list.findIndex(c => c.id === card.id);
					if (currentIndex > 0) {
						cardConfigStore.moveCard(card.panelId, card.id, card.order - 1);
					}
				}}
				onMoveDown={() => {
					const list = cardConfigStore.getPanelCards(card.panelId);
					const currentIndex = list.findIndex(c => c.id === card.id);
					if (currentIndex < list.length - 1) {
						cardConfigStore.moveCard(card.panelId, card.id, card.order + 1);
					}
				}}
				onToggleVisible={() => {
					if (card.canHide) {
						cardConfigStore.setCardVisible(card.panelId, card.id, !card.visible);
					}
				}}
				onPointerDown={(e) => handlePointerDown(e, card, card.visible ? card.panelId : 'waitingArea')}
			>
				{#snippet assignOptions()}
					{#each allPanelIds as panelId}
						<DropdownMenu.Item onclick={() => assignCard(card, panelId)}>
							<MapPin class="mr-2 h-4 w-4" />
							<span>{getPanelTitle(panelId)}</span>
						</DropdownMenu.Item>
					{/each}
					{#if card.canHide}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => assignCard(card, 'hidden')}>
							<EyeOff class="mr-2 h-4 w-4" />
							<span>隐藏卡片</span>
						</DropdownMenu.Item>
					{/if}
				{/snippet}
			</ManagementItemCard>
		{/each}

		{#if filteredCards.length === 0}
			<div class="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/5 rounded-3xl border-2 border-dashed border-muted">
				<LayoutGrid class="h-12 w-12 opacity-20 mb-4" />
				<p>未找到匹配的卡片</p>
			</div>
		{/if}
	</ManagementListView>

	<!-- 拖拽预览 -->
	{#if isPointerDragging && dragPreview && draggedCard}
		{@const cardDef = cardRegistry[draggedCard.card.id]}
		<div class="pointer-events-none fixed z-[100]" style="left: {dragPreview.x}px; top: {dragPreview.y}px; transform: translate(-50%, -50%);">
			<div class="bg-card/90 backdrop-blur-md flex items-center gap-3 rounded-2xl border border-primary/50 px-4 py-3 shadow-2xl animate-in zoom-in-95">
				{#if cardDef?.icon}
					<div class="bg-primary/10 p-1.5 rounded-lg text-primary">
						<svelte:component this={cardDef.icon} class="h-5 w-5" />
					</div>
				{/if}
				<span class="font-semibold text-sm">{draggedCard.card.title}</span>
			</div>
		</div>
	{/if}
</div>
