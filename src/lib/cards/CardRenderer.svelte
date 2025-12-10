<script lang="ts">
	/**
	 * CardRenderer - 根据卡片 ID 渲染对应组件
	 * 支持懒加载、Context API、类型安全
	 */
	import { setContext } from 'svelte';
	import { cardConfigStore, type PanelId } from '$lib/stores/cardConfig.svelte';
	import { cardRegistry } from './registry';
	import { CollapsibleCard } from '$lib/components/cards';

	// 懒加载组件映射（按需加载，提升首屏性能）
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const lazyComponentMap: Record<string, () => Promise<{ default: any }>> = {
		// Benchmark
		visibility: () => import('./benchmark/VisibilityCard.svelte'),
		latency: () => import('./benchmark/LatencyCard.svelte'),
		renderer: () => import('./benchmark/RendererCard.svelte'),
		files: () => import('./benchmark/FilesCard.svelte'),
		detailed: () => import('./benchmark/DetailedCard.svelte'),
		loadmode: () => import('./benchmark/LoadModeCard.svelte'),
		archives: () => import('./benchmark/ArchivesCard.svelte'),
		realworld: () => import('./benchmark/RealWorldCard.svelte'),
		imageSource: () => import('./benchmark/ImageSourceCard.svelte'),
		protocolTest: () => import('./benchmark/ProtocolTestCard.svelte'),
		results: () => import('./benchmark/ResultsCard.svelte'),
		summary: () => import('./benchmark/SummaryCard.svelte'),
		pipelineLatency: () => import('./benchmark/PipelineLatencyCard.svelte'),
		transcodeBenchmark: () => import('./benchmark/TranscodeBenchmarkCard.svelte'),
		thumbnailLatency: () => import('./benchmark/ThumbnailLatencyCard.svelte'),
		systemMonitor: () => import('./monitor/SystemMonitorCard.svelte'),
		// Info
		bookInfo: () => import('./info/BookInfoCard.svelte'),
		infoOverlay: () => import('./info/InfoOverlayCard.svelte'),
		switchToast: () => import('./info/SwitchToastCard.svelte'),
		imageInfo: () => import('./info/ImageInfoCard.svelte'),
		storage: () => import('./info/StorageCard.svelte'),
		time: () => import('./info/TimeCard.svelte'),
		sidebarControl: () => import('./info/SidebarControlCard.svelte'),
		// Properties
		emmTags: () => import('./properties/EmmTagsCard.svelte'),
		bookSettings: () => import('./properties/BookSettingsCard.svelte'),
		folderRatings: () => import('./properties/FolderRatingsCard.svelte'),
		favoriteTags: () => import('./properties/FavoriteTagsCard.svelte'),
		emmSync: () => import('./properties/EmmSyncCard.svelte'),
		thumbnailMaintenance: () => import('./properties/ThumbnailMaintenanceCard.svelte'),
		emmRawData: () => import('./properties/EmmRawDataCard.svelte'),
		emmConfig: () => import('./properties/EmmConfigCard.svelte'),
		fileListTagDisplay: () => import('./properties/FileListTagDisplayCard.svelte'),
		// Upscale
		upscaleControl: () => import('./upscale/UpscaleControlCard.svelte'),
		upscaleModel: () => import('./upscale/UpscaleModelCard.svelte'),
		upscaleStatus: () => import('./upscale/UpscaleStatusCard.svelte'),
		upscaleCache: () => import('./upscale/UpscaleCacheCard.svelte'),
		upscaleConditions: () => import('./upscale/UpscaleConditionsCard.svelte'),
		progressiveUpscale: () => import('./upscale/ProgressiveUpscaleCard.svelte'),
		// History
		historyList: () => import('./history/HistoryListCard.svelte'),
		// Bookmark
		bookmarkList: () => import('./bookmark/BookmarkListCard.svelte'),
		// PageList
		pageListMain: () => import('./pageList/PageListCard.svelte'),
		// Insights
		dailyTrend: () => import('./insights/DailyTrendCard.svelte'),
		readingStreak: () => import('./insights/ReadingStreakCard.svelte'),
		readingHeatmap: () => import('./insights/ReadingHeatmapCard.svelte'),
		bookmarkOverview: () => import('./insights/BookmarkOverviewCard.svelte'),
		sourceBreakdown: () => import('./insights/SourceBreakdownCard.svelte'),
		emmTagsHot: () => import('./insights/EmmTagsHotCard.svelte'),
		// Folder
		folderMain: () => import('./folder/FolderMainCard.svelte'),
		// AI
		aiTitleTranslation: () => import('./ai/AiTitleTranslationCard.svelte'),
		aiServiceConfig: () => import('./ai/AiServiceConfigCard.svelte'),
		aiTranslationCache: () => import('./ai/AiTranslationCacheCard.svelte'),
		aiTranslationTest: () => import('./ai/AiTranslationTestCard.svelte'),
		voiceControl: () => import('./ai/VoiceControlCard.svelte')
	};

	// 组件缓存（避免重复加载）
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const componentCache = new Map<string, any>();

	// 加载组件
	async function loadComponent(id: string) {
		if (componentCache.has(id)) return componentCache.get(id);
		const loader = lazyComponentMap[id];
		if (!loader) return null;
		try {
			const module = await loader();
			componentCache.set(id, module.default);
			return module.default;
		} catch (err) {
			console.error(`加载卡片组件失败: ${id}`, err);
			return null;
		}
	}

	interface Props {
		cardId: string;
		panelId: PanelId;
	}

	let { cardId, panelId }: Props = $props();

	// 设置 Context（子组件可通过 getContext 获取）
	setContext('cardId', cardId);
	setContext('panelId', panelId);

	// 懒加载组件状态
	let CardComponent = $state<any>(null);
	let isLoading = $state(true);

	// 加载组件
	$effect(() => {
		console.log('[CardRenderer] 加载卡片:', cardId);
		isLoading = true;
		loadComponent(cardId).then((comp) => {
			console.log('[CardRenderer] 卡片加载完成:', cardId, !!comp);
			CardComponent = comp;
			isLoading = false;
		});
	});

	// 从 registry 获取卡片元数据
	const cardDef = $derived(cardRegistry[cardId]);

	// 从 config 获取状态
	const cardConfig = $derived.by(() => {
		const cards = cardConfigStore.getPanelCards(panelId);
		return cards.find((c) => c.id === cardId);
	});

	const isExpanded = $derived(cardConfig?.expanded ?? true);
	const isVisible = $derived(cardConfig?.visible ?? true);
	const cardHeight = $derived(cardConfig?.height);

	// 布局选项（从 registry 读取）
	const isFullHeight = $derived(cardDef?.fullHeight ?? false);
	const hideIcon = $derived(cardDef?.hideIcon ?? false);
	const hideTitle = $derived(cardDef?.hideTitle ?? false);
	const hideHeader = $derived(cardDef?.hideHeader ?? false);
	const compact = $derived(cardDef?.compact ?? false);
	const orientation = $derived(cardDef?.orientation ?? 'vertical');

	function handleHeightChange(newHeight: number | undefined) {
		cardConfigStore.setCardHeight(panelId, cardId, newHeight);
	}
</script>

{#if isVisible}
	<CollapsibleCard
		id={cardId}
		{panelId}
		title={cardDef?.title || cardId}
		icon={cardDef?.icon}
		height={cardHeight}
		onHeightChange={handleHeightChange}
		fullHeight={isFullHeight}
		{hideIcon}
		{hideTitle}
		{hideHeader}
		{compact}
		{orientation}
	>
		{#if isLoading}
			<div class="text-muted-foreground flex items-center justify-center py-4 text-xs">
				加载中...
			</div>
		{:else if CardComponent}
			<CardComponent />
		{:else}
			<div class="text-destructive py-2 text-xs">卡片加载失败: {cardId}</div>
		{/if}
	</CollapsibleCard>
{/if}
