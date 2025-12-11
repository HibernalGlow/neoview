<script lang="ts">
/**
 * 收藏标签快选卡片
 * 从 EmmPanelSection 提取
 * 顶部添加手动标签区域
 */
import { RefreshCcw, X, Plus, Tag } from '@lucide/svelte';
import * as Button from '$lib/components/ui/button';
import { favoriteTagStore, categoryColors, mixedGenderStore, cat2letter, createTagValue, type FavoriteTag } from '$lib/stores/emm/favoriteTagStore.svelte';
import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';
import { getManualTagsSync, addManualTag, removeManualTag, getAllUniqueManualTags, type ManualTag, TAG_NAMESPACES, NAMESPACE_LABELS } from '$lib/stores/emm/manualTagStore.svelte';
import { emmTranslationStore } from '$lib/stores/emmMetadata.svelte';
import * as Select from '$lib/components/ui/select';

// 性别类别列表
const genderCategories = ['female', 'male', 'mixed'];

// 扩展标签类型
interface ExtendedFavoriteTag extends FavoriteTag {
	isMixedVariant?: boolean;
	originalCat?: string;
}

let isReloadingFavoriteTags = $state(false);

// 手动标签状态
let bookInfo = $state<ViewerBookInfo | null>(null);
let manualTags = $state<ManualTag[]>([]);
let showAddForm = $state(false);
let newNamespace = $state<string>('female');
let newTagInput = $state('');
let lastBookPath = $state<string | null>(null);

// 订阅书籍信息（只订阅一次）
infoPanelStore.subscribe((state) => {
	bookInfo = state.bookInfo;
});

// 当书籍路径变化时更新手动标签
$effect(() => {
	const path = bookInfo?.path;
	if (path !== lastBookPath) {
		lastBookPath = path ?? null;
		if (path) {
			manualTags = getManualTagsSync(path);
		} else {
			manualTags = [];
		}
	}
});

// 翻译手动标签
function translateManualTag(tag: ManualTag): string {
	// 从 emmMetadataStore 获取翻译字典
	const dict = favoriteTagStore.translationDict;
	return emmTranslationStore.translateTag(tag.tag, tag.namespace, dict);
}

// 获取手动标签颜色
function getManualTagColor(namespace: string): string {
	return categoryColors[namespace] || '#10b981';
}

// 添加手动标签
async function handleAddManualTag() {
	if (!bookInfo?.path || !newTagInput.trim()) return;
	await addManualTag(bookInfo.path, newNamespace, newTagInput.trim());
	manualTags = getManualTagsSync(bookInfo.path);
	newTagInput = '';
	showAddForm = false;
}

// 删除手动标签
async function handleRemoveManualTag(tag: ManualTag) {
	if (!bookInfo?.path) return;
	await removeManualTag(bookInfo.path, tag.namespace, tag.tag);
	manualTags = getManualTagsSync(bookInfo.path);
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
	<!-- 手动标签区域 -->
	{#if bookInfo}
		<div class="pb-2 border-b border-border/50">
			<div class="flex items-center justify-between mb-1">
				<span class="font-medium flex items-center gap-1">
					<Tag class="h-3 w-3" />
					手动标签
				</span>
				<span class="text-[10px] text-muted-foreground">{manualTags.length}</span>
			</div>
			
			{#if manualTags.length > 0}
				<div class="flex flex-wrap gap-1 mb-1">
					{#each manualTags as tag}
						{@const translated = translateManualTag(tag)}
						{@const color = getManualTagColor(tag.namespace)}
						<span
							class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border-2 border-dashed text-[10px]"
							style="border-color: {color}; background: color-mix(in srgb, {color} 12%, transparent); color: {color};"
							title="{NAMESPACE_LABELS[tag.namespace]}: {tag.tag}{translated !== tag.tag ? ` (${translated})` : ''}"
						>
							<span class="opacity-70">{tag.namespace.slice(0, 1)}:</span>
							<span>{translated}</span>
							<button
								type="button"
								class="ml-0.5 hover:opacity-70"
								onclick={() => handleRemoveManualTag(tag)}
							>
								<X class="h-2.5 w-2.5" />
							</button>
						</span>
					{/each}
				</div>
			{/if}
			
			{#if showAddForm}
				<div class="flex gap-1 items-center">
					<Select.Root type="single" bind:value={newNamespace}>
						<Select.Trigger class="h-5 w-14 text-[10px] px-1">
							{NAMESPACE_LABELS[newNamespace]?.slice(0, 2) || newNamespace.slice(0, 2)}
						</Select.Trigger>
						<Select.Content>
							{#each TAG_NAMESPACES as ns}
								<Select.Item value={ns} class="text-[10px]">{NAMESPACE_LABELS[ns]}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input
						type="text"
						bind:value={newTagInput}
						placeholder="标签名"
						class="flex-1 h-5 px-1.5 text-[10px] rounded border border-input bg-background"
						onkeydown={(e) => e.key === 'Enter' && handleAddManualTag()}
					/>
					<button type="button" class="h-5 w-5 flex items-center justify-center hover:bg-muted rounded" onclick={handleAddManualTag}>
						<Plus class="h-3 w-3" />
					</button>
					<button type="button" class="h-5 w-5 flex items-center justify-center hover:bg-muted rounded" onclick={() => showAddForm = false}>
						<X class="h-3 w-3" />
					</button>
				</div>
			{:else}
				<button
					type="button"
					class="w-full h-5 text-[10px] rounded border border-dashed border-border hover:bg-muted/50 flex items-center justify-center gap-1"
					onclick={() => showAddForm = true}
				>
					<Plus class="h-3 w-3" />
					添加
				</button>
			{/if}
		</div>
	{/if}

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
