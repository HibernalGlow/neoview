<script lang="ts">
	/**
	 * NeoView - Management Item Card
	 * 用于管理面板和卡片的精致小卡片
	 */
	import type { Component, Snippet } from 'svelte';
	import { GripVertical, MoreHorizontal, ArrowUp, ArrowDown, EyeOff, MapPin } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';

	interface Props {
		id: string;
		title: string;
		icon?: Component;
		subtitle?: string;
		status: string;
		statusColor?: 'default' | 'secondary' | 'destructive' | 'outline';
		isFirst?: boolean;
		isLast?: boolean;
		onMoveUp?: () => void;
		onMoveDown?: () => void;
		onAssign?: (target: string) => void;
		onToggleVisible?: () => void;
		active?: boolean;
		draggable?: boolean;
		onPointerDown?: (e: PointerEvent) => void;
		assignOptions?: Snippet;
	}

	let {
		id,
		title,
		icon: Icon,
		subtitle,
		status,
		statusColor = 'secondary',
		isFirst = false,
		isLast = false,
		onMoveUp,
		onMoveDown,
		onAssign,
		onToggleVisible,
		active = false,
		draggable = true,
		onPointerDown,
		assignOptions
	}: Props = $props();
</script>

<div
	class={cn(
		"group relative flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-md",
		active && "border-primary ring-1 ring-primary/20",
		!active && "hover:border-primary/50"
	)}
>
	<!-- 拖拽手柄 -->
	{#if draggable}
		<div
			class="cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground active:cursor-grabbing"
			onpointerdown={onPointerDown}
		>
			<GripVertical class="h-5 w-5" />
		</div>
	{/if}

	<!-- 图标 -->
	<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
		{#if Icon}
			<Icon class="h-5 w-5" />
		{:else}
			<MapPin class="h-5 w-5" />
		{/if}
	</div>

	<!-- 内容 -->
	<div class="flex-1 min-w-0">
		<div class="flex items-center gap-2">
			<span class="truncate font-medium">{title}</span>
			<Badge variant={statusColor} class="h-5 px-1.5 text-[10px] uppercase tracking-wider">
				{status}
			</Badge>
		</div>
		{#if subtitle}
			<p class="truncate text-xs text-muted-foreground">{subtitle}</p>
		{/if}
	</div>

	<!-- 操作区 -->
	<div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
		<div class="flex flex-col">
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				disabled={isFirst}
				onclick={onMoveUp}
				title="上移"
			>
				<ArrowUp class="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				disabled={isLast}
				onclick={onMoveDown}
				title="下移"
			>
				<ArrowDown class="h-3.5 w-3.5" />
			</Button>
		</div>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				{#snippet children({ props })}
					<Button {...props} variant="ghost" size="icon" class="h-8 w-8">
						<MoreHorizontal class="h-4 w-4" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				{#if assignOptions}
					<DropdownMenu.Group>
						<DropdownMenu.Label>分配到...</DropdownMenu.Label>
						{@render assignOptions()}
					</DropdownMenu.Group>
					<DropdownMenu.Separator />
				{/if}
				{#if onToggleVisible}
					<DropdownMenu.Item onclick={onToggleVisible}>
						{#if status === 'HIDDEN' || status === '已隐藏'}
							<MapPin class="mr-2 h-4 w-4" />
							<span>显示</span>
						{:else}
							<EyeOff class="mr-2 h-4 w-4" />
							<span>隐藏</span>
						{/if}
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
