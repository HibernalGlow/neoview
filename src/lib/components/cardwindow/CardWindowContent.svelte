<script lang="ts">
	/**
	 * CardWindowContent - 卡片窗口内容渲染器
	 * 直接渲染卡片组件，不使用 CollapsibleCard 包装
	 * 用于独立卡片窗口中的标签页内容
	 */
	import { setContext } from 'svelte';
	import { cardRegistry } from '$lib/cards/registry';

	// 懒加载组件映射
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const lazyComponentMap: Record<string, () => Promise<{ default: any }>> = {
		// Benchmark
		visibility: () => import('$lib/cards/benchmark/VisibilityCard.svelte'),
		latency: () => import('$lib/cards/benchmark/LatencyCard.svelte'),
		renderer: () => import('$lib/cards/benchmark/RendererCard.svelte'),
		files: () => import('$lib/cards/benchmark/FilesCard.svelte'),
		detailed: () => import('$lib/cards/benchmark/DetailedCard.svelte'),
		loadmode: () => import('$lib/cards/benchmark/LoadModeCard.svelte'),
		archives: () => import('$lib/cards/benchmark/ArchivesCard.svelte'),
		realworld: () => import('$lib/cards/benchmark/RealWorldCard.svelte'),
		imageSource: () => import('$lib/cards/benchmark/ImageSourceCard.svelte'),
		results: () => import('$lib/cards/benchmark/ResultsCard.svelte'),
		summary: () => import('$lib/cards/benchmark/SummaryCard.svelte'),
		pipelineLatency: () => import('$lib/cards/benchmark/PipelineLatencyCard.svelte'),
		transcodeBenchmark: () => import('$lib/cards/benchmark/TranscodeBenchmarkCard.svelte'),
		thumbnailLatency: () => import('$lib/cards/benchmark/ThumbnailLatencyCard.svelte'),
		systemMonitor: () => import('$lib/cards/monitor/SystemMonitorCard.svelte'),
		// Info
		bookInfo: () => import('$lib/cards/info/BookInfoCard.svelte'),
		infoOverlay: () => import('$lib/cards/info/InfoOverlayCard.svelte'),
		switchToast: () => import('$lib/cards/info/SwitchToastCard.svelte'),
		imageInfo: () => import('$lib/cards/info/ImageInfoCard.svelte'),
		storage: () => import('$lib/cards/info/StorageCard.svelte'),
		time: () => import('$lib/cards/info/TimeCard.svelte'),
		sidebarControl: () => import('$lib/cards/info/SidebarControlCard.svelte'),
		// Properties
		emmTags: () => import('$lib/cards/properties/EmmTagsCard.svelte'),
		aiTags: () => import('$lib/cards/properties/AiTagsCard.svelte'),
		aiApiConfig: () => import('$lib/cards/properties/AiApiConfigCard.svelte'),
		bookSettings: () => import('$lib/cards/properties/BookSettingsCard.svelte'),
		folderRatings: () => import('$lib/cards/properties/FolderRatingsCard.svelte'),
		favoriteTags: () => import('$lib/cards/properties/FavoriteTagsCard.svelte'),
		emmSync: () => import('$lib/cards/properties/EmmSyncCard.svelte'),
		thumbnailMaintenance: () => import('$lib/cards/properties/ThumbnailMaintenanceCard.svelte'),
		emmRawData: () => import('$lib/cards/properties/EmmRawDataCard.svelte'),
		emmConfig: () => import('$lib/cards/properties/EmmConfigCard.svelte'),
		fileListTagDisplay: () => import('$lib/cards/properties/FileListTagDisplayCard.svelte'),
		// Upscale
		upscaleControl: () => import('$lib/cards/upscale/UpscaleControlCard.svelte'),
		upscaleModel: () => import('$lib/cards/upscale/UpscaleModelCard.svelte'),
		upscaleStatus: () => import('$lib/cards/upscale/UpscaleStatusCard.svelte'),
		upscaleCache: () => import('$lib/cards/upscale/UpscaleCacheCard.svelte'),
		upscaleConditions: () => import('$lib/cards/upscale/UpscaleConditionsCard.svelte'),
		progressiveUpscale: () => import('$lib/cards/upscale/ProgressiveUpscaleCard.svelte'),
		// History
		historyList: () => import('$lib/cards/history/HistoryListCard.svelte'),
		// Bookmark
		bookmarkList: () => import('$lib/cards/bookmark/BookmarkListCard.svelte'),
		// PageList
		pageListMain: () => import('$lib/cards/pageList/PageListCard.svelte'),
		// Insights
		dailyTrend: () => import('$lib/cards/insights/DailyTrendCard.svelte'),
		readingStreak: () => import('$lib/cards/insights/ReadingStreakCard.svelte'),
		readingHeatmap: () => import('$lib/cards/insights/ReadingHeatmapCard.svelte'),
		bookmarkOverview: () => import('$lib/cards/insights/BookmarkOverviewCard.svelte'),
		sourceBreakdown: () => import('$lib/cards/insights/SourceBreakdownCard.svelte'),
		emmTagsHot: () => import('$lib/cards/insights/EmmTagsHotCard.svelte'),
		// Folder
		folderMain: () => import('$lib/cards/folder/FolderMainCard.svelte'),
		// AI
		aiTitleTranslation: () => import('$lib/cards/ai/AiTitleTranslationCard.svelte'),
		aiServiceConfig: () => import('$lib/cards/ai/AiServiceConfigCard.svelte'),
		aiTranslationCache: () => import('$lib/cards/ai/AiTranslationCacheCard.svelte'),
		aiTranslationTest: () => import('$lib/cards/ai/AiTranslationTestCard.svelte'),
		voiceControl: () => import('$lib/cards/ai/VoiceControlCard.svelte')
	};

	// 组件缓存
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
			console.error(`[CardWindowContent] 加载卡片组件失败: ${id}`, err);
			return null;
		}
	}

	interface Props {
		cardId: string;
	}

	let { cardId }: Props = $props();

	// 设置 Context
	setContext('cardId', cardId);
	setContext('panelId', 'cardwindow');

	// 懒加载组件状态
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let CardComponent = $state<any>(null);
	let isLoading = $state(true);

	// 从 registry 获取卡片元数据
	const cardDef = $derived(cardRegistry[cardId]);

	// 加载组件
	$effect(() => {
		console.log('[CardWindowContent] 加载卡片:', cardId);
		isLoading = true;
		loadComponent(cardId).then((comp) => {
			console.log('[CardWindowContent] 卡片加载完成:', cardId, !!comp);
			CardComponent = comp;
			isLoading = false;
		});
	});
</script>

<div class="h-full w-full">
	{#if isLoading}
		<div class="text-muted-foreground flex items-center justify-center py-8 text-sm">
			加载中...
		</div>
	{:else if CardComponent}
		<CardComponent />
	{:else}
		<div class="text-destructive py-4 text-sm text-center">
			卡片加载失败: {cardId}
			{#if cardDef}
				<br />
				<span class="text-muted-foreground text-xs">({cardDef.title})</span>
			{/if}
		</div>
	{/if}
</div>
