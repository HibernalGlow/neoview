<script lang="ts">
/**
 * CollapsibleCard - 通用可折叠卡片容器
 * 从 cardConfig 读取展开状态，支持拖拽手柄和移动按钮
 * 支持右键菜单在新窗口打开卡片
 * 支持 MagicCard 鼠标跟随光效
 * Requirements: 1.1
 */
import { cardConfigStore, type PanelId } from '$lib/stores/cardConfig.svelte';
import { cardRegistry } from '$lib/cards/registry';
import { ChevronDown, ChevronRight, ChevronUp, ChevronLeft, GripVertical, ArrowUp, ArrowDown, RotateCcw, EyeOff, ExternalLink } from '@lucide/svelte';
import { slide } from 'svelte/transition';
import { openCardInNewWindow } from '$lib/core/windows/cardWindowManager';
import MagicCard from '$lib/components/ui/MagicCard.svelte';

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
	fullHeight?: boolean; // 是否占满剩余高度（用于虚拟列表等）
	// 新增：简化模式选项
	hideIcon?: boolean; // 隐藏图标
	hideTitle?: boolean; // 隐藏标题
	hideHeader?: boolean; // 完全隐藏头部（用于紧凑布局）
	compact?: boolean; // 紧凑模式（更小的 padding）
	orientation?: 'vertical' | 'horizontal'; // 展开方向
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
	fullHeight = false,
	hideIcon = false,
	hideTitle = false,
	hideHeader = false,
	compact = false,
	orientation = 'vertical',
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
const canHide = $derived(cardRegistry[id]?.canHide ?? true);

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

function hideCard(e: MouseEvent) {
	e.stopPropagation();
	if (canHide) cardConfigStore.setCardVisible(panelId, id, false);
}

// 在新窗口打开卡片
async function handleOpenInNewWindow(e: MouseEvent) {
	e.stopPropagation();
	await openCardInNewWindow(id);
}
</script>

<MagicCard 
	class="collapsible-card {hideHeader ? '' : 'rounded-lg border bg-muted/10 hover:border-primary/60'} transition-all {fullHeight ? 'flex flex-col flex-1 min-h-0' : ''} {orientation === 'horizontal' ? 'flex flex-row' : ''} {className}"
	gradientSize={250}
	gradientColor="rgba(120, 119, 198, 0.8)"
	gradientOpacity={0.6}
>
	<!-- 标题栏（可隐藏） -->
	{#if !hideHeader}
		<div 
			class="flex items-center justify-between {compact ? 'px-2 py-1' : 'px-3 py-2'} {orientation === 'horizontal' ? 'flex-col border-r py-2 px-1' : ''}"
		>
			<button
				type="button"
				class="flex items-center gap-1.5 text-left {orientation === 'horizontal' ? 'flex-col' : ''}"
				onclick={toggleExpanded}
			>
				{#if showDragHandle}
					<GripVertical class="h-3.5 w-3.5 cursor-grab text-muted-foreground" />
				{/if}
				
				{#if Icon && !hideIcon}
					<Icon class="h-3.5 w-3.5" />
				{/if}
				
				{#if !hideTitle}
					<span class="font-medium text-xs {orientation === 'horizontal' ? 'writing-mode-vertical' : ''}">{title}</span>
				{/if}
			</button>
			
			<div class="group/buttons flex items-center gap-0.5 {orientation === 'horizontal' ? 'flex-col mt-1' : ''}">
				<!-- 在新窗口打开按钮（悬停按钮区域显示） -->
				<button
					type="button"
					class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/buttons:opacity-100 hover:bg-primary/20 hover:text-primary transition-opacity"
					onclick={handleOpenInNewWindow}
					title="在新窗口打开"
				>
					<ExternalLink class="h-3 w-3" />
				</button>
				<!-- 隐藏卡片按钮（悬停按钮区域显示） -->
				{#if canHide}
					<button
						type="button"
						class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/buttons:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-opacity"
						onclick={hideCard}
						title="隐藏卡片"
					>
						<EyeOff class="h-3 w-3" />
					</button>
				{/if}
				<!-- 恢复默认高度按钮 -->
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
					{#if orientation === 'horizontal'}
						{#if isExpanded}
							<ChevronLeft class="h-3 w-3" />
						{:else}
							<ChevronRight class="h-3 w-3" />
						{/if}
					{:else}
						{#if isExpanded}
							<ChevronUp class="h-3 w-3" />
						{:else}
							<ChevronDown class="h-3 w-3" />
						{/if}
					{/if}
				</button>
				
				{#if showMoveButtons}
					<button
						type="button"
						class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
						onclick={moveUp}
						disabled={!canMoveUp}
						title="上移"
					>
						<ArrowUp class="h-3 w-3" />
					</button>
					<button
						type="button"
						class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
						onclick={moveDown}
						disabled={!canMoveDown}
						title="下移"
					>
						<ArrowDown class="h-3 w-3" />
					</button>
				{/if}
			</div>
		</div>
	{/if}
	
	<!-- 内容区 -->
	{#if isExpanded || hideHeader}
		<div 
			bind:this={contentRef}
			class="{hideHeader ? '' : (compact ? 'px-2 pb-2' : 'px-3 pb-3')} overflow-auto {fullHeight ? 'flex-1 min-h-0 flex flex-col' : ''} {orientation === 'horizontal' ? 'flex-1' : ''}" 
			style={height ? `height: ${height}px` : (fullHeight ? '' : '')}
			transition:slide={{ duration: 200, axis: orientation === 'horizontal' ? 'x' : 'y' }}
		>
			{@render children?.()}
		</div>
		
		<!-- 拖拽调整高度/宽度手柄 -->
		{#if onHeightChange && !hideHeader}
			<div 
				class="{orientation === 'horizontal' ? 'w-2 cursor-ew-resize' : 'h-2 cursor-ns-resize'} hover:bg-primary/20 flex items-center justify-center group"
				onmousedown={startResize}
				ondblclick={resetHeight}
				role="separator"
				aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
				title="拖拽调整大小，双击重置"
			>
				<div class="{orientation === 'horizontal' ? 'h-8 w-0.5' : 'w-8 h-0.5'} rounded-full bg-muted-foreground/30 group-hover:bg-primary/50"></div>
			</div>
		{/if}
	{/if}

</MagicCard>
