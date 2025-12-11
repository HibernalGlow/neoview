<script lang="ts">
/**
 * ManualTagEditor - 手动标签编辑器
 * 用于添加/编辑/删除手动标签
 */
import { createEventDispatcher } from 'svelte';
import { X, Plus, Tag, Trash2 } from '@lucide/svelte';
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
					<Input
						bind:value={newTag}
						placeholder="输入标签..."
						class="flex-1"
						onkeydown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
					/>
					<Button variant="outline" size="icon" onclick={handleAddTag}>
						<Plus class="h-4 w-4" />
					</Button>
				</div>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={handleClose}>关闭</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
