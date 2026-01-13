<script lang="ts">
	/**
	 * CardPanelManager - 卡片面板管理器
	 * 提供现代化的表格管理界面，支持搜索、快速分配和拖拽
	 */
	import {
		cardConfigStore,
		type PanelId,
		type CardConfig,
		getCardSupportingPanels,
		getPanelTitle
	} from '$lib/stores/cardConfig.svelte';
	import { PANEL_DEFINITIONS } from '$lib/stores/sidebarConfig.svelte';
	import { confirm } from '$lib/stores/confirmDialog.svelte';
	import { cardRegistry } from '$lib/cards/registry';
	import {
		LayoutGrid,
		Settings2,
		EyeOff,
		RotateCcw,
		ListChecks,
		PanelLeft,
		PanelRight,
		MapPin,
		Search,
		ArrowUp,
		ArrowDown,
		MoreHorizontal,
		GripVertical,
		Eye,
		Filter
	} from '@lucide/svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { cn } from '$lib/utils';

	// 获取所有支持卡片的面板 ID
	const allPanelIds = getCardSupportingPanels();

	let searchQuery = $state('');
	// 默认按面板过滤，初始化为“全部”
	let panelFilter = $state<string>('all');

	// 合并后的所有卡片数据
	const allCards = $derived.by(() => {
		const result: (CardConfig & { panelTitle: string })[] = [];
		for (const panelId of allPanelIds) {
			const cards = cardConfigStore.getPanelCards(panelId);
			result.push(
				...cards.map((c) => ({
					...c,
					panelTitle: getPanelTitle(panelId)
				}))
			);
		}
		return result;
	});

	// 当前筛选后的卡片列表
	const filteredCards = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		if (!panelFilter) return [];

		let cards: (CardConfig & { panelTitle: string })[] = [];
		if (panelFilter === 'all') {
			cards = allCards;
		} else {
			cards = cardConfigStore.getPanelCards(panelFilter as PanelId).map((c) => ({
				...c,
				panelTitle: getPanelTitle(panelFilter as PanelId)
			}));
		}

		return !query
			? cards
			: cards.filter(
					(c) =>
						c.title.toLowerCase().includes(query) || c.id.toLowerCase().includes(query)
				);
	});

	// 各面板卡片数量计数
	const groupCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const id of allPanelIds) {
			counts[id] = cardConfigStore.getPanelCards(id as PanelId).length;
		}
		return counts;
	});

	// 拖拽状态
	let draggedCardId = $state<string | null>(null);
	let isPointerDragging = $state(false);
	let dragPreview = $state<{ x: number; y: number } | null>(null);
	let dropTargetCardId = $state<string | null>(null);
	let dragHandleElement = $state<HTMLElement | null>(null);

	// 拖拽处理函数
	function handlePointerDown(event: PointerEvent, card: CardConfig) {
		const handle = (event.target as HTMLElement).closest('.drag-handle') as HTMLElement;
		if (!handle) return;
		event.preventDefault();
		event.stopPropagation();
		draggedCardId = card.id;
		isPointerDragging = true;
		dragPreview = { x: event.clientX, y: event.clientY };
		dragHandleElement = handle;
		handle.setPointerCapture(event.pointerId);
	}

	// 悬停检测 - 设置放置目标
	function handleDragEnter(cardId: string) {
		if (isPointerDragging && draggedCardId && cardId !== draggedCardId) {
			dropTargetCardId = cardId;
		}
	}

	$effect(() => {
		function handleWindowPointerUp(e: PointerEvent) {
			if (!isPointerDragging) return;

			// 如果有有效的放置目标，执行顺序交换
			if (draggedCardId && dropTargetCardId && draggedCardId !== dropTargetCardId) {
				const draggedCard = filteredCards.find(c => c.id === draggedCardId);
				const targetCard = filteredCards.find(c => c.id === dropTargetCardId);

				if (draggedCard && targetCard && draggedCard.panelId === targetCard.panelId) {
					const targetIndex = filteredCards.findIndex(c => c.id === dropTargetCardId);
					cardConfigStore.moveCard(draggedCard.panelId, draggedCardId, targetIndex);
				}
			}

			// 释放指针捕获
			if (dragHandleElement) {
				dragHandleElement.releasePointerCapture(e.pointerId);
			}

			isPointerDragging = false;
			draggedCardId = null;
			dragPreview = null;
			dropTargetCardId = null;
			dragHandleElement = null;
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

	// 保存提示消息
	let saveMessage = $state<string | null>(null);

	async function resetLayout() {
		const confirmed = await confirm({
			title: '确认重置',
			description: '确定要将所有卡片恢复到其默认面板吗？',
			confirmText: '恢复',
			cancelText: '取消',
			variant: 'warning'
		});
		if (confirmed) {
			cardConfigStore.reset();
			saveMessage = '✓ 已恢复默认';
			setTimeout(() => {
				saveMessage = null;
			}, 2000);
		}
	}

	function assignCard(card: CardConfig, targetPanelId: string) {
		if (targetPanelId === 'hidden') {
			cardConfigStore.setCardVisible(card.panelId, card.id, false);
		} else {
			cardConfigStore.moveCardToPanel(card.id, targetPanelId as PanelId);
			cardConfigStore.setCardVisible(targetPanelId as PanelId, card.id, true);
		}
	}

	function restoreCard(card: CardConfig) {
		const def = cardRegistry[card.id];
		if (def) {
			cardConfigStore.moveCardToPanel(card.id, def.defaultPanel);
			cardConfigStore.setCardVisible(def.defaultPanel, card.id, true);
		}
	}
</script>

<div class="flex h-full flex-col gap-6 overflow-hidden p-1">
	<div class="flex flex-col gap-1.5 px-1">
		<h3 class="text-xl font-bold tracking-tight">卡片组件管理</h3>
		<p class="text-muted-foreground text-sm">精细化配置各面板内显示的卡片内容及排序。</p>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-4 px-1">
		<div class="relative w-full max-w-sm">
			<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
			<Input
				bind:value={searchQuery}
				placeholder="搜索卡片..."
				class="h-10 rounded-xl pl-9"
			/>
		</div>

		<div class="flex items-center gap-2">
			{#if saveMessage}
				<span class="animate-in fade-in slide-in-from-right-2 text-xs font-medium text-green-600"
					>{saveMessage}</span
				>
			{/if}
			<Button variant="outline" size="sm" onclick={resetLayout} class="h-10 gap-2 rounded-xl">
				<RotateCcw class="h-4 w-4" />
				归位
			</Button>
			<Button
				variant="default"
				size="sm"
				onclick={() => {
					saveMessage = '✓ 已应用';
					setTimeout(() => (saveMessage = null), 2000);
				}}
				class="h-10 gap-2 rounded-xl shadow-sm"
			>
				<ListChecks class="h-4 w-4" />
				应用配置
			</Button>
		</div>
	</div>

	<!-- 分组标签页 -->
	<div class="flex items-center gap-2 px-1">
		<Tabs.Root
			value={panelFilter}
			onValueChange={(v) => (panelFilter = v as any)}
			class="w-full"
		>
			<Tabs.List
				class="bg-muted/50 flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border p-1 shadow-sm"
			>
				<Tooltip.Provider>
					<Tooltip.Root delayDuration={300}>
						<Tooltip.Trigger asChild>
							{#snippet children({ props })}
								<Tabs.Trigger
									{...props}
									value="all"
									class="data-[state=active]:bg-background data-[state=active]:text-primary flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all data-[state=active]:shadow-sm"
								>
									<LayoutGrid class="h-4 w-4" />
									<Badge
										variant="secondary"
										class="h-4.5 min-w-4.5 justify-center px-1 text-[9px] opacity-70"
									>
										{allCards.length}
									</Badge>
								</Tabs.Trigger>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="top" class="rounded-lg px-2 py-1 text-xs">显示全部卡片</Tooltip.Content>
					</Tooltip.Root>

					{#each allPanelIds as panelId}
						{@const panelDef = (PANEL_DEFINITIONS as any)[panelId]}
						{@const title = getPanelTitle(panelId)}
						<Tooltip.Root delayDuration={300}>
							<Tooltip.Trigger asChild>
								{#snippet children({ props })}
									<Tabs.Trigger
										{...props}
										value={panelId}
										class="data-[state=active]:bg-background data-[state=active]:text-primary flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all data-[state=active]:shadow-sm"
									>
										{#if panelDef?.icon}
											<svelte:component this={panelDef.icon} class="h-4 w-4" />
										{:else}
											<MapPin class="h-4 w-4" />
										{/if}
										<Badge
											variant="secondary"
											class="h-4.5 min-w-4.5 justify-center px-1 text-[9px] opacity-70"
										>
											{groupCounts[panelId] || 0}
										</Badge>
									</Tabs.Trigger>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="top" class="rounded-lg px-2 py-1 text-xs">{title}</Tooltip.Content>
						</Tooltip.Root>
					{/each}
				</Tooltip.Provider>
			</Tabs.List>
		</Tabs.Root>
	</div>

	<div class="bg-card flex-1 overflow-hidden rounded-2xl border shadow-sm">
		<Table.Root class="table-fixed">
			<Table.Header class="bg-muted/50 sticky top-0 z-10 backdrop-blur-md">
				<Table.Row>
					<Table.Head class="w-10 px-2"></Table.Head>
					<Table.Head class="w-12 px-0 text-center">图标</Table.Head>
					<Table.Head class="w-auto">名称</Table.Head>
					<Table.Head class="w-[110px] px-2 text-center">所属面板</Table.Head>
					<Table.Head class="w-[120px] pr-4 text-right">操作</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each filteredCards as card, index (card.id + card.panelId)}
					{@const cardDef = cardRegistry[card.id]}
					{#if panelFilter === 'all' && (index === 0 || filteredCards[index - 1].panelId !== card.panelId)}
						<Table.Row class="bg-muted/20 hover:bg-muted/20">
							<Table.Cell colspan={5} class="px-4 py-2 text-left">
								<div
									class="text-muted-foreground/60 flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
								>
									<MapPin class="h-3 w-3" />
									{getPanelTitle(card.panelId)}
								</div>
							</Table.Cell>
						</Table.Row>
					{/if}
					<Table.Row
						onpointerenter={() => handleDragEnter(card.id)}
						class={cn(
							'group transition-colors',
							isPointerDragging && draggedCardId === card.id && 'bg-muted/30 opacity-50 grayscale',
							isPointerDragging &&
								dropTargetCardId === card.id &&
								draggedCardId !== card.id &&
								'bg-primary/10 ring-primary/50 ring-2'
						)}
					>
						<Table.Cell class="px-2">
							<div
								class="drag-handle text-muted-foreground/20 group-hover:text-muted-foreground/60 flex cursor-grab items-center justify-center p-1 transition-colors"
								onpointerdown={(e) => handlePointerDown(e, card)}
							>
								<GripVertical class="h-4 w-4" />
							</div>
						</Table.Cell>
						<Table.Cell class="px-0">
							<div class="flex items-center justify-center">
								<div
									class="bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground flex h-9 w-9 items-center justify-center rounded-xl shadow-sm transition-all duration-300"
								>
									{#if cardDef?.icon}
										<svelte:component this={cardDef.icon} class="h-4.5 w-4.5" />
									{:else}
										<LayoutGrid class="h-4.5 w-4.5" />
									{/if}
								</div>
							</div>
						</Table.Cell>
						<Table.Cell class="min-w-0 px-2">
							<div class="flex min-w-0 flex-col overflow-hidden">
								<span class="block truncate font-medium" title={card.title}>{card.title}</span>
								<span
									class="text-muted-foreground block truncate font-mono text-[10px] uppercase opacity-50"
									>{card.id}</span
								>
							</div>
						</Table.Cell>
						<Table.Cell class="px-1 text-center">
							<DropdownMenu.Root>
								<DropdownMenu.Trigger asChild>
									{#snippet children({ props })}
										<Button
											{...props}
											variant="ghost"
											size="sm"
											class="hover:bg-muted h-7 rounded-lg px-1 font-normal"
										>
											<Badge
												variant={card.visible ? 'default' : 'outline'}
												class="pointer-events-none block h-4 max-w-[80px] truncate px-1 text-center text-[9px] font-bold uppercase tracking-tighter"
											>
												{getPanelTitle(card.panelId)}
											</Badge>
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content
									align="start"
									class="max-h-[300px] overflow-y-auto rounded-xl p-1 shadow-lg"
								>
									<DropdownMenu.Label
										class="text-muted-foreground px-2 py-1.5 text-[10px] font-bold uppercase"
										>分配到面板</DropdownMenu.Label
									>
									{#each allPanelIds as panelId}
										<DropdownMenu.Item
											onclick={() => assignCard(card, panelId)}
											class="gap-2 rounded-lg"
										>
											<MapPin class="text-muted-foreground/50 h-4 w-4" />
											<span>{getPanelTitle(panelId)}</span>
										</DropdownMenu.Item>
									{/each}
									{#if card.canHide}
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											onclick={() => assignCard(card, 'hidden')}
											class="text-destructive focus:text-destructive gap-2 rounded-lg"
										>
											<EyeOff class="h-4 w-4" />
											<span>隐藏卡片</span>
										</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</Table.Cell>
						<Table.Cell class="pr-4 text-right">
							<div class="flex items-center justify-end gap-0.5">
								{#if !card.visible}
									<Button
										variant="ghost"
										size="icon"
										class="text-primary hover:bg-primary/10 h-8 w-8 rounded-lg"
										onclick={() => restoreCard(card)}
										title="恢复到默认面板"
									>
										<RotateCcw class="h-4 w-4" />
									</Button>
								{:else}
									<Button
										variant="ghost"
										size="icon"
										class="h-7 w-7 rounded-lg lg:h-8 lg:w-8"
										disabled={index === 0}
										onclick={() => {
											const list = cardConfigStore.getPanelCards(card.panelId);
											const idx = list.findIndex((c) => c.id === card.id);
											if (idx > 0) cardConfigStore.moveCard(card.panelId, card.id, idx - 1);
										}}
									>
										<ArrowUp class="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="h-7 w-7 rounded-lg lg:h-8 lg:w-8"
										disabled={index === filteredCards.length - 1}
										onclick={() => {
											const list = cardConfigStore.getPanelCards(card.panelId);
											const idx = list.findIndex((c) => c.id === card.id);
											if (idx < list.length - 1)
												cardConfigStore.moveCard(card.panelId, card.id, idx + 1);
										}}
									>
										<ArrowDown class="h-3.5 w-3.5" />
									</Button>
								{/if}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger asChild>
										{#snippet children({ props })}
											<Button
												{...props}
												variant="ghost"
												size="icon"
												class="ml-1 h-8 w-8 rounded-lg"
											>
												<MoreHorizontal class="h-4 w-4" />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end" class="rounded-xl p-1">
										<DropdownMenu.Item
											onclick={() =>
												cardConfigStore.setCardVisible(card.panelId, card.id, !card.visible)}
											disabled={!card.canHide}
											class="gap-2"
										>
											{#if card.visible}
												<EyeOff class="h-4 w-4" />
												<span>隐藏卡片</span>
											{:else}
												<Eye class="h-4 w-4" />
												<span>显示卡片</span>
											{/if}
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</div>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>

		{#if filteredCards.length === 0}
			<div class="bg-muted/5 flex flex-col items-center justify-center py-20 text-muted-foreground">
				<LayoutGrid class="mb-4 h-12 w-12 opacity-10" />
				<p class="text-sm">未找到匹配的卡片</p>
			</div>
		{/if}
	</div>
</div>

<!-- 拖拽预览 -->
{#if isPointerDragging && dragPreview && draggedCardId}
	{@const card = allCards.find((c) => c.id === draggedCardId)}
	{#if card}
		{@const cardDef = cardRegistry[card.id]}
		<div
			class="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-1/2 scale-105"
			style="left: {dragPreview.x}px; top: {dragPreview.y}px;"
		>
			<div
				class="bg-card/95 border-primary/50 animate-in zoom-in-95 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md"
			>
				<div class="bg-primary/10 text-primary rounded-lg p-1.5">
					{#if cardDef?.icon}
						<svelte:component this={cardDef.icon} class="h-5 w-5" />
					{:else}
						<LayoutGrid class="h-5 w-5" />
					{/if}
				</div>
				<span class="text-sm font-semibold">{card.title}</span>
				<div class="bg-primary ml-2 h-2 w-2 animate-pulse rounded-full"></div>
			</div>
		</div>
	{/if}
{/if}
