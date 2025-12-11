<script lang="ts">
/**
 * FavoriteTagPanel - 收藏标签快选面板
 * 直接渲染 FavoriteTagsCard 组件，点击标签添加到搜索
 */
import { X, Lock, Unlock, Star } from '@lucide/svelte';
import FavoriteTagsCard from '$lib/cards/properties/FavoriteTagsCard.svelte';
import type { FavoriteTag } from '$lib/stores/emm/favoriteTagStore.svelte';

interface Props {
	visible: boolean;
	onClose: () => void;
	onAppendTag: (tag: FavoriteTag, modifier?: string) => void;
}

let {
	visible,
	onClose,
	onAppendTag
}: Props = $props();

let isPinned = $state(false);
let panelHeight = $state(300);
let isResizing = $state(false);
let startY = $state(0);
let startHeight = $state(0);

function togglePin() {
	isPinned = !isPinned;
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
	panelHeight = Math.max(150, Math.min(500, startHeight + deltaY));
}

function stopResize() {
	isResizing = false;
	document.removeEventListener('mousemove', handleResize);
	document.removeEventListener('mouseup', stopResize);
}

// 处理标签点击
function handleTagClick(tag: FavoriteTag, modifier?: string) {
	onAppendTag(tag, modifier);
}
</script>

{#if visible}
	<div 
		class="favorite-tag-panel absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover/80 backdrop-blur-md shadow-lg"
		style="height: {panelHeight}px; max-height: 500px; min-height: 150px;"
	>
		<!-- 头部 -->
		<div class="flex items-center justify-between gap-2 border-b px-3 py-2">
			<div class="flex items-center gap-2">
				<Star class="h-4 w-4 text-yellow-500" />
				<span class="text-sm font-medium">收藏标签快选</span>
			</div>
			<div class="flex items-center gap-2">
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

		<!-- 内容区：直接渲染 FavoriteTagsCard -->
		<div class="flex-1 overflow-y-auto p-3" style="height: calc(100% - 44px);">
			<FavoriteTagsCard 
				interactive={true}
				onTagClick={handleTagClick}
			/>
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
