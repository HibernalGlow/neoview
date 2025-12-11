<script lang="ts">
/**
 * ManualTagEditor - 手动标签编辑器
 * 用于添加/编辑/删除手动标签
 * 支持中英文输入提示
 */
import { createEventDispatcher } from 'svelte';
import { X, Plus, Tag } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import * as Dialog from '$lib/components/ui/dialog';
import * as Select from '$lib/components/ui/select';
import {
	type ManualTag,
	TAG_NAMESPACES,
	NAMESPACE_LABELS,
	getManualTags,
	addManualTag,
	removeManualTag
} from '$lib/stores/emm/manualTagStore.svelte';
import { findEMMTranslationFile, loadEMMTranslationDict, type EMMTranslationDict } from '$lib/api/emm';

/** 标签建议项 */
interface TagSuggestion {
	tag: string;       // 英文标签
	translated: string; // 中文翻译
	namespace: string; // 所属命名空间
}

interface Props {
	open: boolean;
	path: string;
	emmTags?: Array<{ namespace: string; tag: string; translated?: string }>;
}

let { open = $bindable(), path, emmTags = [] }: Props = $props();

const dispatch = createEventDispatcher<{
	close: void;
	change: { manualTags: ManualTag[] };
}>();

// 当前手动标签
let manualTags = $state<ManualTag[]>([]);
// 新标签输入
let newNamespace = $state<string>('custom');
let newTag = $state<string>('');
// 加载状态
let isLoading = $state(false);

// 翻译字典
let translationDict = $state<EMMTranslationDict | null>(null);
// 标签建议
let suggestions = $state<TagSuggestion[]>([]);
// 是否显示建议列表
let showSuggestions = $state(false);
// 当前选中的建议索引
let selectedSuggestionIndex = $state(-1);

// 加载翻译字典
async function loadTranslationDict() {
	try {
		const dictPath = await findEMMTranslationFile();
		if (dictPath) {
			translationDict = await loadEMMTranslationDict(dictPath);
			console.log('[ManualTagEditor] 已加载翻译字典');
		}
	} catch (e) {
		console.error('[ManualTagEditor] 加载翻译字典失败:', e);
	}
}

// 搜索标签建议
function searchSuggestions(query: string) {
	if (!query.trim() || !translationDict) {
		suggestions = [];
		showSuggestions = false;
		return;
	}
	
	const q = query.toLowerCase();
	const results: TagSuggestion[] = [];
	const maxResults = 20;
	
	// 在所有命名空间中搜索
	for (const [namespace, tags] of Object.entries(translationDict)) {
		if (namespace === 'rows') continue; // 跳过 rows（类别翻译）
		
		for (const [tag, record] of Object.entries(tags)) {
			if (results.length >= maxResults) break;
			
			const translated = record.name || tag;
			// 匹配英文标签或中文翻译
			if (tag.toLowerCase().includes(q) || translated.toLowerCase().includes(q)) {
				results.push({ tag, translated, namespace });
			}
		}
		if (results.length >= maxResults) break;
	}
	
	suggestions = results;
	showSuggestions = results.length > 0;
	selectedSuggestionIndex = -1;
}

// 选择建议
function selectSuggestion(suggestion: TagSuggestion) {
	newTag = suggestion.tag;
	newNamespace = suggestion.namespace;
	showSuggestions = false;
	selectedSuggestionIndex = -1;
}

// 处理输入变化
function handleInputChange(e: Event) {
	const target = e.target as HTMLInputElement;
	newTag = target.value;
	searchSuggestions(newTag);
}

// 处理键盘事件
function handleKeydown(e: KeyboardEvent) {
	if (!showSuggestions) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAddTag();
		}
		return;
	}
	
	switch (e.key) {
		case 'ArrowDown':
			e.preventDefault();
			selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestions.length - 1);
			break;
		case 'ArrowUp':
			e.preventDefault();
			selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
			break;
		case 'Enter':
			e.preventDefault();
			if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
				selectSuggestion(suggestions[selectedSuggestionIndex]);
			} else {
				handleAddTag();
			}
			break;
		case 'Escape':
			showSuggestions = false;
			selectedSuggestionIndex = -1;
			break;
	}
}

// 加载手动标签
async function loadTags() {
	if (!path) return;
	isLoading = true;
	try {
		manualTags = await getManualTags(path);
	} catch (e) {
		console.error('加载手动标签失败:', e);
	} finally {
		isLoading = false;
	}
}

// 当 path 或 open 变化时重新加载
$effect(() => {
	if (open && path) {
		loadTags();
		if (!translationDict) {
			loadTranslationDict();
		}
	}
});

// 添加新标签
async function handleAddTag() {
	if (!newTag.trim()) return;
	
	const success = await addManualTag(path, newNamespace, newTag.trim());
	if (success) {
		await loadTags();
		dispatch('change', { manualTags });
		newTag = '';
	}
}

// 删除标签
async function handleRemoveTag(tag: ManualTag) {
	const success = await removeManualTag(path, tag.namespace, tag.tag);
	if (success) {
		await loadTags();
		dispatch('change', { manualTags });
	}
}

// 关闭对话框
function handleClose() {
	open = false;
	dispatch('close');
}

// 获取命名空间颜色
function getNamespaceColor(namespace: string): string {
	const colors: Record<string, string> = {
		artist: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
		group: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
		parody: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
		character: 'bg-green-500/20 text-green-400 border-green-500/30',
		female: 'bg-red-500/20 text-red-400 border-red-500/30',
		male: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
		mixed: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
		other: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
		language: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
		reclass: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
		custom: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
	};
	return colors[namespace] || colors.custom;
}

// 获取手动标签的特殊样式（与 EMM 标签区分）
function getManualTagStyle(): string {
	return 'border-dashed border-2';
}
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) handleClose(); }}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<Tag class="h-5 w-5" />
				编辑标签
			</Dialog.Title>
			<Dialog.Description>
				{path.split(/[\\/]/).pop()}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<!-- EMM 标签（只读） -->
			{#if emmTags.length > 0}
				<div class="space-y-2">
					<h4 class="text-sm font-medium text-muted-foreground">EMM 标签</h4>
					<div class="flex flex-wrap gap-1.5">
						{#each emmTags as tag}
							<span 
								class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border {getNamespaceColor(tag.namespace)}"
								title="{NAMESPACE_LABELS[tag.namespace] || tag.namespace}: {tag.tag}"
							>
								<span class="opacity-70">{tag.namespace}:</span>
								<span>{tag.translated || tag.tag}</span>
							</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- 手动标签 -->
			<div class="space-y-2">
				<h4 class="text-sm font-medium text-muted-foreground">手动标签</h4>
				{#if isLoading}
					<p class="text-sm text-muted-foreground">加载中...</p>
				{:else if manualTags.length === 0}
					<p class="text-sm text-muted-foreground">暂无手动标签</p>
				{:else}
					<div class="flex flex-wrap gap-1.5">
						{#each manualTags as tag}
							<span 
								class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border {getNamespaceColor(tag.namespace)} {getManualTagStyle()}"
								title="{NAMESPACE_LABELS[tag.namespace] || tag.namespace}: {tag.tag}"
							>
								<span class="opacity-70">{tag.namespace}:</span>
								<span>{tag.tag}</span>
								<button
									type="button"
									class="ml-0.5 hover:text-destructive"
									onclick={() => handleRemoveTag(tag)}
								>
									<X class="h-3 w-3" />
								</button>
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<!-- 添加新标签 -->
			<div class="space-y-2">
				<h4 class="text-sm font-medium">添加标签</h4>
				<div class="flex gap-2">
					<Select.Root type="single" bind:value={newNamespace}>
						<Select.Trigger class="w-32">
							{NAMESPACE_LABELS[newNamespace] || newNamespace}
						</Select.Trigger>
						<Select.Content>
							{#each TAG_NAMESPACES as ns}
								<Select.Item value={ns}>{NAMESPACE_LABELS[ns]}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<div class="relative flex-1">
						<Input
							value={newTag}
							placeholder="输入标签（支持中英文搜索）..."
							class="w-full"
							oninput={handleInputChange}
							onkeydown={handleKeydown}
							onfocus={() => { if (newTag.trim()) searchSuggestions(newTag); }}
							onblur={() => { setTimeout(() => { showSuggestions = false; }, 200); }}
						/>
						<!-- 建议列表 -->
						{#if showSuggestions && suggestions.length > 0}
							<div class="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
								{#each suggestions as suggestion, index}
									<button
										type="button"
										class="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 {index === selectedSuggestionIndex ? 'bg-accent' : ''}"
										onmousedown={() => selectSuggestion(suggestion)}
									>
										<span class="text-xs px-1.5 py-0.5 rounded {getNamespaceColor(suggestion.namespace)}">
											{suggestion.namespace}
										</span>
										<span class="font-medium">{suggestion.tag}</span>
										{#if suggestion.translated !== suggestion.tag}
											<span class="text-muted-foreground">({suggestion.translated})</span>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
					<Button variant="outline" size="icon" onclick={handleAddTag}>
						<Plus class="h-4 w-4" />
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">输入中文或英文标签名，会显示匹配建议</p>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={handleClose}>关闭</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
