<script lang="ts">
	/**
	 * NeoView - Management List View
	 * 提供搜索、过滤和分组功能的管理列表容器
	 */
	import { Search, Filter, LayoutGrid, List as ListIcon } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { cn } from '$lib/utils';

	interface Props {
		title: string;
		description?: string;
		searchQuery: string;
		onSearchChange: (val: string) => void;
		viewMode: 'grid' | 'list';
		onViewModeChange: (mode: 'grid' | 'list') => void;
		children: any;
		actions?: any;
	}

	let {
		title,
		description,
		searchQuery = $bindable(),
		onSearchChange,
		viewMode = 'grid',
		onViewModeChange,
		children,
		actions
	}: Props = $props();

	function handleSearch(e: Event) {
		const val = (e.target as HTMLInputElement).value;
		searchQuery = val;
		onSearchChange?.(val);
	}
</script>

<div class="flex flex-col gap-6 p-1">
	<!-- 头部：标题和描述 -->
	<div class="flex flex-col gap-1.5">
		<h3 class="text-xl font-bold tracking-tight">{title}</h3>
		{#if description}
			<p class="text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>

	<!-- 工具栏：搜索、视图切换和操作 -->
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex flex-1 min-w-[240px] items-center gap-2">
			<div class="relative w-full max-w-sm">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={searchQuery}
					oninput={handleSearch}
					placeholder="搜索..."
					class="pl-9 h-10 rounded-xl"
				/>
			</div>
			<div class="flex items-center rounded-xl border bg-muted/30 p-1">
				<Button
					variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
					size="icon"
					class="h-8 w-8 rounded-lg"
					onclick={() => onViewModeChange('grid')}
				>
					<LayoutGrid class="h-4 w-4" />
				</Button>
				<Button
					variant={viewMode === 'list' ? 'secondary' : 'ghost'}
					size="icon"
					class="h-8 w-8 rounded-lg"
					onclick={() => onViewModeChange('list')}
				>
					<ListIcon class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<div class="flex items-center gap-2">
			{@render actions?.()}
		</div>
	</div>

	<!-- 内容区域 -->
	<div class={cn(
		"grid gap-4",
		viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
	)}>
		{@render children?.()}
	</div>
</div>
