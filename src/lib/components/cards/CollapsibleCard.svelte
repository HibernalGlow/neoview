<script lang="ts">
/**
 * CollapsibleCard - 通用可折叠卡片容器
 * 从 cardConfig 读取展开状态，支持拖拽手柄和移动按钮
 */
import { cardConfigStore, type PanelId } from '$lib/stores/cardConfig.svelte';
import { ChevronDown, ChevronRight, ChevronUp, GripVertical, ArrowUp, ArrowDown } from '@lucide/svelte';
import { slide } from 'svelte/transition';

interface Props {
	id: string;
	panelId: PanelId;
	title: string;
	icon?: typeof ChevronDown;
	defaultExpanded?: boolean;
	showDragHandle?: boolean;
	showMoveButtons?: boolean;
	class?: string;
	children?: import('svelte').Snippet;
}

let {
	id,
	panelId,
	title,
	icon: Icon,
	defaultExpanded = true,
	showDragHandle = false,
	showMoveButtons = true,
	class: className = '',
	children
}: Props = $props();

// 从 cardConfig 读取展开状态
const cardConfig = $derived.by(() => {
	const cards = cardConfigStore.getPanelCards(panelId);
	return cards.find(c => c.id === id);
});
const panelCards = $derived(cardConfigStore.getPanelCards(panelId));

// 使用 cardConfig 的 expanded 状态，如果不存在则使用默认值
const isExpanded = $derived(cardConfig?.expanded ?? defaultExpanded);
const cardOrder = $derived(cardConfig?.order ?? 0);
const canMoveUp = $derived(cardOrder > 0);
const canMoveDown = $derived(cardOrder < panelCards.length - 1);

function toggleExpanded() {
	cardConfigStore.setCardExpanded(panelId, id, !isExpanded);
}

function moveUp(e: MouseEvent) {
	e.stopPropagation();
	if (canMoveUp) cardConfigStore.moveCard(panelId, id, cardOrder - 1);
}

function moveDown(e: MouseEvent) {
	e.stopPropagation();
	if (canMoveDown) cardConfigStore.moveCard(panelId, id, cardOrder + 1);
}
</script>

<div class="collapsible-card rounded-lg border bg-muted/10 transition-all hover:border-primary/60 {className}">
	<!-- 标题栏 -->
	<div class="flex items-center justify-between px-3 py-2">
		<button
			type="button"
			class="flex items-center gap-2 text-left"
			onclick={toggleExpanded}
		>
			{#if showDragHandle}
				<GripVertical class="h-4 w-4 cursor-grab text-muted-foreground" />
			{/if}
			
			{#if Icon}
				<Icon class="h-4 w-4" />
			{/if}
			
			<span class="font-semibold text-sm">{title}</span>
		</button>
		
		<div class="flex items-center gap-1 text-[10px]">
			<!-- 展开/收起按钮 -->
			<button
				type="button"
				class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
				onclick={toggleExpanded}
				title={isExpanded ? '收起' : '展开'}
			>
				{#if isExpanded}
					<ChevronUp class="h-3 w-3" />
				{:else}
					<ChevronDown class="h-3 w-3" />
				{/if}
			</button>
			
			{#if showMoveButtons}
				<!-- 上移按钮 -->
				<button
					type="button"
					class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
					onclick={moveUp}
					disabled={!canMoveUp}
					title="上移"
				>
					<ArrowUp class="h-3 w-3" />
				</button>
				<!-- 下移按钮 -->
				<button
					type="button"
					class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
					onclick={moveDown}
					disabled={!canMoveDown}
					title="下移"
				>
					<ArrowDown class="h-3 w-3" />
				</button>
			{/if}
		</div>
	</div>
	
	<!-- 内容区 -->
	{#if isExpanded}
		<div class="px-3 pb-3" transition:slide={{ duration: 200 }}>
			{@render children?.()}
		</div>
	{/if}
</div>
