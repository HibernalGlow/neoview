<script lang="ts">
	/**
	 * TagChip - 共用的标签显示组件
	 * 用于 FavoriteTagPanel、FileItemCard 等地方
	 */
	import { X } from '@lucide/svelte';
	import { categoryColors } from '$lib/stores/emm/favoriteTagStore.svelte';

	interface Props {
		tag: string;
		category?: string;
		display: string;
		color?: string;
		isCollect?: boolean;
		isMixedVariant?: boolean;
		size?: 'sm' | 'md';
		showRemove?: boolean;
		onClick?: () => void;
		onRemove?: () => void;
		onContextMenu?: (e: MouseEvent) => void;
	}

	let {
		tag,
		category = '',
		display,
		color,
		isCollect = false,
		isMixedVariant = false,
		size = 'sm',
		showRemove = false,
		onClick,
		onRemove,
		onContextMenu
	}: Props = $props();

	// 获取标签颜色
	const tagColor = $derived(color || categoryColors[category] || '#666');
	
	// 尺寸类名
	const sizeClass = $derived(size === 'sm' ? 'text-[10px] px-1 py-0.5' : 'text-xs px-1.5 py-0.5');
</script>

{#if onClick}
	<span
		role="button"
		tabindex="0"
		class="tag-chip inline-flex items-center gap-0.5 rounded border transition-all hover:-translate-y-0.5 cursor-pointer {sizeClass} {isMixedVariant ? 'border-dashed opacity-70' : ''} {isCollect ? 'font-semibold' : ''}"
		style="
			border-color: {tagColor};
			background: color-mix(in srgb, {tagColor} {isMixedVariant ? '6%' : isCollect ? '15%' : '8%'}, transparent);
			color: {isCollect ? tagColor : 'inherit'};
		"
		onclick={onClick}
		onkeydown={(e) => e.key === 'Enter' && onClick?.()}
		oncontextmenu={onContextMenu}
		title={isMixedVariant ? `混合匹配 - ${tag}` : tag}
	>
		<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {tagColor}"></span>
		<span>{display}</span>
		{#if showRemove && onRemove}
			<button
				type="button"
				class="ml-0.5 hover:bg-accent rounded p-0.5"
				onclick={(e) => { e.stopPropagation(); onRemove?.(); }}
				title="移除"
			>
				<X class="h-2.5 w-2.5" />
			</button>
		{/if}
	</span>
{:else}
	<span
		class="tag-chip inline-flex items-center gap-0.5 rounded border {sizeClass} {isMixedVariant ? 'border-dashed opacity-70' : ''} {isCollect ? 'font-semibold' : ''}"
		style="
			border-color: {tagColor};
			background: color-mix(in srgb, {tagColor} {isMixedVariant ? '6%' : isCollect ? '15%' : '8%'}, transparent);
			color: {isCollect ? tagColor : 'inherit'};
		"
		title={isMixedVariant ? `混合匹配 - ${tag}` : tag}
	>
		<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {tagColor}"></span>
		<span>{display}</span>
	</span>
{/if}
