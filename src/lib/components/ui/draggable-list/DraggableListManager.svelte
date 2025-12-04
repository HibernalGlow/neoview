<script lang="ts">
/**
 * DraggableListManager - 通用可拖拽列表管理器
 * 参考 SidebarPanelManager 的拖拽实现
 */
import { Button } from '$lib/components/ui/button';
import { GripVertical, Eye, EyeOff, ChevronDown, ChevronRight, ArrowUp, ArrowDown } from '@lucide/svelte';
import type { Component } from 'svelte';

interface ListItem {
	id: string;
	title: string;
	icon?: Component;
	order: number;
	visible: boolean;
	expanded?: boolean;
	canHide: boolean;
}

interface Props {
	items: ListItem[];
	showExpand?: boolean;
	onMove?: (id: string, newOrder: number) => void;
	onVisibilityChange?: (id: string, visible: boolean) => void;
	onExpandChange?: (id: string, expanded: boolean) => void;
}

let {
	items,
	showExpand = true,
	onMove,
	onVisibilityChange,
	onExpandChange
}: Props = $props();

// 拖拽状态
let draggedId: string | null = $state(null);
let dragOverId: string | null = $state(null);

function handleDragStart(e: DragEvent, id: string) {
	draggedId = id;
	if (e.dataTransfer) {
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', id);
	}
}

function handleDragOver(e: DragEvent, id: string) {
	e.preventDefault();
	if (draggedId && draggedId !== id) {
		dragOverId = id;
	}
}

function handleDragLeave() {
	dragOverId = null;
}

function handleDrop(e: DragEvent, targetId: string) {
	e.preventDefault();
	if (!draggedId || draggedId === targetId) return;
	
	const target = items.find(i => i.id === targetId);
	if (target && onMove) {
		onMove(draggedId, target.order);
	}
	
	draggedId = null;
	dragOverId = null;
}

function handleDragEnd() {
	draggedId = null;
	dragOverId = null;
}

function moveUp(item: ListItem) {
	if (item.order > 0 && onMove) {
		onMove(item.id, item.order - 1);
	}
}

function moveDown(item: ListItem) {
	const maxOrder = items.length - 1;
	if (item.order < maxOrder && onMove) {
		onMove(item.id, item.order + 1);
	}
}

function toggleVisibility(item: ListItem) {
	if (item.canHide && onVisibilityChange) {
		onVisibilityChange(item.id, !item.visible);
	}
}

function toggleExpanded(item: ListItem) {
	if (onExpandChange && item.expanded !== undefined) {
		onExpandChange(item.id, !item.expanded);
	}
}

const sortedItems = $derived([...items].sort((a, b) => a.order - b.order));
</script>

<div class="space-y-2">
	{#each sortedItems as item (item.id)}
		<div
			class="flex items-center gap-3 rounded-lg border p-3 transition-colors
				{dragOverId === item.id ? 'border-primary bg-accent' : 'bg-card'}
				{draggedId === item.id ? 'opacity-50' : ''}
				{!item.visible ? 'opacity-60' : ''}"
			draggable="true"
			ondragstart={(e) => handleDragStart(e, item.id)}
			ondragover={(e) => handleDragOver(e, item.id)}
			ondragleave={handleDragLeave}
			ondrop={(e) => handleDrop(e, item.id)}
			ondragend={handleDragEnd}
			role="listitem"
		>
			<!-- 拖拽手柄 -->
			<GripVertical class="h-5 w-5 cursor-grab text-muted-foreground" />
			
			<!-- 图标和标题 -->
			<div class="flex flex-1 items-center gap-2">
				{#if item.icon}
					{@const Icon = item.icon}
					<Icon class="h-5 w-5 text-muted-foreground" />
				{/if}
				<span class="font-medium">{item.title}</span>
				<span class="text-xs text-muted-foreground">#{item.order + 1}</span>
			</div>
			
			<!-- 上移/下移 -->
			<div class="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					onclick={() => moveUp(item)}
					disabled={item.order === 0}
					title="上移"
				>
					<ArrowUp class="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					onclick={() => moveDown(item)}
					disabled={item.order === sortedItems.length - 1}
					title="下移"
				>
					<ArrowDown class="h-4 w-4" />
				</Button>
			</div>
			
			<!-- 展开/收起 -->
			{#if showExpand && item.expanded !== undefined}
				<Button
					variant="ghost"
					size="icon"
					class="h-8 w-8"
					onclick={() => toggleExpanded(item)}
					title={item.expanded ? '收起' : '展开'}
				>
					{#if item.expanded}
						<ChevronDown class="h-4 w-4" />
					{:else}
						<ChevronRight class="h-4 w-4 text-muted-foreground" />
					{/if}
				</Button>
			{/if}
			
			<!-- 显示/隐藏 -->
			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8"
				onclick={() => toggleVisibility(item)}
				disabled={!item.canHide}
				title={item.visible ? '隐藏' : '显示'}
			>
				{#if item.visible}
					<Eye class="h-4 w-4" />
				{:else}
					<EyeOff class="h-4 w-4 text-muted-foreground" />
				{/if}
			</Button>
		</div>
	{/each}
</div>
