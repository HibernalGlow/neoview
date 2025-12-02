<script lang="ts">
/**
 * FavoriteTagPanel - 收藏标签快选面板
 * 显示用户收藏的 EMM 标签，支持点击添加到搜索
 * 参考 exhentai-manga-manager 的 SearchAgilePanel
 */
import { X, Lock, Unlock, Star } from '@lucide/svelte';
import { favoriteTagStore, categoryColors, type FavoriteTag } from '$lib/stores/emm/favoriteTagStore.svelte';

interface Props {
	visible: boolean;
	enableMixed?: boolean;
	onClose: () => void;
	onAppendTag: (tag: FavoriteTag, modifier?: string) => void;
	onUpdateEnableMixed?: (value: boolean) => void;
}

let {
	visible,
	enableMixed = false,
	onClose,
	onAppendTag,
	onUpdateEnableMixed
}: Props = $props();

let isPinned = $state(false);
let panelHeight = $state(240);
let isResizing = $state(false);
let startY = $state(0);
let startHeight = $state(0);

// 分组后的标签
const groupedTags = $derived(favoriteTagStore.groupedTags);

function handleTagClick(tag: FavoriteTag, event: MouseEvent) {
	event.preventDefault();
	event.stopPropagation();
	onAppendTag(tag, '');
}

function handleTagContextMenu(tag: FavoriteTag, event: MouseEvent) {
	event.preventDefault();
	event.stopPropagation();
	// 右键点击添加排除标签
	onAppendTag(tag, '-');
}

function togglePin() {
	isPinned = !isPinned;
}

function toggleMixed() {
	onUpdateEnableMixed?.(!enableMixed);
}

function startResize(event: MouseEvent) {
	isResizing = true;
	startY = event.clientY;
	startHeight = panelHeight;
	
	document.addEventListener('mousemove', handleResize);
	document.addEventListener('mouseup', stopResize);
	event.preventDefault();
}

function handleResize(event: MouseEvent) {
	if (!isResizing) return;
	const deltaY = event.clientY - startY;
	panelHeight = Math.max(120, Math.min(500, startHeight + deltaY));
}

function stopResize() {
	isResizing = false;
	document.removeEventListener('mousemove', handleResize);
	document.removeEventListener('mouseup', stopResize);
}
</script>

{#if visible}
	<div 
		class="favorite-tag-panel absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover shadow-lg"
		style="height: {panelHeight}px; max-height: 500px; min-height: 120px;"
	>
		<!-- 头部 -->
		<div class="flex items-center justify-between gap-2 border-b px-3 py-2">
			<div class="flex items-center gap-2">
				<Star class="h-4 w-4 text-yellow-500" />
				<span class="text-sm font-medium">收藏标签快选</span>
			</div>
			<div class="flex items-center gap-2">
				<!-- 混合性别开关 -->
				<label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
					<input
						type="checkbox"
						checked={enableMixed}
						onchange={toggleMixed}
						class="h-3.5 w-3.5 rounded accent-primary"
					/>
					<span>混合性别</span>
				</label>
				<!-- 固定按钮 -->
				<button
					class="p-1 rounded hover:bg-accent"
					onclick={togglePin}
					title={isPinned ? '取消固定' : '固定面板'}
				>
					{#if isPinned}
						<Lock class="h-3.5 w-3.5" />
					{:else}
						<Unlock class="h-3.5 w-3.5" />
					{/if}
				</button>
				<!-- 关闭按钮 -->
				<button
					class="p-1 rounded hover:bg-accent"
					onclick={onClose}
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</div>
		</div>

		<!-- 内容区 -->
		<div class="flex-1 overflow-y-auto p-3" style="height: calc(100% - 44px);">
			{#if groupedTags.length === 0}
				<div class="flex flex-col items-center justify-center h-full text-muted-foreground">
					<Star class="h-8 w-8 mb-2 opacity-30" />
					<p class="text-sm">暂无收藏标签</p>
					<p class="text-xs mt-1">在文件详情中收藏标签后，可在此快速选择</p>
				</div>
			{:else}
				{#each groupedTags as category}
					<div class="mb-3">
						<!-- 类别头部 -->
						<div class="flex items-center justify-between mb-1.5 px-2 py-1 rounded bg-muted/50">
							<span class="text-xs font-semibold" style="color: {categoryColors[category.name] || '#666'}">
								{category.name}
							</span>
							<span class="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
								{category.tags.length}
							</span>
						</div>
						<!-- 标签列表 -->
						<div class="flex flex-wrap gap-1.5 pl-1">
							{#each category.tags as tag}
								<button
									class="favorite-tag-chip inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-all hover:-translate-y-0.5"
									style="
										--tag-color: {tag.color};
										border-color: {tag.color};
										background: color-mix(in srgb, {tag.color} 12%, transparent);
									"
									onclick={(e) => handleTagClick(tag, e)}
									oncontextmenu={(e) => handleTagContextMenu(tag, e)}
									title="左键添加，右键排除"
								>
									<span 
										class="w-2 h-2 rounded-full shrink-0"
										style="background-color: {tag.color}"
									></span>
									<span class="font-medium truncate max-w-[100px]">
										{tag.display.split(':')[1]}
									</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- 提示 -->
		<div class="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
			左键点击添加标签，右键点击排除标签
		</div>

		<!-- 拖拽调整大小 -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div 
			class="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-primary/20"
			onmousedown={startResize}
			role="separator"
			aria-orientation="horizontal"
		></div>
	</div>
{/if}

<style>
	.favorite-tag-chip:hover {
		border-color: color-mix(in srgb, var(--tag-color) 80%, transparent);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}
</style>
