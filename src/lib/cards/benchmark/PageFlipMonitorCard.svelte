<script lang="ts">
	/**
	 * 翻页性能监控卡片
	 * 从 BenchmarkPanel 提取
	 * 用于诊断翻页内存泄露和性能问题
	 */
	import { onMount, onDestroy } from 'svelte';
	import { pageFlipMonitor } from '$lib/utils/pageFlipMonitor';
	import { getImageStore } from '$lib/stackview/stores/imageStore.svelte';
	import {
		getImageDecodePreloaderStats,
		type ImageDecodePreloaderStats
	} from '$lib/stackview/utils/imageDecodePreloader';
	import { getScaledProtocolStats, type ScaledProtocolStats } from '$lib/api/imageProtocol';
	import { Button } from '$lib/components/ui/button';
	import { RotateCw, Trash2, Activity } from '@lucide/svelte';

	const imageStore = getImageStore();
	const emptyScaledProtocolStats: ScaledProtocolStats = {
		requests: 0,
		hits: 0,
		generated: 0,
		generationFailures: 0,
		bypasses: 0,
		bypassHits: 0,
		bypassGenerated: 0,
		cacheLimit: 0,
		cacheTtlSecs: 0
	};

	let stats = $state({
		totalFlips: 0,
		averageFlipTime: 0,
		maxFlipTime: 0,
		memoryUsageMB: null as number | null,
		activeTimers: 0,
		lastFlipTime: null as Date | null
	});
	let readerStats = $state(imageStore.getPerformanceStats());
	let decodeStats = $state<ImageDecodePreloaderStats>(getImageDecodePreloaderStats());
	let scaledProtocolStats = $state<ScaledProtocolStats>(emptyScaledProtocolStats);
	let protocolHitRate = $derived(
		scaledProtocolStats.requests > 0
			? (scaledProtocolStats.hits / scaledProtocolStats.requests) * 100
			: 0
	);

	// 定时更新统计
	let updateInterval: ReturnType<typeof setInterval> | null = null;

	function updateStats() {
		stats = pageFlipMonitor.getStats();
		readerStats = imageStore.getPerformanceStats();
		decodeStats = getImageDecodePreloaderStats();
		void getScaledProtocolStats()
			.then((next) => {
				scaledProtocolStats = next;
			})
			.catch(() => {});
	}

	function resetStats() {
		pageFlipMonitor.reset();
		updateStats();
	}

	function printToConsole() {
		pageFlipMonitor.printStats();
	}

	// 启动自动更新
	onMount(() => {
		updateInterval = setInterval(updateStats, 1000);
		updateStats();
	});

	// 【修复内存泄露】清理定时器
	onDestroy(() => {
		if (updateInterval) {
			clearInterval(updateInterval);
			updateInterval = null;
		}
	});
</script>

<div class="space-y-3">
	<p class="text-muted-foreground text-[10px]">实时监控翻页性能，诊断内存泄露和性能退化问题</p>

	<!-- 统计数据 -->
	<div class="space-y-2 rounded border p-2 text-[10px]">
		<div class="flex items-center gap-2 font-medium">
			<Activity class="h-3 w-3" />
			<span>翻页统计</span>
		</div>

		<div class="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
			<div>总翻页次数:</div>
			<div class="text-foreground text-right font-mono">{stats.totalFlips}</div>

			<div>平均耗时:</div>
			<div
				class="text-right font-mono"
				class:text-green-500={stats.averageFlipTime < 100}
				class:text-yellow-500={stats.averageFlipTime >= 100 && stats.averageFlipTime < 200}
				class:text-red-500={stats.averageFlipTime >= 200}
			>
				{stats.averageFlipTime.toFixed(1)}ms
			</div>

			<div>最大耗时:</div>
			<div
				class="text-right font-mono"
				class:text-green-500={stats.maxFlipTime < 200}
				class:text-yellow-500={stats.maxFlipTime >= 200 && stats.maxFlipTime < 500}
				class:text-red-500={stats.maxFlipTime >= 500}
			>
				{stats.maxFlipTime.toFixed(1)}ms
			</div>

			{#if stats.memoryUsageMB !== null}
				<div>内存使用:</div>
				<div
					class="text-right font-mono"
					class:text-green-500={stats.memoryUsageMB < 300}
					class:text-yellow-500={stats.memoryUsageMB >= 300 && stats.memoryUsageMB < 500}
					class:text-red-500={stats.memoryUsageMB >= 500}
				>
					{stats.memoryUsageMB.toFixed(1)}MB
				</div>
			{/if}

			<div>活跃定时器:</div>
			<div
				class="text-right font-mono"
				class:text-green-500={stats.activeTimers < 10}
				class:text-yellow-500={stats.activeTimers >= 10 && stats.activeTimers < 50}
				class:text-red-500={stats.activeTimers >= 50}
			>
				{stats.activeTimers}
			</div>
		</div>
	</div>

	<!-- 性能指标说明 -->
	<div class="space-y-2 rounded border p-2 text-[10px]">
		<div class="flex items-center gap-2 font-medium">
			<Activity class="h-3 w-3" />
			<span>Reader hot path</span>
		</div>

		<div class="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
			<div>samples</div>
			<div class="text-foreground text-right font-mono">{readerStats.count}</div>

			<div>total p95</div>
			<div class="text-foreground text-right font-mono">
				{readerStats.totalBeforeCommitP95.toFixed(1)}ms
			</div>

			<div>last total</div>
			<div class="text-foreground text-right font-mono">
				{(readerStats.last?.totalBeforeCommitMs ?? 0).toFixed(1)}ms
			</div>

			<div>last scaled/original</div>
			<div class="text-foreground text-right font-mono">
				{readerStats.preload.lastScaledProxyCount}/{readerStats.preload.lastOriginalCount}
			</div>

			<div>scaled queued</div>
			<div class="text-foreground text-right font-mono">
				{readerStats.preload.queuedScaledProxy}
			</div>

			<div>predecode queued/active</div>
			<div class="text-foreground text-right font-mono">
				{decodeStats.queued}/{decodeStats.active}
			</div>

			<div>decoded cache</div>
			<div class="text-foreground text-right font-mono">
				{decodeStats.decoded}/{decodeStats.maxItems}
				({(decodeStats.decodedPixels / 1_000_000).toFixed(1)}MP)
			</div>

			<div>protocol hit/gen</div>
			<div class="text-foreground text-right font-mono">
				{scaledProtocolStats.hits}/{scaledProtocolStats.generated}
				({protocolHitRate.toFixed(0)}%)
			</div>

			<div>protocol bypass</div>
			<div class="text-foreground text-right font-mono">
				{scaledProtocolStats.bypasses} ({scaledProtocolStats.bypassHits}/{scaledProtocolStats.bypassGenerated})
			</div>

			<div>protocol fail</div>
			<div class="text-foreground text-right font-mono">
				{scaledProtocolStats.generationFailures}
			</div>

			<div>protocol cache</div>
			<div class="text-foreground text-right font-mono">
				{scaledProtocolStats.cacheLimit}/{scaledProtocolStats.cacheTtlSecs}s
			</div>
		</div>
	</div>

	<div class="bg-muted/50 space-y-1 rounded border p-2 text-[10px]">
		<div class="font-medium">性能目标</div>
		<div class="text-muted-foreground space-y-0.5">
			<div>• 平均耗时: &lt;100ms (目标 &lt;50ms)</div>
			<div>• 最大耗时: &lt;200ms</div>
			<div>• 内存使用: 保持稳定，不持续增长</div>
			<div>• 活跃定时器: &lt;10 个</div>
		</div>
	</div>

	<!-- 操作按钮 -->
	<div class="flex gap-2">
		<Button onclick={resetStats} variant="outline" size="sm" class="flex-1 text-xs">
			<Trash2 class="mr-1 h-3 w-3" />
			重置统计
		</Button>
		<Button onclick={printToConsole} variant="outline" size="sm" class="flex-1 text-xs">
			<RotateCw class="mr-1 h-3 w-3" />
			打印日志
		</Button>
	</div>

	<!-- 使用提示 -->
	<div class="text-muted-foreground space-y-0.5 text-[10px]">
		<div class="font-medium">使用方法:</div>
		<div>1. 打开一本图集</div>
		<div>2. 连续翻页 100+ 次</div>
		<div>3. 观察指标是否保持稳定</div>
		<div>4. 如果平均耗时持续增长，说明存在性能退化</div>
	</div>
</div>
