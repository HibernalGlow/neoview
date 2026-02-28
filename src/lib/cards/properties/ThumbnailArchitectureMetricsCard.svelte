<script lang="ts">
import { onMount } from 'svelte';
import { Button } from '$lib/components/ui/button';
import { RefreshCw } from '@lucide/svelte';
import { getCacheStats, type CacheStats } from '$lib/stores/thumbnailStoreV3.svelte';

let stats = $state<CacheStats | null>(null);
let isLoading = $state(false);
let lastUpdated = $state<number>(0);

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

async function refreshStats() {
  isLoading = true;
  try {
    stats = await getCacheStats();
    lastUpdated = Date.now();
  } finally {
    isLoading = false;
  }
}

const ioPrefetchAvgMs = $derived.by(() => {
  if (!stats || stats.ioPrefetchRuns === 0) return 0;
  return Math.round(stats.ioPrefetchMs / stats.ioPrefetchRuns);
});

const decodeWaitAvgMs = $derived.by(() => {
  if (!stats || stats.decodeWaitCount === 0) return 0;
  return Math.round(stats.decodeWaitMs / stats.decodeWaitCount);
});

const scaleWaitAvgMs = $derived.by(() => {
  if (!stats || stats.scaleWaitCount === 0) return 0;
  return Math.round(stats.scaleWaitMs / stats.scaleWaitCount);
});

const encodeWaitAvgMs = $derived.by(() => {
  if (!stats || stats.encodeWaitCount === 0) return 0;
  return Math.round(stats.encodeWaitMs / stats.encodeWaitCount);
});

onMount(() => {
  refreshStats();
  const timer = setInterval(refreshStats, 2000);
  return () => clearInterval(timer);
});
</script>

<div class="space-y-3 text-xs">
  <div class="flex items-center justify-between">
    <div class="text-[11px] text-muted-foreground">
      {#if lastUpdated > 0}
        更新于 {new Date(lastUpdated).toLocaleTimeString()}
      {:else}
        暂无数据
      {/if}
    </div>
    <Button variant="outline" size="sm" onclick={refreshStats} disabled={isLoading}>
      <RefreshCw class={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
      刷新
    </Button>
  </div>

  {#if stats}
    <div class="grid grid-cols-2 gap-2">
      <div class="rounded border p-2">
        <div class="text-muted-foreground">窗口裁剪任务</div>
        <div class="font-mono text-sm">{stats.windowPrunedTasks}</div>
      </div>
      <div class="rounded border p-2">
        <div class="text-muted-foreground">当前队列总长</div>
        <div class="font-mono text-sm">{stats.queueLength}</div>
      </div>
      <div class="rounded border p-2">
        <div class="text-muted-foreground">缓存衰减淘汰</div>
        <div class="font-mono text-sm">{stats.cacheDecayEvictedEntries}</div>
      </div>
      <div class="rounded border p-2">
        <div class="text-muted-foreground">缓存衰减字节</div>
        <div class="font-mono text-sm">{formatBytes(stats.cacheDecayEvictedBytes)}</div>
      </div>
    </div>

    <div class="rounded border p-2 space-y-1">
      <div class="font-medium">调度等待</div>
      <div class="flex justify-between"><span>Decode 等待次数</span><span class="font-mono">{stats.decodeWaitCount}</span></div>
      <div class="flex justify-between"><span>Decode 平均等待</span><span class="font-mono">{formatMs(decodeWaitAvgMs)}</span></div>
      <div class="flex justify-between"><span>Scale 等待次数</span><span class="font-mono">{stats.scaleWaitCount}</span></div>
      <div class="flex justify-between"><span>Scale 平均等待</span><span class="font-mono">{formatMs(scaleWaitAvgMs)}</span></div>
      <div class="flex justify-between"><span>Encode 等待次数</span><span class="font-mono">{stats.encodeWaitCount}</span></div>
      <div class="flex justify-between"><span>Encode 平均等待</span><span class="font-mono">{formatMs(encodeWaitAvgMs)}</span></div>
    </div>

    <div class="rounded border p-2 space-y-1">
      <div class="font-medium">I/O 预读</div>
      <div class="flex justify-between"><span>预读轮次</span><span class="font-mono">{stats.ioPrefetchRuns}</span></div>
      <div class="flex justify-between"><span>预读文件数</span><span class="font-mono">{stats.ioPrefetchFiles}</span></div>
      <div class="flex justify-between"><span>平均预读耗时</span><span class="font-mono">{formatMs(ioPrefetchAvgMs)}</span></div>
    </div>

    <div class="rounded border p-2 space-y-1">
      <div class="font-medium">DB 批处理窗口</div>
      <div class="flex justify-between"><span>读窗口</span><span class="font-mono">{stats.dbReadWindow}</span></div>
      <div class="flex justify-between"><span>读最近耗时</span><span class="font-mono">{formatMs(stats.dbReadLastMs)}</span></div>
      <div class="flex justify-between"><span>写窗口</span><span class="font-mono">{stats.dbWriteWindow}</span></div>
      <div class="flex justify-between"><span>写最近耗时</span><span class="font-mono">{formatMs(stats.dbWriteLastMs)}</span></div>
      <div class="flex justify-between"><span>写最近条目</span><span class="font-mono">{stats.dbWriteLastItems}</span></div>
    </div>
  {:else}
    <div class="rounded border p-3 text-muted-foreground">未获取到缩略图架构指标</div>
  {/if}
</div>
