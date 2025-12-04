<script lang="ts">
/**
 * CardRenderer - 根据卡片 ID 渲染对应组件
 * 使用静态导入 + 组件映射，避免动态 import 的性能开销
 */
import { cardConfigStore, type PanelId } from '$lib/stores/cardConfig.svelte';
import { cardRegistry } from './registry';
import { CollapsibleCard } from '$lib/components/cards';

// 静态导入所有卡片组件（打包时 tree-shaking 会优化）
import VisibilityCard from './benchmark/VisibilityCard.svelte';
import LatencyCard from './benchmark/LatencyCard.svelte';
import RendererCard from './benchmark/RendererCard.svelte';
import FilesCard from './benchmark/FilesCard.svelte';
import DetailedCard from './benchmark/DetailedCard.svelte';
import LoadModeCard from './benchmark/LoadModeCard.svelte';
import ArchivesCard from './benchmark/ArchivesCard.svelte';
import RealWorldCard from './benchmark/RealWorldCard.svelte';
import ResultsCard from './benchmark/ResultsCard.svelte';
import SummaryCard from './benchmark/SummaryCard.svelte';

import BookInfoCard from './info/BookInfoCard.svelte';
import InfoOverlayCard from './info/InfoOverlayCard.svelte';
import SwitchToastCard from './info/SwitchToastCard.svelte';
import ImageInfoCard from './info/ImageInfoCard.svelte';
import StorageCard from './info/StorageCard.svelte';
import TimeCard from './info/TimeCard.svelte';

import EmmTagsCard from './properties/EmmTagsCard.svelte';
import BookSettingsCard from './properties/BookSettingsCard.svelte';
import FolderRatingsCard from './properties/FolderRatingsCard.svelte';
import FavoriteTagsCard from './properties/FavoriteTagsCard.svelte';
import EmmSyncCard from './properties/EmmSyncCard.svelte';
import ThumbnailMaintenanceCard from './properties/ThumbnailMaintenanceCard.svelte';
import EmmRawDataCard from './properties/EmmRawDataCard.svelte';

import UpscaleControlCard from './upscale/UpscaleControlCard.svelte';
import UpscaleModelCard from './upscale/UpscaleModelCard.svelte';
import UpscaleStatusCard from './upscale/UpscaleStatusCard.svelte';
import UpscaleCacheCard from './upscale/UpscaleCacheCard.svelte';
import UpscaleConditionsCard from './upscale/UpscaleConditionsCard.svelte';

import PageListCard from './pageList/PageListCard.svelte';
import DailyTrendCard from './insights/DailyTrendCard.svelte';
import ReadingStreakCard from './insights/ReadingStreakCard.svelte';
import ReadingHeatmapCard from './insights/ReadingHeatmapCard.svelte';
import BookmarkOverviewCard from './insights/BookmarkOverviewCard.svelte';
import SourceBreakdownCard from './insights/SourceBreakdownCard.svelte';
import EmmTagsHotCard from './insights/EmmTagsHotCard.svelte';

// 组件映射表（O(1) 查找，使用 any 避免 Svelte 5 类型问题）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const componentMap: Record<string, any> = {
	// Benchmark
	visibility: VisibilityCard,
	latency: LatencyCard,
	renderer: RendererCard,
	files: FilesCard,
	detailed: DetailedCard,
	loadmode: LoadModeCard,
	archives: ArchivesCard,
	realworld: RealWorldCard,
	results: ResultsCard,
	summary: SummaryCard,
	// Info
	bookInfo: BookInfoCard,
	infoOverlay: InfoOverlayCard,
	switchToast: SwitchToastCard,
	imageInfo: ImageInfoCard,
	storage: StorageCard,
	time: TimeCard,
	// Properties
	emmTags: EmmTagsCard,
	bookSettings: BookSettingsCard,
	folderRatings: FolderRatingsCard,
	favoriteTags: FavoriteTagsCard,
	emmSync: EmmSyncCard,
	thumbnailMaintenance: ThumbnailMaintenanceCard,
	emmRawData: EmmRawDataCard,
	// Upscale
	upscaleControl: UpscaleControlCard,
	upscaleModel: UpscaleModelCard,
	upscaleStatus: UpscaleStatusCard,
	upscaleCache: UpscaleCacheCard,
	upscaleConditions: UpscaleConditionsCard,
	// PageList
	pageListMain: PageListCard,
	// Insights
	dailyTrend: DailyTrendCard,
	readingStreak: ReadingStreakCard,
	readingHeatmap: ReadingHeatmapCard,
	bookmarkOverview: BookmarkOverviewCard,
	sourceBreakdown: SourceBreakdownCard,
	emmTagsHot: EmmTagsHotCard
};

interface Props {
	cardId: string;
	panelId: PanelId;
}

let { cardId, panelId }: Props = $props();

// 从 registry 获取卡片元数据
const cardDef = $derived(cardRegistry[cardId]);
const CardComponent = $derived(componentMap[cardId]);

// 从 config 获取展开状态
const cardConfig = $derived.by(() => {
	const cards = cardConfigStore.getPanelCards(panelId);
	return cards.find(c => c.id === cardId);
});

const isExpanded = $derived(cardConfig?.expanded ?? true);
const isVisible = $derived(cardConfig?.visible ?? true);
const cardHeight = $derived(cardConfig?.height);

function toggleExpanded() {
	cardConfigStore.setCardExpanded(panelId, cardId, !isExpanded);
}

function handleHeightChange(newHeight: number | undefined) {
	cardConfigStore.setCardHeight(panelId, cardId, newHeight);
}
</script>

{#if isVisible && CardComponent}
	<CollapsibleCard
		id={cardId}
		{panelId}
		title={cardDef?.title || cardId}
		icon={cardDef?.icon}
		height={cardHeight}
		onHeightChange={handleHeightChange}
	>
		<CardComponent />
	</CollapsibleCard>
{/if}
