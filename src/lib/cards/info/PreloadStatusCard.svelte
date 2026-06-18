<script lang="ts">
	import { onMount } from 'svelte';

	import { bookStore } from '$lib/stores/book/core.svelte';
	import {
		formatMemorySize,
		getCacheStatus,
		getMemoryStats,
		type MemoryPoolStats
	} from '$lib/api/pageManager';

	interface PageCacheStatus {
		page: number;
		cached: boolean;
		isCurrent: boolean;
	}

	const totalPages = $derived(bookStore.totalPages);
	const currentPageIndex = $derived(bookStore.currentPageIndex);

	let memoryStats = $state<MemoryPoolStats | null>(null);
	let nearbyPages = $state<PageCacheStatus[]>([]);
	let isRefreshing = $state(false);
	let errorMessage = $state<string | null>(null);
	let refreshToken = 0;

	function buildStatuses(startPage: number, statuses: boolean[]): PageCacheStatus[] {
		return statuses.map((cached, offset) => {
			const page = startPage + offset;
			return {
				page,
				cached,
				isCurrent: page === currentPageIndex
			};
		});
	}

	async function refreshPreloadStatus(): Promise<void> {
		const token = ++refreshToken;
		const total = totalPages;
		const current = currentPageIndex;

		if (total <= 0) {
			memoryStats = null;
			nearbyPages = [];
			errorMessage = null;
			return;
		}

		const behind = 3;
		const ahead = 5;
		const startPage = Math.max(0, current - behind);
		const endPage = Math.min(total - 1, current + ahead);
		const count = endPage - startPage + 1;

		isRefreshing = true;
		try {
			const [memory, statuses] = await Promise.all([
				getMemoryStats(),
				getCacheStatus(startPage, count)
			]);

			if (token !== refreshToken) return;
			memoryStats = memory;
			nearbyPages = buildStatuses(startPage, statuses);
			errorMessage = null;
		} catch (err) {
			if (token !== refreshToken) return;
			errorMessage = String(err);
		} finally {
			if (token === refreshToken) {
				isRefreshing = false;
			}
		}
	}

	$effect(() => {
		currentPageIndex;
		totalPages;
		void refreshPreloadStatus();
	});

	onMount(() => {
		const timer = window.setInterval(() => {
			void refreshPreloadStatus();
		}, 2000);

		return () => {
			window.clearInterval(timer);
		};
	});
</script>

<div class="space-y-3 text-xs">
	<div class="grid grid-cols-2 gap-2">
		<div class="rounded border border-border/60 bg-muted/20 p-2">
			<div class="text-[10px] text-muted-foreground">当前页</div>
			<div class="mt-1 font-medium">{totalPages > 0 ? currentPageIndex + 1 : 0} / {totalPages}</div>
		</div>
		<div class="rounded border border-border/60 bg-muted/20 p-2">
			<div class="text-[10px] text-muted-foreground">内存池</div>
			<div class="mt-1 font-medium">
				{#if memoryStats}
					{memoryStats.entryCount} 项
				{:else}
					--
				{/if}
			</div>
		</div>
	</div>

	{#if memoryStats}
		<div class="space-y-1.5">
			<div class="flex items-center justify-between text-[10px] text-muted-foreground">
				<span>{formatMemorySize(memoryStats.totalSize)} / {formatMemorySize(memoryStats.maxSize)}</span>
				<span>{memoryStats.usagePercent.toFixed(1)}%</span>
			</div>
			<div class="h-1.5 overflow-hidden rounded bg-muted">
				<div
					class="h-full rounded bg-primary transition-[width]"
					style={`width: ${Math.min(100, Math.max(0, memoryStats.usagePercent))}%`}
				></div>
			</div>
		</div>
	{/if}

	<div class="space-y-1.5">
		<div class="flex items-center justify-between">
			<span class="text-[10px] text-muted-foreground">附近页缓存</span>
			<span class="text-[10px] text-muted-foreground">{isRefreshing ? '刷新中' : '已同步'}</span>
		</div>
		<div class="grid grid-cols-3 gap-1.5">
			{#each nearbyPages as item (item.page)}
				<div
					class={[
						'rounded border px-2 py-1 text-center',
						item.isCurrent
							? 'border-primary bg-primary/10 text-primary'
							: item.cached
								? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
								: 'border-border/60 bg-muted/20 text-muted-foreground'
					]}
				>
					<span class="block text-[10px]">P{item.page + 1}</span>
					<span class="block text-[9px]">{item.cached ? 'cached' : 'cold'}</span>
				</div>
			{/each}
		</div>
	</div>

	{#if errorMessage}
		<div class="rounded border border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive">
			{errorMessage}
		</div>
	{/if}
</div>
