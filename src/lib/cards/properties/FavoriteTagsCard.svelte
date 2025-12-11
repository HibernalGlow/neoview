<script lang="ts">
/**
 * 收藏标签快选卡片
 * 从 EmmPanelSection 提取
 * 顶部添加手动标签区域
 */
import { RefreshCcw, Tag } from '@lucide/svelte';
import * as Button from '$lib/components/ui/button';
import { favoriteTagStore, categoryColors, mixedGenderStore, cat2letter, createTagValue, type FavoriteTag } from '$lib/stores/emm/favoriteTagStore.svelte';
import { getAllUniqueManualTags, NAMESPACE_LABELS } from '$lib/stores/emm/manualTagStore.svelte';
import { emmTranslationStore, emmMetadataStore } from '$lib/stores/emmMetadata.svelte';

// 性别类别列表
const genderCategories = ['female', 'male', 'mixed'];

// 扩展标签类型
interface ExtendedFavoriteTag extends FavoriteTag {
	isMixedVariant?: boolean;
	originalCat?: string;
}

let isReloadingFavoriteTags = $state(false);

// 全局手动标签（所有书籍的唯一标签，用于快速搜索）
let allManualTags = $state<Array<{ namespace: string; tag: string; count: number }>>([]);

// 刷新全局手动标签
function refreshAllManualTags() {
	allManualTags = getAllUniqueManualTags();
}

// 初始加载
refreshAllManualTags();

// 翻译手动标签
function translateManualTag(namespace: string, tag: string): string {
	const dict = emmMetadataStore.getTranslationDict();
	return emmTranslationStore.translateTag(tag, namespace, dict);
}

// 获取手动标签颜色
function getManualTagColor(namespace: string): string {
	return categoryColors[namespace] || '#10b981';
}

// 收藏标签分组（支持混合变体）
const favoriteTagGroups = $derived.by((): Array<{ name: string; tags: ExtendedFavoriteTag[] }> => {
	const baseTags = favoriteTagStore.tags;
	const isMixedEnabled = mixedGenderStore.enabled;
	
	if (!isMixedEnabled) {
		return favoriteTagStore.groupedTags.map(group => ({
			name: group.name,
			tags: group.tags.map(tag => ({ ...tag } as ExtendedFavoriteTag))
		}));
	}
	
	// 开启混合时，生成变体
	const extendedTags: ExtendedFavoriteTag[] = [];
	const addedIds = new Set<string>();
	
	for (const tag of baseTags) {
		if (!addedIds.has(tag.id)) {
			extendedTags.push({ ...tag });
			addedIds.add(tag.id);
		}
		
		if (genderCategories.includes(tag.cat)) {
			for (const otherCat of genderCategories) {
				if (otherCat === tag.cat) continue;
				const variantId = `${otherCat}:${tag.tag}`;
				if (addedIds.has(variantId)) continue;
				
				const letter = cat2letter[otherCat] || otherCat.charAt(0);
				extendedTags.push({
					id: variantId,
					cat: otherCat,
					tag: tag.tag,
					letter,
					display: `${otherCat}:${tag.display.split(':')[1] || tag.tag}`,
					value: createTagValue(otherCat, tag.tag),
					color: tag.color,
					isMixedVariant: true,
					originalCat: tag.cat
				});
				addedIds.add(variantId);
			}
		}
	}
	
	// 分组
	const groups: Record<string, ExtendedFavoriteTag[]> = {};
	for (const tag of extendedTags) {
		if (!groups[tag.cat]) groups[tag.cat] = [];
		groups[tag.cat].push(tag);
	}
	
	return Object.entries(groups)
		.map(([name, tags]) => ({ name, tags }))
		.sort((a, b) => a.name.localeCompare(b.name));
});

// 切换混合性别模式
function toggleMixedGender() {
	mixedGenderStore.toggle();
}

// 重新加载收藏标签
async function handleReloadFavoriteTags() {
	isReloadingFavoriteTags = true;
	try {
		await favoriteTagStore.reloadFromEMM();
	} finally {
		isReloadingFavoriteTags = false;
	}
}
</script>

<div class="space-y-2 text-[11px]">
	<!-- 手动标签区域（全局唯一标签，用于搜索） -->
	<div class="pb-2 border-b border-border/50">
		<div class="flex items-center justify-between mb-1">
			<button
				type="button"
				class="font-medium flex items-center gap-1 hover:text-primary"
				onclick={refreshAllManualTags}
				title="点击刷新"
			>
				<Tag class="h-3 w-3" />
				手动标签
			</button>
			<span class="text-[10px] text-muted-foreground">{allManualTags.length} 种</span>
		</div>
		
		{#if allManualTags.length === 0}
			<p class="text-[10px] text-muted-foreground text-center py-1">暂无手动标签</p>
			<p class="text-[9px] text-muted-foreground/70 text-center">右键文件 → 编辑标签</p>
		{:else}
			<div class="flex flex-wrap gap-1">
				{#each allManualTags as mt}
					{@const translated = translateManualTag(mt.namespace, mt.tag)}
					{@const color = getManualTagColor(mt.namespace)}
					<span
						class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border-2 border-dashed text-[10px]"
						style="border-color: {color}; background: color-mix(in srgb, {color} 12%, transparent); color: {color};"
						title="{NAMESPACE_LABELS[mt.namespace]}: {mt.tag}{translated !== mt.tag ? ` (${translated})` : ''} ({mt.count}个文件)"
					>
						<span class="opacity-70">{mt.namespace.slice(0, 1)}:</span>
						<span>{translated}</span>
						<span class="opacity-50 text-[9px]">×{mt.count}</span>
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<!-- 控制栏 -->
	<div class="flex items-center justify-between gap-2 py-1 border-b border-border/50">
		<label class="flex items-center gap-1.5 cursor-pointer">
			<input
				type="checkbox"
				checked={mixedGenderStore.enabled}
				onchange={toggleMixedGender}
				class="h-3 w-3 rounded accent-primary"
			/>
			<span class="text-muted-foreground">混合性别搜索</span>
		</label>
		<Button.Root
			variant="ghost"
			size="sm"
			class="h-6 px-2 gap-1 text-[10px] {isReloadingFavoriteTags ? 'animate-spin' : ''}"
			onclick={handleReloadFavoriteTags}
			disabled={isReloadingFavoriteTags}
		>
			<RefreshCcw class="h-3 w-3" />
			刷新
		</Button.Root>
	</div>

	<!-- 标签分组显示 -->
	{#if favoriteTagGroups.length === 0}
		<div class="py-4 text-center text-muted-foreground">
			<p>暂无收藏标签</p>
			<p class="text-[10px] mt-1">点击刷新从 EMM 导入</p>
		</div>
	{:else}
		<div class="max-h-[300px] overflow-y-auto space-y-2">
			{#each favoriteTagGroups as group}
				<div>
					<div class="flex items-center justify-between px-1 py-0.5 rounded bg-muted/50 mb-1">
						<span class="font-semibold" style="color: {categoryColors[group.name] || '#666'}">
							{group.name}
						</span>
						<span class="text-[10px] text-muted-foreground">{group.tags.length}</span>
					</div>
					<div class="flex flex-wrap gap-1">
						{#each group.tags as tag (tag.id)}
							{@const isVariant = 'isMixedVariant' in tag && tag.isMixedVariant}
							{@const origCat = 'originalCat' in tag ? tag.originalCat : ''}
							<span
								class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] {isVariant ? 'border-dashed opacity-70' : ''}"
								style="
									border-color: {tag.color};
									background: color-mix(in srgb, {tag.color} {isVariant ? '5%' : '10%'}, transparent);
								"
								title={isVariant ? `混合变体 (来自 ${origCat})\n${tag.value}` : tag.value}
							>
								<span class="w-1.5 h-1.5 {isVariant ? 'rounded-sm' : 'rounded-full'}" style="background: {tag.color}"></span>
								{tag.display.split(':')[1]}
							</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<p class="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
		在文件夹面板搜索栏点击「★ 标签」使用快选
	</p>
</div>
