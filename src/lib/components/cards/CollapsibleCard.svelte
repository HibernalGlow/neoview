<script lang="ts">
/**
 * CollapsibleCard - 通用可折叠卡片容器
 * 从 cardConfig 读取展开状态，支持拖拽手柄和移动按钮
 */
import { cardConfigStore, type PanelId } from '$lib/stores/cardConfig.svelte';
import { ChevronDown, ChevronRight, ChevronUp, GripVertical, ArrowUp, ArrowDown, RotateCcw } from '@lucide/svelte';
import { slide } from 'svelte/transition';

interface Props {
	id: string;
	panelId: PanelId;
	title: string;
	icon?: typeof ChevronDown;
	defaultExpanded?: boolean;
	showDragHandle?: boolean;
	showMoveButtons?: boolean;
	height?: number; // 自定义高度
	onHeightChange?: (height: number | undefined) => void;
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
	height,
	onHeightChange,
	class: className = '',
	children
}: Props = $props();

// 拖拽调整高度相关
let isResizing = $state(false);
let startY = $state(0);
let startHeight = $state(0);
let contentRef = $state<HTMLDivElement | null>(null);

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

// 拖拽调整高度
function startResize(e: MouseEvent) {
	if (!contentRef) return;
	e.preventDefault();
	isResizing = true;
	startY = e.clientY;
	startHeight = height ?? contentRef.offsetHeight;
	
	document.addEventListener('mousemove', onResize);
	document.addEventListener('mouseup', stopResize);
}

function onResize(e: MouseEvent) {
	if (!isResizing) return;
	const deltaY = e.clientY - startY;
	const newHeight = Math.max(50, startHeight + deltaY); // 最小 50px
	onHeightChange?.(newHeight);
}

function stopResize() {
	isResizing = false;
	document.removeEventListener('mousemove', onResize);
	document.removeEventListener('mouseup', stopResize);
}

function resetHeight(e: MouseEvent) {
	e.stopPropagation();
	onHeightChange?.(undefined);
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
			<!-- 恢复默认高度按钮（仅在有自定义高度时显示） -->
			{#if height && onHeightChange}
				<button
					type="button"
					class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-primary"
					onclick={resetHeight}
					title="恢复默认高度"
				>
					<RotateCcw class="h-3 w-3" />
				</button>
			{/if}
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
		<div 
			bind:this={contentRef}
			class="px-3 pb-3 overflow-auto" 
			style={height ? `height: ${height}px` : ''}
			transition:slide={{ duration: 200 }}
		>
			{@render children?.()}
		</div>
		
		<!-- 拖拽调整高度手柄 -->
		{#if onHeightChange}
			<div 
				class="h-2 cursor-ns-resize hover:bg-primary/20 flex items-center justify-center group"
				onmousedown={startResize}
				ondblclick={resetHeight}
				role="separator"
				aria-orientation="horizontal"
				title="拖拽调整高度，双击重置"
			>
				<div class="w-8 h-0.5 rounded-full bg-muted-foreground/30 group-hover:bg-primary/50"></div>
			</div>
		{/if}
	{/if}
</div>
