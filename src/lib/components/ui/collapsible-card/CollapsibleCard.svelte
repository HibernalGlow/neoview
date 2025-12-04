<script lang="ts">
	/**
	 * 通用可折叠卡片组件
	 * 支持：
	 * - 展开/收起状态
	 * - 卡片排序
	 * - localStorage 持久化
	 * - 自定义图标和颜色
	 */
	import { ChevronUp, ChevronDown, ArrowUp, ArrowDown } from '@lucide/svelte';
	import type { Component } from 'svelte';

	interface Props {
		/** 卡片唯一标识 */
		id: string;
		/** 卡片标题 */
		title: string;
		/** 图标组件 */
		icon?: Component;
		/** 图标颜色类名 */
		iconColor?: string;
		/** 是否展开 */
		expanded?: boolean;
		/** 排序顺序 */
		order?: number;
		/** 是否可以向上移动 */
		canMoveUp?: boolean;
		/** 是否可以向下移动 */
		canMoveDown?: boolean;
		/** 展开状态变化回调 */
		onExpandedChange?: (expanded: boolean) => void;
		/** 移动卡片回调 */
		onMove?: (direction: 'up' | 'down') => void;
		/** 子内容 */
		children?: import('svelte').Snippet;
	}

	let {
		id,
		title,
		icon: Icon,
		iconColor = 'text-blue-500',
		expanded = $bindable(true),
		order = 0,
		canMoveUp = false,
		canMoveDown = false,
		onExpandedChange,
		onMove,
		children
	}: Props = $props();

	function toggleExpanded() {
		expanded = !expanded;
		onExpandedChange?.(expanded);
	}

	function handleMove(direction: 'up' | 'down') {
		onMove?.(direction);
	}
</script>

<div
	class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
	style:order={order}
>
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			{#if Icon}
				<Icon class="h-4 w-4 {iconColor}" />
			{/if}
			<div class="font-semibold text-sm">{title}</div>
		</div>
		<div class="flex items-center gap-1 text-[10px]">
			<button
				type="button"
				class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
				onclick={toggleExpanded}
				title={expanded ? '收起' : '展开'}
			>
				{#if expanded}
					<ChevronUp class="h-3 w-3" />
				{:else}
					<ChevronDown class="h-3 w-3" />
				{/if}
			</button>
			{#if onMove}
				<button
					type="button"
					class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
					onclick={() => handleMove('up')}
					disabled={!canMoveUp}
				>
					<ArrowUp class="h-3 w-3" />
				</button>
				<button
					type="button"
					class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
					onclick={() => handleMove('down')}
					disabled={!canMoveDown}
				>
					<ArrowDown class="h-3 w-3" />
				</button>
			{/if}
		</div>
	</div>

	{#if expanded}
		<div class="space-y-3">
			{@render children?.()}
		</div>
	{/if}
</div>
