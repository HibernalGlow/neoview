<!--
  PipelineDebugNode - 预加载管道调试节点
  
  用于测试和监控预加载管道的性能
-->
<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { bookStore2 } from '$lib/stores/bookStore2';
	import { onMount, onDestroy } from 'svelte';
	
	type $$Props = NodeProps;
	
	let bookState = $derived($bookStore2);
	
	// 统计数据
	let stats = $state({
		imageLoads: 0,
		cacheHits: 0,
		cacheMisses: 0,
		duplicateLoads: 0,
		lastLoadTime: 0,
		avgLoadTime: 0,
		totalLoadTime: 0,
	});
	
	// 加载历史
	let loadHistory = $state<Array<{
		time: string;
		index: number;
		cached: boolean;
		duration: number;
	}>>([]);
	
	// 已加载的索引集合（用于检测重复加载）
	let loadedIndices = new Set<number>();
	
	// 监控预加载事件
	function trackLoad(index: number, cached: boolean, duration: number) {
		const time = new Date().toLocaleTimeString();
		
		stats.imageLoads++;
		stats.totalLoadTime += duration;
		stats.avgLoadTime = stats.totalLoadTime / stats.imageLoads;
		stats.lastLoadTime = duration;
		
		if (cached) {
			stats.cacheHits++;
		} else {
			stats.cacheMisses++;
		}
		
		if (loadedIndices.has(index)) {
			stats.duplicateLoads++;
		} else {
			loadedIndices.add(index);
		}
		
		loadHistory = [
			{ time, index, cached, duration },
			...loadHistory.slice(0, 49)
		];
	}
	
	// 测试加载
	async function testLoad(index: number) {
		const start = performance.now();
		
		// 先检查缓存
		const cached = bookStore2.getImageCache(index);
		if (cached) {
			trackLoad(index, true, performance.now() - start);
			return;
		}
		
		// 请求加载
		const blob = await bookStore2.requestImage(index);
		trackLoad(index, false, performance.now() - start);
	}
	
	// 批量测试
	async function testBatchLoad(count: number) {
		const currentIndex = bookState.currentIndex;
		for (let i = 0; i < count; i++) {
			const index = currentIndex + i;
			if (index < bookState.virtualPageCount) {
				await testLoad(index);
			}
		}
	}
	
	// 清除统计
	function clearStats() {
		stats = {
			imageLoads: 0,
			cacheHits: 0,
			cacheMisses: 0,
			duplicateLoads: 0,
			lastLoadTime: 0,
			avgLoadTime: 0,
			totalLoadTime: 0,
		};
		loadHistory = [];
		loadedIndices.clear();
	}
</script>

<div class="pipeline-debug-node rounded-lg border bg-card p-4 shadow-lg" style="width: 400px;">
	<Handle type="target" position={Position.Left} />
	<Handle type="source" position={Position.Right} />
	
	<div class="mb-3 flex items-center justify-between">
		<h3 class="font-semibold">预加载管道调试</h3>
		<button 
			class="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
			onclick={clearStats}
		>
			清除
		</button>
	</div>
	
	<!-- 状态 -->
	<div class="mb-3 grid grid-cols-2 gap-2 text-xs">
		<div class="rounded bg-muted p-2">
			<div class="text-muted-foreground">书籍状态</div>
			<div class="font-mono">{bookState.isOpen ? '已打开' : '未打开'}</div>
		</div>
		<div class="rounded bg-muted p-2">
			<div class="text-muted-foreground">虚拟页数</div>
			<div class="font-mono">{bookState.virtualPageCount}</div>
		</div>
		<div class="rounded bg-muted p-2">
			<div class="text-muted-foreground">当前页</div>
			<div class="font-mono">{bookState.currentIndex + 1}</div>
		</div>
		<div class="rounded bg-muted p-2">
			<div class="text-muted-foreground">分割模式</div>
			<div class="font-mono">{bookState.divideLandscape ? '开启' : '关闭'}</div>
		</div>
	</div>
	
	<!-- 统计 -->
	<div class="mb-3 rounded border p-2">
		<div class="mb-2 text-xs font-semibold">加载统计</div>
		<div class="grid grid-cols-3 gap-1 text-xs">
			<div class="text-center">
				<div class="text-lg font-bold text-blue-500">{stats.imageLoads}</div>
				<div class="text-muted-foreground">总加载</div>
			</div>
			<div class="text-center">
				<div class="text-lg font-bold text-green-500">{stats.cacheHits}</div>
				<div class="text-muted-foreground">缓存命中</div>
			</div>
			<div class="text-center">
				<div class="text-lg font-bold text-red-500">{stats.duplicateLoads}</div>
				<div class="text-muted-foreground">重复加载</div>
			</div>
		</div>
		<div class="mt-2 grid grid-cols-2 gap-1 text-xs">
			<div>
				<span class="text-muted-foreground">平均耗时:</span>
				<span class="font-mono">{stats.avgLoadTime.toFixed(1)}ms</span>
			</div>
			<div>
				<span class="text-muted-foreground">最后耗时:</span>
				<span class="font-mono">{stats.lastLoadTime.toFixed(1)}ms</span>
			</div>
		</div>
	</div>
	
	<!-- 测试按钮 -->
	<div class="mb-3 flex gap-2">
		<button 
			class="flex-1 rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
			onclick={() => testLoad(bookState.currentIndex)}
		>
			加载当前页
		</button>
		<button 
			class="flex-1 rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600"
			onclick={() => testBatchLoad(5)}
		>
			批量加载 5 页
		</button>
		<button 
			class="flex-1 rounded bg-purple-500 px-2 py-1 text-xs text-white hover:bg-purple-600"
			onclick={() => testBatchLoad(10)}
		>
			批量加载 10 页
		</button>
	</div>
	
	<!-- 加载历史 -->
	<div class="max-h-40 overflow-auto rounded border">
		<table class="w-full text-xs">
			<thead class="sticky top-0 bg-muted">
				<tr>
					<th class="p-1 text-left">时间</th>
					<th class="p-1 text-left">页码</th>
					<th class="p-1 text-left">缓存</th>
					<th class="p-1 text-left">耗时</th>
				</tr>
			</thead>
			<tbody>
				{#each loadHistory as entry}
					<tr class="border-t">
						<td class="p-1 font-mono">{entry.time}</td>
						<td class="p-1">{entry.index + 1}</td>
						<td class="p-1">
							{#if entry.cached}
								<span class="text-green-500">✓</span>
							{:else}
								<span class="text-red-500">✗</span>
							{/if}
						</td>
						<td class="p-1 font-mono">{entry.duration.toFixed(1)}ms</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.pipeline-debug-node {
		min-width: 400px;
	}
</style>
