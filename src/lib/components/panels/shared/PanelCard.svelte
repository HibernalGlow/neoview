<script lang="ts">
	/**
	 * PanelCard - 通用面板卡片组件
	 * 统一的折叠/展开、排序、悬停高亮样式
	 */
	import { ChevronUp, ChevronDown, ArrowUp, ArrowDown } from '@lucide/svelte';

	interface Props {
		/** 卡片标题 */
		title: string;
		/** 标题图标（通过 snippet 传入） */
		icon?: import('svelte').Snippet;
		/** 是否展开 */
		expanded?: boolean;
		/** 排序顺序 */
		order?: number;
		/** 是否可上移 */
		canMoveUp?: boolean;
		/** 是否可下移 */
		canMoveDown?: boolean;
		/** 是否显示排序按钮 */
		showSortButtons?: boolean;
		/** 是否显示折叠按钮 */
		showCollapseButton?: boolean;
		/** 右侧额外内容（如开关）*/
		headerExtra?: import('svelte').Snippet;
		/** 主内容 */
		children: import('svelte').Snippet;
		/** 折叠切换回调 */
		onToggle?: () => void;
		/** 上移回调 */
		onMoveUp?: () => void;
		/** 下移回调 */
		onMoveDown?: () => void;
	}

	let {
		title,
		icon,
		expanded = true,
		order = 0,
		canMoveUp = false,
		canMoveDown = false,
		showSortButtons = true,
		showCollapseButton = true,
		headerExtra,
		children,
		onToggle,
		onMoveUp,
		onMoveDown
	}: Props = $props();

	let isHovered = $state(false);
</script>

<div
	class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all {isHovered ? 'border-primary/60' : ''}"
	style={order !== undefined ? `order: ${order}` : ''}
	onmouseenter={() => (isHovered = true)}
	onmouseleave={() => (isHovered = false)}
	role="region"
	aria-label={title}
>
	<!-- 头部 -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2 font-semibold text-sm">
			{#if icon}
				{@render icon()}
			{/if}
			<span>{title}</span>
		</div>
		<div class="flex items-center gap-2">
			{#if headerExtra}
				{@render headerExtra()}
			{/if}
			<div class="flex items-center gap-1 text-[10px]">
				{#if showCollapseButton}
					<button
						type="button"
						class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
						onclick={onToggle}
						title={expanded ? '收起' : '展开'}
					>
						{#if expanded}
							<ChevronUp class="h-3 w-3" />
						{:else}
							<ChevronDown class="h-3 w-3" />
						{/if}
					</button>
				{/if}
				{#if showSortButtons}
					<button
						type="button"
						class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
						onclick={onMoveUp}
						disabled={!canMoveUp}
						title="上移"
					>
						<ArrowUp class="h-3 w-3" />
					</button>
					<button
						type="button"
						class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
						onclick={onMoveDown}
						disabled={!canMoveDown}
						title="下移"
					>
						<ArrowDown class="h-3 w-3" />
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- 内容区域 -->
	{#if expanded}
		{@render children()}
	{/if}
</div>
