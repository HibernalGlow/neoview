<script lang="ts">
	/**
	 * FolderRatingBadge - 文件夹评分徽章组件
	 * 支持显示评分和点击修改评分
	 */
	import { Star } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	interface Props {
		/** 有效评分（手动评分优先，否则平均评分） */
		effectiveRating: number | null;
		/** 手动评分 */
		manualRating: number | null;
		/** 平均评分（来自 EMM 数据库） */
		averageRating: number | null;
		/** 视图模式 */
		size?: 'sm' | 'md';
		/** 设置评分回调 */
		onSetRating?: (rating: number | null) => void;
	}

	let {
		effectiveRating,
		manualRating,
		averageRating,
		size = 'md',
		onSetRating
	}: Props = $props();

	const sizeClasses = {
		sm: {
			badge: 'px-1 py-0.5 text-[10px]',
			star: 'h-2.5 w-2.5',
			input: 'h-6 w-14 text-[10px]',
			button: 'h-6 px-1.5 text-[9px]',
			avgText: 'text-[9px]'
		},
		md: {
			badge: 'px-1.5 py-0.5',
			star: 'h-3 w-3',
			input: 'h-7 w-16 text-xs',
			button: 'h-7 px-2 text-[10px]',
			avgText: 'text-[10px]'
		}
	};

	const classes = $derived(sizeClasses[size]);

	function handleRatingChange(e: Event) {
		const val = parseFloat((e.target as HTMLInputElement).value);
		onSetRating?.(isNaN(val) || val <= 0 ? null : Math.min(10, val));
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger onclick={(e) => e.stopPropagation()}>
		<span class="inline-flex items-center gap-0.5 rounded bg-amber-500/10 {classes.badge} text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-amber-500/20 transition-colors">
			<Star class="{classes.star} {effectiveRating !== null ? 'fill-current' : ''}" />
			{#if effectiveRating !== null}
				<span class="font-medium">{effectiveRating.toFixed(1)}</span>
			{/if}
		</span>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="min-w-0 p-2" onclick={(e) => e.stopPropagation()}>
		<div class="flex items-center gap-2">
			<input
				type="number"
				min="0"
				max="10"
				step="0.1"
				class="rounded border bg-background px-2 text-center {classes.input}"
				value={manualRating ?? ''}
				onchange={handleRatingChange}
				placeholder="评分"
			/>
			<button
				type="button"
				class="rounded hover:bg-accent transition-colors text-muted-foreground {classes.button}"
				onclick={() => onSetRating?.(null)}
			>
				清除
			</button>
		</div>
		{#if averageRating !== null && averageRating > 0}
			<p class="{classes.avgText} text-muted-foreground mt-1.5 text-center">
				平均: {averageRating.toFixed(2)}
			</p>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
