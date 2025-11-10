<script lang="ts">
  import { thumbnailQueue } from '$lib/stores/thumbnailQueue';
  import { ImageIcon, Loader2 } from '@lucide/svelte';

  let stats = $state(thumbnailQueue.getStats());

  // 定期更新状态
  $effect(() => {
    const interval = setInterval(() => {
      stats = thumbnailQueue.getStats();
    }, 1000); // 每秒更新一次

    return () => clearInterval(interval);
  });

  // 计算是否正在处理
  let isProcessing = $derived(stats.processing > 0);
  let hasQueue = $derived(stats.queueLength > 0);
  let totalActive = $derived(stats.processing + stats.queueLength);
</script>

{#if isProcessing || hasQueue}
  <div class="flex items-center gap-1 text-xs text-muted-foreground">
    <div class="flex items-center gap-1">
      {#if isProcessing}
        <Loader2 class="h-3 w-3 animate-spin text-blue-500" />
      {:else}
        <ImageIcon class="h-3 w-3 text-green-500" />
      {/if}
      <span class="font-mono">
        {stats.processing}/{stats.maxConcurrent}
        {#if hasQueue}
          (+{stats.queueLength})
        {/if}
      </span>
    </div>
  </div>
{/if}