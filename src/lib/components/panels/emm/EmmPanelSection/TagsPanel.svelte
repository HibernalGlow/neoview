<script lang="ts">
/**
 * 标签管理面板
 * 从 EmmPanelSection 提取的子组件
 * 负责显示和管理书籍的 EMM 标签
 */
import { Tag, ChevronUp, ChevronDown, ArrowUp, ArrowDown } from '@lucide/svelte';
import * as Button from '$lib/components/ui/button';
import { emmMetadataStore, collectTagMap, emmTranslationStore } from '$lib/stores/emmMetadata.svelte';
import type { EMMCollectTag } from '$lib/api/emm';
import type { ViewerBookInfo } from '$lib/stores/infoPanel.svelte';

// Props 定义
interface Props {
	bookInfo: ViewerBookInfo | null;
	collectTags: EMMCollectTag[];
	order: number;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onRefreshCollectTags: () => void;
}

let {
	bookInfo,
	collectTags,
	order,
	canMoveUp,
	canMoveDown,
	onMoveUp,
	onMoveDown,
	onRefreshCollectTags
}: Props = $props();

// 本地存储键
const TAG_VIEW_MODE_STORAGE_KEY = 'neoview-emm-panel-tag-view-mode';
const TAG_FILTER_MODE_STORAGE_KEY = 'neoview-emm-panel-tag-filter-mode';

// 标签视图状态
let tagViewMode = $state<'flat' | 'grouped'>('grouped');
let tagFilterMode = $state<'all' | 'collect'>('all');
let showTagsCard = $state(true);

// 翻译字典
const translationDict = $derived.by(() => {
	return emmMetadataStore.getTranslationDict();
});

// 所有标签（带收藏状态）
const allTags = $derived(() => {
	if (!bookInfo?.emmMetadata?.tags) {
		return [];
	}

	const tags: Array<{
		category: string;
		tag: string;
		isCollect: boolean;
		color?: string;
		display?: string;
	}> = [];
	const map = $collectTagMap;
	const normalize = (s: string) => s.trim().toLowerCase();

	for (const [category, tagList] of Object.entries(bookInfo.emmMetadata.tags)) {
		for (const tag of tagList) {
			const fullTagKey = normalize(`${category}:${tag}`);
			let collectTag = map.get(fullTagKey);

			if (!collectTag) {
				collectTag = map.get(normalize(tag));
			}

			const isCollect = !!collectTag;
			const translatedTag = emmTranslationStore.translateTag(tag, category, translationDict);
			const shortCategory = emmTranslationStore.getShortNamespace(category);
			const displayStr = `${shortCategory}:${translatedTag}`;

			tags.push({
				category,
				tag,
				isCollect,
				color: collectTag?.color,
				display: displayStr
			});
		}
	}

	// 收藏标签排在前面
	return tags.sort((a, b) => {
		if (a.isCollect && !b.isCollect) return -1;
		if (!a.isCollect && b.isCollect) return 1;
		return 0;
	});
});

// 根据过滤模式显示的标签
const displayTags = $derived(() => {
	const tags = allTags();
	if (tagFilterMode === 'collect') {
		return tags.filter((t) => t.isCollect);
	}
	return tags;
});

// 分组后的标签
const groupedTags = $derived(() => {
	const tags = displayTags();
	const groups: Array<{
		category: string;
		shortCategory: string;
		items: typeof tags;
	}> = [];

	const groupMap = new Map<string, { category: string; shortCategory: string; items: typeof tags }>();

	for (const tag of tags) {
		const key = tag.category;
		let group = groupMap.get(key);
		if (!group) {
			group = {
				category: key,
				shortCategory: emmTranslationStore.getShortNamespace(key),
				items: []
			};
			groupMap.set(key, group);
			groups.push(group);
		}
		group.items.push(tag);
	}

	return groups;
});

// 获取标签的 tooltip 内容
function getTagTitle(tagInfo: { category: string; tag: string; display?: string; isCollect: boolean }) {
	const raw = `${tagInfo.category}:${tagInfo.tag}`;
	const lines: string[] = [`原始: ${raw}`];
	if (tagInfo.display && tagInfo.display !== raw) {
		lines.push(`显示: ${tagInfo.display}`);
	}
	if (tagInfo.isCollect) {
		lines.push('状态: 收藏标签');
	}
	return lines.join('\n');
}

// 从本地存储加载视图偏好
$effect(() => {
	if (typeof localStorage === 'undefined') return;
	try {
		const storedView = localStorage.getItem(TAG_VIEW_MODE_STORAGE_KEY) as 'flat' | 'grouped' | null;
		if (storedView === 'flat' || storedView === 'grouped') {
			tagViewMode = storedView;
		}
		const storedFilter = localStorage.getItem(TAG_FILTER_MODE_STORAGE_KEY) as 'all' | 'collect' | null;
		if (storedFilter === 'all' || storedFilter === 'collect') {
			tagFilterMode = storedFilter;
		}
	} catch (err) {
		console.error('[TagsPanel] 读取标签视图偏好失败:', err);
	}
});

// 保存视图模式到本地存储
$effect(() => {
	const mode = tagViewMode;
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(TAG_VIEW_MODE_STORAGE_KEY, mode);
	} catch (err) {
		console.error('[TagsPanel] 保存标签视图模式失败:', err);
	}
});

// 保存过滤模式到本地存储
$effect(() => {
	const filter = tagFilterMode;
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(TAG_FILTER_MODE_STORAGE_KEY, filter);
	} catch (err) {
		console.error('[TagsPanel] 保存标签过滤模式失败:', err);
	}
});
</script>

{#if allTags().length > 0}
	<div 
		class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60" 
		style={`order: ${order}`}
	>
		<!-- 标题栏 -->
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2 font-semibold text-sm">
				<Tag class="h-4 w-4" />
				<span>标签</span>
				<span class="text-[10px] text-muted-foreground font-normal ml-2 opacity-50">
					(已加载收藏: {collectTags.length})
				</span>
				
				<!-- 视图切换按钮 -->
				<div class="flex items-center gap-1 ml-auto text-[10px] font-normal">
					<span class="text-muted-foreground">视图</span>
					<Button.Root
						variant={tagViewMode === 'flat' ? 'default' : 'outline'}
						size="sm"
						class="h-6 px-2 text-[10px]"
						onclick={() => (tagViewMode = 'flat')}
					>
						扁平
					</Button.Root>
					<Button.Root
						variant={tagViewMode === 'grouped' ? 'default' : 'outline'}
						size="sm"
						class="h-6 px-2 text-[10px]"
						onclick={() => (tagViewMode = 'grouped')}
					>
						分组
					</Button.Root>
					<span class="mx-1 text-border">|</span>
					<Button.Root
						variant={tagFilterMode === 'all' ? 'default' : 'outline'}
						size="sm"
						class="h-6 px-2 text-[10px]"
						onclick={() => (tagFilterMode = 'all')}
					>
						全部
					</Button.Root>
					<Button.Root
						variant={tagFilterMode === 'collect' ? 'default' : 'outline'}
						size="sm"
						class="h-6 px-2 text-[10px]"
						onclick={() => (tagFilterMode = 'collect')}
					>
						收藏
					</Button.Root>
				</div>
				
				<!-- 刷新按钮 -->
				<Button.Root
					variant="ghost"
					size="icon"
					class="h-5 w-5 ml-1"
					title="重新加载收藏标签"
					onclick={onRefreshCollectTags}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
						<path d="M3 3v5h5" />
					</svg>
				</Button.Root>
			</div>
			
			<!-- 控制按钮 -->
			<div class="flex items-center gap-1 text-[10px]">
				<Button.Root
					variant="ghost"
					size="icon"
					class="h-5 w-5"
					onclick={() => (showTagsCard = !showTagsCard)}
					title={showTagsCard ? '收起' : '展开'}
				>
					{#if showTagsCard}
						<ChevronUp class="h-3 w-3" />
					{:else}
						<ChevronDown class="h-3 w-3" />
					{/if}
				</Button.Root>
				<Button.Root
					variant="ghost"
					size="icon"
					class="h-5 w-5"
					onclick={onMoveUp}
					disabled={!canMoveUp}
					title="上移"
				>
					<ArrowUp class="h-3 w-3" />
				</Button.Root>
				<Button.Root
					variant="ghost"
					size="icon"
					class="h-5 w-5"
					onclick={onMoveDown}
					disabled={!canMoveDown}
					title="下移"
				>
					<ArrowDown class="h-3 w-3" />
				</Button.Root>
			</div>
		</div>

		<!-- 标签内容 -->
		{#if showTagsCard}
			{#if tagViewMode === 'flat'}
				<!-- 扁平视图 -->
				<div class="flex flex-wrap gap-1.5">
					{#each displayTags() as tagInfo}
						<span
							class="inline-flex items-center rounded px-2 py-1 text-xs border {tagInfo.isCollect
								? 'font-semibold'
								: 'bg-muted border-border/60 text-muted-foreground'}"
							style={tagInfo.isCollect
								? `background-color: ${(tagInfo.color || '#409EFF')}20; border-color: ${(tagInfo.color || '#409EFF')}40; color: ${tagInfo.color || '#409EFF'};`
								: ''}
							title={getTagTitle(tagInfo)}
						>
							{tagInfo.display}
						</span>
					{/each}
				</div>
			{:else}
				<!-- 分组视图 -->
				<div class="space-y-2">
					{#each groupedTags() as group}
						<div class="space-y-1">
							<div class="text-[10px] text-muted-foreground">
								{group.shortCategory}:{group.category} ({group.items.length})
							</div>
							<div class="flex flex-wrap gap-1.5">
								{#each group.items as tagInfo}
									<span
										class="inline-flex items-center rounded px-2 py-1 text-xs border {tagInfo.isCollect
											? 'font-semibold'
											: 'bg-muted border-border/60 text-muted-foreground'}"
										style={tagInfo.isCollect
											? `background-color: ${(tagInfo.color || '#409EFF')}20; border-color: ${(tagInfo.color || '#409EFF')}40; color: ${tagInfo.color || '#409EFF'};`
											: ''}
										title={getTagTitle(tagInfo)}
									>
										{tagInfo.display}
									</span>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
{/if}
