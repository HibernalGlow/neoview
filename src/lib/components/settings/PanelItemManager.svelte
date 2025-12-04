<script lang="ts">
/**
 * PanelItemManager - 通用面板项管理器
 * 从 SidebarPanelManager 提取的可复用组件
 * 支持拖拽排序、显示/隐藏、位置切换等功能
 */
import { Button } from '$lib/components/ui/button';
import { GripVertical, Eye, EyeOff, ArrowLeft, ArrowRight, RotateCcw, ChevronDown, ChevronRight } from '@lucide/svelte';
import type { Component } from 'svelte';

// 通用项目接口
export interface ManagedItem {
	id: string;
	title: string;
	icon?: Component;
	order: number;
	visible: boolean;
	canHide: boolean;
	canMove: boolean;
	// 可选：位置（用于边栏管理）
	position?: 'left' | 'right';
	// 可选：展开状态（用于卡片管理）
	expanded?: boolean;
}

interface Props {
	items: ManagedItem[];
	title: string;
	description?: string;
	// 位置模式：显示左右切换按钮
	showPositionSwitch?: boolean;
	// 展开模式：显示展开/收起按钮
	showExpandSwitch?: boolean;
	// 回调
	onMove?: (id: string, targetOrder: number) => void;
	onVisibilityChange?: (id: string, visible: boolean) => void;
	onPositionChange?: (id: string, position: 'left' | 'right') => void;
	onExpandChange?: (id: string, expanded: boolean) => void;
	onReset?: () => void;
}

let {
	items,
	title,
	description = '',
	showPositionSwitch = false,
	showExpandSwitch = false,
	onMove,
	onVisibilityChange,
	onPositionChange,
	onExpandChange,
	onReset
}: Props = $props();

// 拖拽状态
let draggedId: string | null = $state(null);
let dragOverId: string | null = $state(null);

// 排序后的项目
const sortedItems = $derived([...items].sort((a, b) => a.order - b.order));

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

function toggleVisibility(id: string, current: boolean) {
	onVisibilityChange?.(id, !current);
}

function changePosition(id: string, pos: 'left' | 'right') {
	onPositionChange?.(id, pos);
}

function toggleExpanded(id: string, current: boolean) {
	onExpandChange?.(id, !current);
}
</script>

<div class="panel-item-manager space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">{title}</h3>
		{#if onReset}
			<Button variant="outline" size="sm" onclick={onReset}>
				<RotateCcw class="mr-2 h-4 w-4" />
				重置
			</Button>
		{/if}
	</div>
	
	{#if description}
		<p class="text-sm text-muted-foreground">{description}</p>
	{/if}
	
	<div class="space-y-2">
		{#each sortedItems as item (item.id)}
			<div
				class="flex items-center gap-3 rounded-lg border p-3 transition-colors {dragOverId === item.id ? 'border-primary bg-accent' : 'bg-card'} {draggedId === item.id ? 'opacity-50' : ''} {!item.visible ? 'opacity-60' : ''}"
				draggable={item.canMove}
				ondragstart={(e) => handleDragStart(e, item.id)}
				ondragover={(e) => handleDragOver(e, item.id)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, item.id)}
				ondragend={handleDragEnd}
				role="listitem"
			>
				<!-- 拖拽手柄 -->
				{#if item.canMove}
					<GripVertical class="h-5 w-5 cursor-grab text-muted-foreground" />
				{:else}
					<div class="w-5"></div>
				{/if}
				
				<!-- 图标和标题 -->
				<div class="flex flex-1 items-center gap-2">
					{#if item.icon}
						{@const Icon = item.icon}
						<Icon class="h-5 w-5 text-muted-foreground" />
					{/if}
					<span class="font-medium">{item.title}</span>
					{#if showPositionSwitch && item.position}
						<span class="text-xs text-muted-foreground">
							({item.position === 'left' ? '左侧' : '右侧'})
						</span>
					{/if}
					{#if showExpandSwitch && item.expanded !== undefined}
						<span class="text-xs text-muted-foreground">
							({item.expanded ? '展开' : '收起'})
						</span>
					{/if}
				</div>
				
				<!-- 位置切换（边栏模式） -->
				{#if showPositionSwitch && item.canMove && item.position}
					<div class="flex items-center gap-1">
						<Button
							variant={item.position === 'left' ? 'default' : 'ghost'}
							size="icon"
							class="h-7 w-7"
							onclick={() => changePosition(item.id, 'left')}
							title="移到左侧"
						>
							<ArrowLeft class="h-4 w-4" />
						</Button>
						<Button
							variant={item.position === 'right' ? 'default' : 'ghost'}
							size="icon"
							class="h-7 w-7"
							onclick={() => changePosition(item.id, 'right')}
							title="移到右侧"
						>
							<ArrowRight class="h-4 w-4" />
						</Button>
					</div>
				{/if}
				
				<!-- 展开/收起切换（卡片模式） -->
				{#if showExpandSwitch && item.expanded !== undefined}
					<Button
						variant={item.expanded ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7"
						onclick={() => toggleExpanded(item.id, item.expanded ?? false)}
						title={item.expanded ? '收起' : '展开'}
					>
						{#if item.expanded}
							<ChevronDown class="h-4 w-4" />
						{:else}
							<ChevronRight class="h-4 w-4" />
						{/if}
					</Button>
				{/if}
				
				<!-- 显示/隐藏开关 -->
				{#if item.canHide}
					<Button
						variant="ghost"
						size="icon"
						class="h-8 w-8"
						onclick={() => toggleVisibility(item.id, item.visible)}
						title={item.visible ? '隐藏' : '显示'}
					>
						{#if item.visible}
							<Eye class="h-4 w-4" />
						{:else}
							<EyeOff class="h-4 w-4 text-muted-foreground" />
						{/if}
					</Button>
				{:else}
					<div class="h-8 w-8 flex items-center justify-center" title="不可隐藏">
						<Eye class="h-4 w-4 text-muted-foreground/50" />
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
