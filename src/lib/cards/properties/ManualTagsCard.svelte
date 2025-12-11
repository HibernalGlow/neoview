<script lang="ts">
/**
 * ManualTagsCard - 手动标签管理卡片
 * 在属性面板中显示和管理当前书籍的手动标签
 */
import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';
import { getManualTagsSync, getAllUniqueManualTags, type ManualTag } from '$lib/stores/emm/manualTagStore.svelte';
import { emmTranslationStore } from '$lib/stores/emmMetadata.svelte';
import { TAG_NAMESPACES, NAMESPACE_LABELS } from '$lib/stores/emm/manualTagStore.svelte';
import { X, Plus, Tag } from '@lucide/svelte';
import { addManualTag, removeManualTag } from '$lib/stores/emm/manualTagStore.svelte';
import { Button } from '$lib/components/ui/button';
import * as Select from '$lib/components/ui/select';

let bookInfo = $state<ViewerBookInfo | null>(null);
let manualTags = $state<ManualTag[]>([]);
let showAddForm = $state(false);
let newNamespace = $state<string>('female');
let newTagInput = $state('');

// 订阅书籍信息
$effect(() => {
	const unsubscribe = infoPanelStore.subscribe((state) => {
		bookInfo = state.bookInfo;
		if (bookInfo?.path) {
			manualTags = getManualTagsSync(bookInfo.path);
		} else {
			manualTags = [];
		}
	});
	return unsubscribe;
});

// 获取所有唯一的手动标签（用于统计）
const uniqueTags = $derived(getAllUniqueManualTags());

// 翻译标签
function translateTag(tag: ManualTag): string {
	return emmTranslationStore.translateTag(tag.tag, tag.namespace);
}

// 获取命名空间颜色
function getNamespaceColor(namespace: string): string {
	const colors: Record<string, string> = {
		artist: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
		group: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
		parody: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
		character: 'bg-green-500/20 text-green-400 border-green-500/30',
		female: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
		male: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
		mixed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
		other: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
		language: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
		reclass: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
		custom: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
	};
	return colors[namespace] || colors.custom;
}

// 添加标签
async function handleAddTag() {
	if (!bookInfo?.path || !newTagInput.trim()) return;
	
	await addManualTag(bookInfo.path, newNamespace, newTagInput.trim());
	manualTags = getManualTagsSync(bookInfo.path);
	newTagInput = '';
	showAddForm = false;
}

// 删除标签
async function handleRemoveTag(tag: ManualTag) {
	if (!bookInfo?.path) return;
	
	await removeManualTag(bookInfo.path, tag.namespace, tag.tag);
	manualTags = getManualTagsSync(bookInfo.path);
}
</script>

<div class="space-y-2 text-[11px]">
	{#if !bookInfo}
		<div class="text-center py-4 text-muted-foreground">
			<Tag class="h-6 w-6 mx-auto mb-2 opacity-50" />
			<p>未打开书籍</p>
			<p class="text-[10px] mt-1">打开书籍后可添加手动标签</p>
		</div>
	{:else}
		<!-- 当前标签列表 -->
		{#if manualTags.length > 0}
			<div class="flex flex-wrap gap-1">
				{#each manualTags as tag}
					{@const translated = translateTag(tag)}
					<span 
						class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border-2 border-dashed {getNamespaceColor(tag.namespace)}"
						title="{NAMESPACE_LABELS[tag.namespace] || tag.namespace}: {tag.tag}{translated !== tag.tag ? ` (${translated})` : ''}"
					>
						<span class="opacity-70">{tag.namespace.slice(0, 1)}:</span>
						<span>{translated}</span>
						<button
							type="button"
							class="ml-0.5 hover:text-destructive"
							onclick={() => handleRemoveTag(tag)}
						>
							<X class="h-2.5 w-2.5" />
						</button>
					</span>
				{/each}
			</div>
		{:else}
			<div class="text-center py-2 text-muted-foreground text-[10px]">
				暂无手动标签
			</div>
		{/if}

		<!-- 添加表单 -->
		{#if showAddForm}
			<div class="flex gap-1 items-center pt-2 border-t border-border/50">
				<Select.Root type="single" bind:value={newNamespace}>
					<Select.Trigger class="h-6 w-16 text-[10px]">
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
					class="flex-1 h-6 px-2 text-[10px] rounded border border-input bg-background"
					onkeydown={(e) => e.key === 'Enter' && handleAddTag()}
				/>
				<Button size="icon" variant="ghost" class="h-6 w-6" onclick={handleAddTag}>
					<Plus class="h-3 w-3" />
				</Button>
				<Button size="icon" variant="ghost" class="h-6 w-6" onclick={() => showAddForm = false}>
					<X class="h-3 w-3" />
				</Button>
			</div>
		{:else}
			<Button
				variant="outline"
				size="sm"
				class="w-full h-6 text-[10px]"
				onclick={() => showAddForm = true}
			>
				<Plus class="h-3 w-3 mr-1" />
				添加标签
			</Button>
		{/if}

		<!-- 统计信息 -->
		<div class="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
			当前: {manualTags.length} 个 | 全局: {uniqueTags.length} 种标签
		</div>
	{/if}
</div>
