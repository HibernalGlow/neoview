<script lang="ts">
/**
 * CollapsibleCard - 通用可折叠卡片容器
 * 从 cardConfig 读取展开状态，支持拖拽手柄
 */
import { cardConfigStore, type PanelId } from '$lib/stores/cardConfig.svelte';
import { ChevronDown, ChevronRight, GripVertical } from '@lucide/svelte';
import { slide } from 'svelte/transition';

interface Props {
	id: string;
	panelId: PanelId;
	title: string;
	icon?: typeof ChevronDown;
	defaultExpanded?: boolean;
	showDragHandle?: boolean;
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
	class: className = '',
	children
}: Props = $props();

// 从 cardConfig 读取展开状态
const cardConfig = $derived.by(() => {
	const cards = cardConfigStore.getPanelCards(panelId);
	return cards.find(c => c.id === id);
});

// 使用 cardConfig 的 expanded 状态，如果不存在则使用默认值
const isExpanded = $derived(cardConfig?.expanded ?? defaultExpanded);

function toggleExpanded() {
	cardConfigStore.setCardExpanded(panelId, id, !isExpanded);
}
</script>

<div class="collapsible-card rounded-lg border bg-card {className}">
	<!-- 标题栏 -->
	<button
		type="button"
		class="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
		onclick={toggleExpanded}
	>
		{#if showDragHandle}
			<GripVertical class="h-4 w-4 cursor-grab text-muted-foreground" />
		{/if}
		
		{#if Icon}
			<Icon class="h-4 w-4 text-muted-foreground" />
		{/if}
		
		<span class="flex-1 font-medium text-sm">{title}</span>
		
		<!-- 展开/收起指示器 -->
		{#if isExpanded}
			<ChevronDown class="h-4 w-4 text-muted-foreground" />
		{:else}
			<ChevronRight class="h-4 w-4 text-muted-foreground" />
		{/if}
	</button>
	
	<!-- 内容区 -->
	{#if isExpanded}
		<div class="px-4 pb-4" transition:slide={{ duration: 200 }}>
			{@render children?.()}
		</div>
	{/if}
</div>
