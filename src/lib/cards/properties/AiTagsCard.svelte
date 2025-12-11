<script lang="ts">
/**
 * AiTagsCard - AI 标签推断卡片
 * 通过 AI API 根据文件名推断标签并添加到手动标签
 * 使用共享的 aiApiConfigStore 配置
 */
import { Bot, Play, Loader2, Check, Plus, AlertCircle } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { addManualTag, NAMESPACE_LABELS, TAG_NAMESPACES } from '$lib/stores/emm/manualTagStore.svelte';
import { emmTranslationStore, emmMetadataStore } from '$lib/stores/emmMetadata.svelte';
import { favoriteTagStore } from '$lib/stores/emm/favoriteTagStore.svelte';
import { infoPanelStore } from '$lib/stores/infoPanel.svelte';
import { aiApiConfigStore } from '$lib/stores/aiApiConfig.svelte';
import { get } from 'svelte/store';

// 推断结果
interface InferredTag {
	namespace: string;
	tag: string;
	confidence?: number;
}

// 状态
let isInferring = $state(false);
let inferredTags = $state<InferredTag[]>([]);
let errorMessage = $state('');
let hasConfig = $state(false);

// 订阅配置状态
$effect(() => {
	const unsub = aiApiConfigStore.subscribe(state => {
		hasConfig = state.providers.length > 0;
	});
	return unsub;
});

// 获取当前文件路径
function getCurrentPath(): string {
	const state = get(infoPanelStore);
	return state.bookInfo?.path || '';
}

// 获取文件名
function getFileName(path: string): string {
	return path.split(/[\\/]/).pop() || path;
}

// 构建 AI 提示词
function buildPrompt(fileName: string): string {
	// 获取收藏标签作为参考
	const favTags = favoriteTagStore.tags.slice(0, 50).map(t => t.tag);
	
	// 获取翻译字典中的常用标签
	const dict = emmMetadataStore.getTranslationDict();
	const sampleTags: Record<string, string[]> = {};
	if (dict) {
		for (const ns of ['parody', 'character', 'artist', 'group', 'female', 'male']) {
			const nsDict = dict[ns];
			if (nsDict) {
				sampleTags[ns] = Object.keys(nsDict).slice(0, 30);
			}
		}
	}

	return `你是一个专业的漫画/图集标签分类助手。根据以下文件名推断标签。

文件名：${fileName}

**关键指令**：
1. 严格从文件名中提取信息，不要凭空捏造
2. 括号 [] 中通常是社团名，() 中通常是作者名
3. 识别原作(parody)、角色(character)、画师(artist)、社团(group)
4. 对于角色，如果是别名/简称，请识别出完整角色名和原作

可参考的标签示例（仅供拼写参考）：
${JSON.stringify(sampleTags, null, 2)}

我的收藏标签（仅供拼写参考）：
${JSON.stringify(favTags)}

请返回 JSON 格式：
{
  "tags": [
    { "namespace": "artist", "tag": "xxx" },
    { "namespace": "group", "tag": "xxx" },
    { "namespace": "parody", "tag": "xxx" },
    { "namespace": "character", "tag": "xxx" }
  ]
}

namespace 可选值：${TAG_NAMESPACES.join(', ')}
只返回 JSON，不要其他文字。`;
}

// 执行推断 - 使用共享的 aiApiConfigStore
async function handleInfer() {
	const path = getCurrentPath();
	if (!path) {
		errorMessage = '请先打开一个文件';
		return;
	}

	if (!hasConfig) {
		errorMessage = '请先在「AI API 配置」卡片中添加提供商';
		return;
	}

	isInferring = true;
	errorMessage = '';
	inferredTags = [];

	try {
		const fileName = getFileName(path);
		const prompt = buildPrompt(fileName);
		
		// 使用共享的 API 配置
		const response = await aiApiConfigStore.chat([
			{ role: 'system', content: '你是一个专业的漫画标签分类助手。只返回 JSON 格式。' },
			{ role: 'user', content: prompt }
		], { jsonMode: true });

		// 解析 JSON
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('无法解析 AI 返回的 JSON');
		}

		const result = JSON.parse(jsonMatch[0]);
		inferredTags = result.tags || [];
		console.log('[AiTagsCard] 推断结果:', inferredTags);
	} catch (e) {
		console.error('[AiTagsCard] 推断失败:', e);
		errorMessage = e instanceof Error ? e.message : '推断失败';
	} finally {
		isInferring = false;
	}
}

// 添加单个标签到手动标签
async function handleAddTag(tag: InferredTag) {
	const path = getCurrentPath();
	if (!path) return;

	const success = await addManualTag(path, tag.namespace, tag.tag);
	if (success) {
		// 从推断列表中移除已添加的标签
		inferredTags = inferredTags.filter(t => !(t.namespace === tag.namespace && t.tag === tag.tag));
	}
}

// 添加所有标签
async function handleAddAllTags() {
	const path = getCurrentPath();
	if (!path) return;

	for (const tag of inferredTags) {
		await addManualTag(path, tag.namespace, tag.tag);
	}
	inferredTags = [];
}

// 翻译标签
function translateTag(namespace: string, tag: string): string {
	const dict = emmMetadataStore.getTranslationDict();
	return emmTranslationStore.translateTag(tag, namespace, dict);
}

// 获取活动提供商名称
let activeProviderName = $derived.by(() => {
	const provider = aiApiConfigStore.getActiveProvider();
	return provider?.name || '';
});
</script>

<div class="space-y-3">
	<!-- 头部 -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Bot class="h-4 w-4 text-purple-500" />
			<span class="text-sm font-medium">AI 标签推断</span>
		</div>
		{#if hasConfig}
			<span class="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
				{activeProviderName}
			</span>
		{/if}
	</div>

	<!-- 未配置提示 -->
	{#if !hasConfig}
		<div class="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 px-2 py-1.5 rounded">
			<AlertCircle class="h-3.5 w-3.5 shrink-0" />
			<span>请先在「AI API 配置」卡片中添加提供商</span>
		</div>
	{/if}

	<!-- 推断按钮 -->
	<Button 
		variant="outline" 
		size="sm" 
		class="w-full"
		disabled={isInferring || !hasConfig}
		onclick={handleInfer}
	>
		{#if isInferring}
			<Loader2 class="h-4 w-4 mr-2 animate-spin" />
			推断中...
		{:else}
			<Play class="h-4 w-4 mr-2" />
			根据文件名推断标签
		{/if}
	</Button>

	<!-- 错误信息 -->
	{#if errorMessage}
		<div class="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">
			{errorMessage}
		</div>
	{/if}

	<!-- 推断结果 -->
	{#if inferredTags.length > 0}
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-xs text-muted-foreground">推断结果 ({inferredTags.length})</span>
				<Button variant="ghost" size="sm" class="h-6 text-xs" onclick={handleAddAllTags}>
					<Check class="h-3 w-3 mr-1" />
					全部添加
				</Button>
			</div>
			<div class="flex flex-wrap gap-1.5">
				{#each inferredTags as tag}
					{@const translated = translateTag(tag.namespace, tag.tag)}
					<button
						type="button"
						class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-dashed border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
						onclick={() => handleAddTag(tag)}
						title="点击添加: {NAMESPACE_LABELS[tag.namespace]}: {tag.tag}{translated !== tag.tag ? ` (${translated})` : ''}"
					>
						<span class="text-purple-400 opacity-70">{tag.namespace.slice(0, 1)}:</span>
						<span class="text-purple-300">{translated}</span>
						<Plus class="h-3 w-3 text-purple-400" />
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 使用说明 -->
	{#if hasConfig && inferredTags.length === 0 && !isInferring}
		<p class="text-[10px] text-muted-foreground text-center py-2">
			点击上方按钮，AI 将根据文件名推断标签
		</p>
	{/if}
</div>
