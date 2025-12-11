<script lang="ts">
/**
 * AiTagsCard - AI 标签推断卡片
 * 通过 AI API 根据文件名推断标签并添加到手动标签
 */
import { Bot, Play, Settings, Loader2, Check, X, Plus } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import * as Select from '$lib/components/ui/select';
import { addManualTag, NAMESPACE_LABELS, TAG_NAMESPACES } from '$lib/stores/emm/manualTagStore.svelte';
import { emmTranslationStore, emmMetadataStore } from '$lib/stores/emmMetadata.svelte';
import { favoriteTagStore } from '$lib/stores/emm/favoriteTagStore.svelte';
import { infoPanelStore } from '$lib/stores/infoPanel.svelte';
import { get } from 'svelte/store';

// AI API 配置
interface AiApiConfig {
	name: string;
	baseUrl: string;
	apiKey: string;
	model: string;
}

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
let showSettings = $state(false);

// API 配置（从 localStorage 加载）
let apiConfig = $state<AiApiConfig>({
	name: 'DeepSeek',
	baseUrl: 'https://api.deepseek.com/v1/chat/completions',
	apiKey: '',
	model: 'deepseek-chat'
});

// 预设 API 提供商
const API_PRESETS: Record<string, Partial<AiApiConfig>> = {
	deepseek: {
		name: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/v1/chat/completions',
		model: 'deepseek-chat'
	},
	openai: {
		name: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1/chat/completions',
		model: 'gpt-3.5-turbo'
	},
	ollama: {
		name: 'Ollama (本地)',
		baseUrl: 'http://localhost:11434/v1/chat/completions',
		model: 'qwen2.5:7b'
	}
};

// 加载配置
function loadConfig() {
	try {
		const saved = localStorage.getItem('neoview-ai-tag-config');
		if (saved) {
			apiConfig = JSON.parse(saved);
		}
	} catch (e) {
		console.error('[AiTagsCard] 加载配置失败:', e);
	}
}

// 保存配置
function saveConfig() {
	try {
		localStorage.setItem('neoview-ai-tag-config', JSON.stringify(apiConfig));
	} catch (e) {
		console.error('[AiTagsCard] 保存配置失败:', e);
	}
}

// 应用预设
function applyPreset(preset: string) {
	const p = API_PRESETS[preset];
	if (p) {
		apiConfig = { ...apiConfig, ...p };
		saveConfig();
	}
}

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

// 调用 AI API
async function callAiApi(prompt: string): Promise<InferredTag[]> {
	const { baseUrl, apiKey, model } = apiConfig;
	
	if (!apiKey && !baseUrl.includes('localhost')) {
		throw new Error('请先配置 API Key');
	}

	const response = await fetch(baseUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: '你是一个专业的漫画标签分类助手。只返回 JSON 格式。' },
				{ role: 'user', content: prompt }
			],
			temperature: 0.3,
			max_tokens: 500
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`API 请求失败: ${response.status} - ${errorText.slice(0, 200)}`);
	}

	const data = await response.json();
	const content = data.choices?.[0]?.message?.content;
	
	if (!content) {
		throw new Error('AI 返回空内容');
	}

	// 解析 JSON
	const jsonMatch = content.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		throw new Error('无法解析 AI 返回的 JSON');
	}

	const result = JSON.parse(jsonMatch[0]);
	return result.tags || [];
}

// 执行推断
async function handleInfer() {
	const path = getCurrentPath();
	if (!path) {
		errorMessage = '请先打开一个文件';
		return;
	}

	isInferring = true;
	errorMessage = '';
	inferredTags = [];

	try {
		const fileName = getFileName(path);
		const prompt = buildPrompt(fileName);
		inferredTags = await callAiApi(prompt);
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

// 初始化
loadConfig();
</script>

<div class="space-y-3">
	<!-- 头部 -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Bot class="h-4 w-4 text-purple-500" />
			<span class="text-sm font-medium">AI 标签推断</span>
		</div>
		<Button 
			variant="ghost" 
			size="icon" 
			class="h-6 w-6"
			onclick={() => { showSettings = !showSettings; }}
		>
			<Settings class="h-3.5 w-3.5" />
		</Button>
	</div>

	<!-- 设置面板 -->
	{#if showSettings}
		<div class="space-y-2 p-2 rounded border bg-muted/30">
			<div class="flex gap-2">
				<Select.Root type="single" onValueChange={(v) => { if (v) applyPreset(v); }}>
					<Select.Trigger class="h-8 text-xs flex-1">
						<span>预设: {apiConfig.name}</span>
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="deepseek">DeepSeek (推荐)</Select.Item>
						<Select.Item value="openai">OpenAI</Select.Item>
						<Select.Item value="ollama">Ollama 本地</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<Input
				value={apiConfig.apiKey}
				placeholder="API Key"
				type="password"
				class="h-8 text-xs"
				oninput={(e) => { apiConfig.apiKey = (e.target as HTMLInputElement).value; saveConfig(); }}
			/>
			<Input
				value={apiConfig.baseUrl}
				placeholder="API URL"
				class="h-8 text-xs"
				oninput={(e) => { apiConfig.baseUrl = (e.target as HTMLInputElement).value; saveConfig(); }}
			/>
			<Input
				value={apiConfig.model}
				placeholder="模型名称"
				class="h-8 text-xs"
				oninput={(e) => { apiConfig.model = (e.target as HTMLInputElement).value; saveConfig(); }}
			/>
			<p class="text-[10px] text-muted-foreground">
				推荐 DeepSeek，约 ¥0.001/次
			</p>
		</div>
	{/if}

	<!-- 推断按钮 -->
	<Button 
		variant="outline" 
		size="sm" 
		class="w-full"
		disabled={isInferring}
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
	{#if !showSettings && inferredTags.length === 0 && !isInferring}
		<p class="text-[10px] text-muted-foreground text-center py-2">
			点击上方按钮，AI 将根据文件名推断标签
		</p>
	{/if}
</div>
