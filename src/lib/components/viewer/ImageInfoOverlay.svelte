<script lang="ts">
  import { Info } from '@lucide/svelte';
  import { onDestroy } from 'svelte';
  import { infoPanelStore, type ViewerImageInfo } from '$lib/stores/infoPanel.svelte';
  import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';

  let imageInfo = $state<ViewerImageInfo | null>(null);
  let enabled = $state(false);
  let opacity = $state(0.85);

  const unsubscribeInfo = infoPanelStore.subscribe((state) => {
    imageInfo = state.imageInfo;
  });

  function syncFromSettings() {
    const s = settingsManager.getSettings();
    const overlay = s.view?.infoOverlay;
    enabled = overlay?.enabled ?? false;
    opacity = overlay?.opacity ?? 0.85;
  }

  syncFromSettings();

  const settingsListener = (s: NeoViewSettings) => {
    const overlay = s.view?.infoOverlay;
    enabled = overlay?.enabled ?? false;
    opacity = overlay?.opacity ?? 0.85;
  };

  settingsManager.addListener(settingsListener);

  onDestroy(() => {
    unsubscribeInfo();
    settingsManager.removeListener(settingsListener);
  });

  function formatDate(date?: string): string {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return date;
    }
    return parsed.toLocaleString('zh-CN');
  }

  const backgroundOpacity = $derived(() => {
    // 与 InfoPanel 中的范围保持一致（0% - 100%）
    return Math.min(1, Math.max(0, opacity));
  });
</script>

{#if enabled && imageInfo}
  <div class="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2">
    <div class="relative pointer-events-auto max-w-[70vw] rounded-md border border-border/60 text-xs shadow-lg backdrop-blur-md">
      <div class="absolute inset-0 rounded-md bg-background" style:opacity={backgroundOpacity} />
      <div class="relative flex items-center gap-3 px-3 py-2">
        <Info class="h-3.5 w-3.5 text-primary" />
        <div class="flex flex-col gap-0.5">
          <div class="flex items-center gap-2">
            <span
              class="font-mono text-[11px] font-semibold max-w-[32vw] truncate"
              title={imageInfo.name}
            >
              {imageInfo.name}
            </span>
            {#if imageInfo.width && imageInfo.height}
              <span class="text-[11px] text-muted-foreground">
                {imageInfo.width}×{imageInfo.height}
              </span>
            {/if}
          </div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {#if imageInfo.createdAt}
              <span>创建: {formatDate(imageInfo.createdAt)}</span>
            {/if}
            {#if imageInfo.modifiedAt}
              <span>修改: {formatDate(imageInfo.modifiedAt)}</span>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
