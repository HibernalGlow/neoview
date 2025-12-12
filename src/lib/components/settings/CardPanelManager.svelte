<script lang="ts">
	/**
	 * CardPanelManager - 卡片面板管理器
	 * 完全复制 SidebarManagementPanel 的三区域拖拽布局
	 * 区域：等待区（隐藏）+ 各面板区（信息、属性、超分、洞察、基准测试）
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

	// 获取所有支持卡片的面板 ID
	const allPanelIds = getCardSupportingPanels();

	// 各面板的卡片列表
	const panelCards = $derived.by(() => {
		const result: Record<PanelId, CardConfig[]> = {} as Record<PanelId, CardConfig[]>;
		for (const panelId of allPanelIds) {
			result[panelId] = cardConfigStore.getPanelCards(panelId).filter((c) => c.visible);
		}
		return result;
	});

	// 隐藏的卡片（等待区）
	const hiddenCards = $derived.by(() => {
		const result: CardConfig[] = [];
		for (const panelId of allPanelIds) {
			const cards = cardConfigStore.getPanelCards(panelId).filter((c) => !c.visible);
			result.push(...cards);
		}
		return result;
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

		// 如果目标区域和源区域相同，不做任何操作
		if (source === targetArea) {
			draggedCard = null;
			isPointerDragging = false;
			dragOverArea = null;
			dragPreview = null;
			return;
		}

		// 移动到等待区（隐藏）
		if (targetArea === 'waitingArea') {
			if (card.canHide) {
				cardConfigStore.setCardVisible(card.panelId, card.id, false);
			}
		} else {
			// 移动到某个面板
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
			setTimeout(() => {
				saveMessage = null;
			}, 2000);
		}
	}

	// 移动卡片顺序
	function moveCardUp(card: CardConfig, cards: CardConfig[]) {
		const currentIndex = cards.findIndex((c) => c.id === card.id);
		if (currentIndex <= 0) return;
		cardConfigStore.moveCard(card.panelId, card.id, card.order - 1);
	}

	function moveCardDown(card: CardConfig, cards: CardConfig[]) {
		const currentIndex = cards.findIndex((c) => c.id === card.id);
		if (currentIndex < 0 || currentIndex >= cards.length - 1) return;
		cardConfigStore.moveCard(card.panelId, card.id, card.order + 1);
	}

	$effect(() => {
		function handleWindowPointerUp() {
			if (!isPointerDragging) return;
			finalizeDrop();
		}
		window.addEventListener('pointerup', handleWindowPointerUp);
		return () => {
			window.removeEventListener('pointerup', handleWindowPointerUp);
		};
	});

	$effect(() => {
		if (!isPointerDragging) return;
		function handleWindowPointerMove(e: PointerEvent) {
			dragPreview = { x: e.clientX, y: e.clientY };
		}
		window.addEventListener('pointermove', handleWindowPointerMove);
		return () => {
			window.removeEventListener('pointermove', handleWindowPointerMove);
		};
	});

	// 动态计算列数（最多3列）
	const gridCols = $derived(Math.min(allPanelIds.length + 1, 3));
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="text-lg font-semibold">卡片管理</h3>
		<p class="text-muted-foreground text-sm">拖拽卡片到不同面板区域来自定义布局</p>
	</div>

	<!-- 操作按钮 -->
	<div class="flex items-center gap-2">
		<button
			type="button"
			class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm transition-colors"
			onclick={() => {
				saveMessage = '✓ 已保存';
				setTimeout(() => (saveMessage = null), 2000);
			}}
		>
			保存
		</button>
		<button
			type="button"
			class="bg-secondary hover:bg-secondary/80 rounded-md px-3 py-1.5 text-sm transition-colors"
			onclick={resetLayout}
		>
			重置布局
		</button>
		{#if saveMessage}
			<span class="text-sm text-green-600">{saveMessage}</span>
		{/if}
	</div>

	<!-- 多栏布局：等待区 + 各面板区（动态列数，最多3列） -->
	<div
		class="grid min-h-[300px] gap-4"
		style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr))"
	>
		<!-- 等待区 -->
		<div
			class="rounded-lg border-2 border-dashed p-4 {dragOverArea === 'waitingArea'
				? 'border-primary bg-primary/5'
				: 'border-muted-foreground/30'}"
			onpointerenter={() => handleAreaPointerEnter('waitingArea')}
			onpointerleave={() => handleAreaPointerLeave('waitingArea')}
		>
			<h4 class="mb-3 text-center text-sm font-medium">等待区（隐藏）</h4>
			<div class="flex min-h-[60px] flex-wrap content-start gap-1.5">
				{#each hiddenCards as card (card.id)}
					{@const cardDef = cardRegistry[card.id]}
					<div
						class="bg-muted/50 hover:bg-accent hover:border-accent group inline-flex cursor-grab select-none items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:cursor-grabbing {isPointerDragging &&
						draggedCard?.card.id === card.id
							? 'scale-95 opacity-50'
							: ''}"
						onpointerdown={(e) => handlePointerDown(e, card, 'waitingArea')}
					>
						<svg
							class="text-muted-foreground h-3 w-3 opacity-50 group-hover:opacity-100"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path
								d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
							></path>
						</svg>
						{#if cardDef?.icon}
							<svelte:component this={cardDef.icon} class="h-3.5 w-3.5" />
						{/if}
						<span>{card.title}</span>
					</div>
				{/each}
				{#if hiddenCards.length === 0}
					<div class="text-muted-foreground w-full py-4 text-center text-xs">
						拖拽卡片到这里隐藏
					</div>
				{/if}
			</div>
		</div>

		<!-- 各面板区 -->
		{#each allPanelIds as panelId (panelId)}
			{@const cards = panelCards[panelId] || []}
			<div
				class="rounded-lg border-2 border-dashed p-4 {dragOverArea === panelId
					? 'border-primary bg-primary/5'
					: 'border-muted-foreground/30'}"
				onpointerenter={() => handleAreaPointerEnter(panelId)}
				onpointerleave={() => handleAreaPointerLeave(panelId)}
			>
				<h4 class="mb-3 text-center text-sm font-medium">{getPanelTitle(panelId)}</h4>
				<div class="flex min-h-[60px] flex-wrap content-start gap-1.5">
					{#each cards as card, index (card.id)}
						{@const cardDef = cardRegistry[card.id]}
						<div
							class="bg-muted/50 hover:bg-accent hover:border-accent group inline-flex select-none items-center gap-1 rounded-full border px-1 py-0.5 text-xs font-medium transition-all {isPointerDragging &&
							draggedCard?.card.id === card.id
								? 'scale-95 opacity-50'
								: ''}"
						>
							<!-- 上移按钮 -->
							<button
								type="button"
								class="hover:bg-background/50 rounded p-0.5 disabled:opacity-30"
								disabled={index === 0}
								onclick={() => moveCardUp(card, cards)}
								title="上移"
							>
								<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 15l7-7 7 7"
									></path>
								</svg>
							</button>
							<!-- 拖拽手柄 -->
							<div
								class="cursor-grab px-1 active:cursor-grabbing"
								onpointerdown={(e) => handlePointerDown(e, card, panelId)}
							>
								{#if cardDef?.icon}
									<svelte:component this={cardDef.icon} class="mr-1 inline h-3.5 w-3.5" />
								{/if}
								<span>{card.title}</span>
							</div>
							<!-- 下移按钮 -->
							<button
								type="button"
								class="hover:bg-background/50 rounded p-0.5 disabled:opacity-30"
								disabled={index === cards.length - 1}
								onclick={() => moveCardDown(card, cards)}
								title="下移"
							>
								<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									></path>
								</svg>
							</button>
						</div>
					{/each}
					{#if cards.length === 0}
						<div class="text-muted-foreground w-full py-4 text-center text-xs">拖拽卡片到这里</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<!-- 拖拽预览 -->
	{#if isPointerDragging && dragPreview && draggedCard}
		{@const cardDef = cardRegistry[draggedCard.card.id]}
		<div
			class="pointer-events-none fixed z-50"
			style="left: {dragPreview.x}px; top: {dragPreview.y}px; transform: translate(-50%, -50%);"
		>
			<div
				class="bg-accent inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shadow-lg"
			>
				{#if cardDef?.icon}
					<svelte:component this={cardDef.icon} class="h-3.5 w-3.5" />
				{/if}
				<span>{draggedCard.card.title}</span>
			</div>
		</div>
	{/if}
</div>
