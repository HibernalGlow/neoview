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
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { cn } from '$lib/utils';

	// 获取所有支持卡片的面板 ID
	const allPanelIds = getCardSupportingPanels();

	let searchQuery = $state('');
	// 默认按面板过滤，初始化为首个面板
	let panelFilter = $state<string>(allPanelIds[0] || 'all');

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

	// 搜索过滤后的卡片
	const groupedCards = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		
		const groups = allPanelIds.map(panelId => {
			const cards = allCards.filter(c => c.panelId === panelId);
			const filtered = !query 
				? cards 
				: cards.filter(c => 
					c.title.toLowerCase().includes(query) || 
					c.id.toLowerCase().includes(query)
				);
			
			return {
				id: panelId,
				title: getPanelTitle(panelId),
				items: filtered
			};
		});

		return groups.filter(g => g.items.length > 0);
	});

	// 拖拽状态
	let draggedCardId = $state<string | null>(null);
	let isPointerDragging = $state(false);
	let dragPreview = $state<{ x: number; y: number } | null>(null);

	// 拖拽处理函数
	function handlePointerDown(event: PointerEvent, card: CardConfig) {
		if (!(event.target as HTMLElement).closest('.drag-handle')) return;
		event.preventDefault();
		draggedCardId = card.id;
		isPointerDragging = true;
		dragPreview = { x: event.clientX + 12, y: event.clientY + 12 };
	}

	$effect(() => {
		function handleWindowPointerUp() {
			if (!isPointerDragging) return;
			isPointerDragging = false;
			draggedCardId = null;
			dragPreview = null;
		}
		window.addEventListener('pointerup', handleWindowPointerUp);
		return () => {
			window.removeEventListener('pointerup', handleWindowPointerUp);
		};
	});

	$effect(() => {
		if (!isPointerDragging) return;
		function handleWindowPointerMove(e: PointerEvent) {
			dragPreview = { x: e.clientX + 12, y: e.clientY + 12 };
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
				{#each groupedCards as group}
					<Table.Row class="bg-muted/20 hover:bg-muted/20">
						<Table.Cell colspan={5} class="py-2.5 px-4">
							<div class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
								<MapPin class="h-3.5 w-3.5" />
								{group.title}
								<span class="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
									{group.items.length}
								</span>
							</div>
						</Table.Cell>
					</Table.Row>
					{#each group.items as card, index (card.id + card.panelId)}
						{@const cardDef = cardRegistry[card.id]}
						<Table.Row
							class={cn(
								'group transition-colors',
								isPointerDragging && draggedCardId === card.id && 'bg-muted/30 opacity-50 grayscale'
							)}
						>
							<Table.Cell class="px-2">
								<div
									class="drag-handle text-muted-foreground/20 group-hover:text-muted-foreground/60 cursor-grab p-1 transition-colors flex items-center justify-center"
									onpointerdown={(e) => handlePointerDown(e, card)}
								>
									<GripVertical class="h-4 w-4" />
								</div>
							</Table.Cell>
							<Table.Cell class="px-0">
								<div class="flex items-center justify-center">
									<div
										class="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 shadow-sm"
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
									<span class="truncate font-medium block" title={card.title}>{card.title}</span>
									<span class="text-muted-foreground font-mono text-[10px] uppercase opacity-50 truncate block"
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
													variant="outline"
													class="pointer-events-none h-4 px-1 text-[9px] font-bold tracking-tighter uppercase truncate max-w-[80px] block text-center"
												>
													{group.title}
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
											disabled={index === group.items.length - 1}
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
				{/each}
			</Table.Body>
		</Table.Root>

		{#if groupedCards.length === 0}
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
			class="pointer-events-none fixed z-[100] scale-105"
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
