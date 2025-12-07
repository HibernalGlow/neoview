<script lang="ts">
	/**
	 * PyO3 Upscale Panel - 纯容器版本
	 * 超分面板 - 使用卡片系统渲染
	 */
	import { onMount, createEventDispatcher } from 'svelte';
	import { Sparkles } from '@lucide/svelte';
	import CardRenderer from '$lib/cards/CardRenderer.svelte';
	import { cardConfigStore } from '$lib/stores/cardConfig.svelte';
	import {
		initializeUpscale,
		gatherSettings,
		isPyO3Available
	} from '$lib/stores/upscale/upscalePanelStore.svelte';
	import { toUpscalePanelEventDetail } from './UpscalePanel';

	const dispatch = createEventDispatcher();

	// 获取 upscale 面板的卡片列表
	const panelCards = $derived(cardConfigStore.getPanelCards('upscale'));

	onMount(async () => {
		// 初始化超分功能
		await initializeUpscale();

		// 发送设置更新事件
		const settings = gatherSettings();
		dispatch('upscale-settings-updated', toUpscalePanelEventDetail(settings));
	});
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- 面板头部 -->
	<div class="bg-muted/30 flex items-center gap-2 px-3 py-2">
		<Sparkles class="text-primary h-4 w-4" />
		<h2 class="text-sm font-semibold">超分</h2>
		{#if !isPyO3Available.value}
			<span class="text-destructive ml-auto text-[10px]">不可用</span>
		{/if}
	</div>

	<!-- 卡片容器 -->
	<div class="flex-1 space-y-2 overflow-y-auto p-2">
		{#each panelCards as card (card.id)}
			<CardRenderer cardId={card.id} panelId="upscale" />
		{/each}

		{#if panelCards.length === 0}
			<div class="text-muted-foreground py-8 text-center text-sm">
				<p>没有可显示的卡片</p>
				<p class="mt-1 text-xs">请在设置中配置卡片</p>
			</div>
		{/if}
	</div>
</div>
