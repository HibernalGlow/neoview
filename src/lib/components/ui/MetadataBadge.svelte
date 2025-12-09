<script lang="ts">
	/**
	 * MetadataBadge - 文件元数据标签组件
	 * 用于显示文件大小、日期、进度等元数据信息
	 * 样式与 EMM 标签 (TagChip) 区分：
	 * - 使用 muted 色调而非彩色
	 * - 使用方形圆角而非圆点装饰
	 * - 支持图标 + 文字组合
	 */
	import type { Component } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	type IconComponent = Component<{ class?: string }>;

	interface Props {
		/** 显示的文本 */
		text: string;
		/** 可选的图标组件 */
		icon?: IconComponent;
		/** 提示文本 */
		tooltip?: string;
		/** 尺寸变体 */
		size?: 'xs' | 'sm' | 'md';
		/** 颜色变体 */
		variant?: 'muted' | 'primary' | 'secondary' | 'accent' | 'destructive';
	}

	let {
		text,
		icon,
		tooltip,
		size = 'sm',
		variant = 'muted'
	}: Props = $props();

	// 尺寸样式映射
	const sizeClasses = {
		xs: 'text-[10px] px-1 py-0.5 gap-0.5',
		sm: 'text-xs px-1.5 py-0.5 gap-1',
		md: 'text-sm px-2 py-1 gap-1.5'
	};

	// 图标尺寸映射
	const iconSizes = {
		xs: 'h-2.5 w-2.5',
		sm: 'h-3 w-3',
		md: 'h-3.5 w-3.5'
	};

	// 颜色变体样式映射 - 使用主题色系
	const variantClasses = {
		muted: 'bg-muted/60 text-muted-foreground border-muted-foreground/20',
		primary: 'bg-primary/10 text-primary border-primary/30',
		secondary: 'bg-secondary text-secondary-foreground border-secondary-foreground/20',
		accent: 'bg-accent text-accent-foreground border-accent-foreground/20',
		destructive: 'bg-destructive/10 text-destructive border-destructive/30'
	};

	const sizeClass = $derived(sizeClasses[size]);
	const iconSize = $derived(iconSizes[size]);
	const variantClass = $derived(variantClasses[variant]);
</script>

{#if tooltip}
	<Tooltip.Root>
		<Tooltip.Trigger>
			<span
				class="metadata-badge inline-flex items-center rounded-md border font-medium {sizeClass} {variantClass}"
			>
				{#if icon}
					<svelte:component this={icon} class={iconSize} />
				{/if}
				<span>{text}</span>
			</span>
		</Tooltip.Trigger>
		<Tooltip.Content><p>{tooltip}</p></Tooltip.Content>
	</Tooltip.Root>
{:else}
	<span
		class="metadata-badge inline-flex items-center rounded-md border font-medium {sizeClass} {variantClass}"
	>
		{#if icon}
			<svelte:component this={icon} class={iconSize} />
		{/if}
		<span>{text}</span>
	</span>
{/if}
