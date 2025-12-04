<script lang="ts">
/**
 * 通用面板容器
 * 根据 cardConfig 动态渲染卡片，面板只需传入 panelId
 */
import { cardConfigStore, type PanelId } from '$lib/stores/cardConfig.svelte';
import CardRenderer from './CardRenderer.svelte';

interface Props {
	panelId: PanelId;
	title: string;
	subtitle?: string;
	headerIcon?: any;
	children?: import('svelte').Snippet;
}

let { panelId, title, subtitle, headerIcon: HeaderIcon, children }: Props = $props();

// 获取当前面板的可见卡片，按顺序排列
const visibleCards = $derived(
	cardConfigStore.getPanelCards(panelId).filter(c => c.visible)
);
</script>

<div class="flex h-full flex-col">
	<!-- 面板头部 -->
	<header class="flex items-center justify-between px-4 py-3">
		<div class="flex items-center gap-2">
			{#if HeaderIcon}
				<HeaderIcon class="h-5 w-5" />
			{/if}
			<div>
				<p class="text-sm font-semibold">{title}</p>
				{#if subtitle}
					<p class="text-xs text-muted-foreground">{subtitle}</p>
				{/if}
			</div>
		</div>
		{#if children}
			{@render children()}
		{/if}
	</header>

	<!-- 渐变过渡 -->
	<div class="h-4 bg-linear-to-b from-transparent to-background"></div>

	<!-- 可滚动内容区 -->
	<div class="flex-1 overflow-y-auto px-3 py-2 bg-background">
		<div class="flex flex-col gap-3">
			{#each visibleCards as card (card.id)}
				<CardRenderer cardId={card.id} {panelId} />
			{/each}
		</div>
	</div>
</div>
