<script lang="ts">
import { onMount } from 'svelte';
import { Button } from '$lib/components/ui/button';
import { RefreshCw } from '@lucide/svelte';
import { unifiedThumbnailStore } from '$lib/stores/unifiedThumbnailStore.svelte';

interface SimpleStats {
  cached: number;
  loading: number;
  total: number;
}

let stats = $state<SimpleStats | null>(null);
let isLoading = $state(false);
let lastUpdated = $state<number>(0);

async function refreshStats() {
  isLoading = true;
  try {
    stats = unifiedThumbnailStore.getStats();
    lastUpdated = Date.now();
  } finally {
    isLoading = false;
  }
}

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
        <div class="text-muted-foreground">已缓存</div>
        <div class="font-mono text-sm">{stats.cached}</div>
      </div>
      <div class="rounded border p-2">
        <div class="text-muted-foreground">加载中</div>
        <div class="font-mono text-sm">{stats.loading}</div>
      </div>
      <div class="rounded border p-2">
        <div class="text-muted-foreground">总条目</div>
        <div class="font-mono text-sm">{stats.total}</div>
      </div>
    </div>
  {:else}
    <div class="rounded border p-3 text-muted-foreground">未获取到缩略图架构指标</div>
  {/if}
</div>
