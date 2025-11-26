<script lang="ts">
  import { onDestroy } from 'svelte';
  import { infoPanelStore, type ViewerImageInfo } from '$lib/stores/infoPanel.svelte';
  import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';

  let imageInfo = $state<ViewerImageInfo | null>(null);
  let enabled = $state(false);
  let opacity = $state(0.85);
  let showBorder = $state(false);
  let overlayWidth = $state<number | undefined>(undefined);
  let overlayHeight = $state<number | undefined>(undefined);
  let dragOffsetX = $state(0);
  let dragOffsetY = $state(0);
  let isDragging = false;
  let dragStartMouseX = 0;
  let dragStartMouseY = 0;
  let dragStartOffsetX = 0;
  let dragStartOffsetY = 0;

  const unsubscribeInfo = infoPanelStore.subscribe((state) => {
    imageInfo = state.imageInfo;
  });

  function syncFromSettings() {
    const s = settingsManager.getSettings();
    const overlay = s.view?.infoOverlay;
    enabled = overlay?.enabled ?? false;
    opacity = overlay?.opacity ?? 0.85;
    showBorder = overlay?.showBorder ?? false;
    overlayWidth = overlay?.width;
    overlayHeight = overlay?.height;
  }

  syncFromSettings();

  const settingsListener = (s: NeoViewSettings) => {
    const overlay = s.view?.infoOverlay;
    enabled = overlay?.enabled ?? false;
    opacity = overlay?.opacity ?? 0.85;
    showBorder = overlay?.showBorder ?? false;
    overlayWidth = overlay?.width;
    overlayHeight = overlay?.height;
  };

  settingsManager.addListener(settingsListener);

  onDestroy(() => {
    unsubscribeInfo();
    settingsManager.removeListener(settingsListener);
  });

  function handleDragStart(event: MouseEvent) {
    // 仅在启用时允许拖拽
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    isDragging = true;
    dragStartMouseX = event.clientX;
    dragStartMouseY = event.clientY;
    dragStartOffsetX = dragOffsetX;
    dragStartOffsetY = dragOffsetY;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartMouseX;
      const dy = e.clientY - dragStartMouseY;
      dragOffsetX = dragStartOffsetX + dx;
      dragOffsetY = dragStartOffsetY + dy;
    };

    const handleMouseUp = () => {
      isDragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

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
  <div
    class="pointer-events-none absolute z-40"
    style:left={dragOffsetX === 0 ? '50%' : `calc(50% + ${dragOffsetX}px)`}
    style:top={dragOffsetY === 0 ? '1rem' : `calc(1rem + ${dragOffsetY}px)`}
    style:transform={dragOffsetX === 0 ? 'translate(-50%, 0)' : 'translate(0, 0)'}
  >
    <div
      class={`relative pointer-events-auto max-w-[70vw] rounded-md text-xs ${
        showBorder ? 'border border-border/60' : ''
      }`}
      style:backgroundColor={`hsl(var(--background) / ${backgroundOpacity})`}
    >
      <div
        class="relative flex items-center gap-3 px-3 py-2 cursor-move select-none overflow-hidden"
        onmousedown={handleDragStart}
        role="button"
        aria-label="拖动以移动信息条"
        tabindex="0"
        style:width={overlayWidth != null ? `${overlayWidth}px` : undefined}
        style:height={overlayHeight != null ? `${overlayHeight}px` : undefined}
      >
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
