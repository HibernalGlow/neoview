<!--
  ImageInfoLayer - 媒体信息浮窗层（图片/视频）
  从 ImageInfoOverlay 移植，集成到 StackView 层系统
  z-index: 75
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { infoPanelStore, type ViewerImageInfo, type LatencyTrace } from '$lib/stores/infoPanel.svelte';
  import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
  import { LayerZIndex } from '../types/layer';

  let imageInfo = $state<ViewerImageInfo | null>(null);
  let latencyTrace = $state<LatencyTrace | null>(null);
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
    latencyTrace = state.latencyTrace;
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

  function formatDuration(seconds?: number): string {
    if (seconds == null || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatBitrate(bps?: number): string {
    if (bps == null || bps <= 0) return '';
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
    return `${bps} bps`;
  }

  const backgroundOpacity = $derived(() => {
    return Math.min(1, Math.max(0, opacity));
  });
</script>

{#if enabled && imageInfo}
  <div
    class="image-info-layer"
    data-layer="ImageInfoLayer"
    data-layer-id="image-info"
    style:z-index={LayerZIndex.INFO + 5}
    style:left={dragOffsetX === 0 ? '50%' : `calc(50% + ${dragOffsetX}px)`}
    style:top={dragOffsetY === 0 ? '1rem' : `calc(1rem + ${dragOffsetY}px)`}
    style:transform={dragOffsetX === 0 ? 'translate(-50%, 0)' : 'translate(0, 0)'}
  >
    <div
      class="info-content"
      class:with-border={showBorder}
      style:background-color={`hsl(var(--background) / ${backgroundOpacity})`}
    >
      <div
        class="info-inner"
        onmousedown={handleDragStart}
        role="button"
        aria-label="拖动以移动信息条"
        tabindex="0"
        style:width={overlayWidth != null ? `${overlayWidth}px` : undefined}
        style:height={overlayHeight != null ? `${overlayHeight}px` : undefined}
      >
        <div class="info-details">
          <div class="info-row">
            {#if imageInfo.isVideo}
              <span class="media-badge video">🎬</span>
            {:else}
              <span class="media-badge image">🖼️</span>
            {/if}
            <span class="file-name" title={imageInfo.name}>
              {imageInfo.name}
            </span>
            {#if imageInfo.width && imageInfo.height}
              <span class="dimensions">
                {imageInfo.width}×{imageInfo.height}
              </span>
            {/if}
            {#if imageInfo.isVideo && imageInfo.duration}
              <span class="duration">{formatDuration(imageInfo.duration)}</span>
            {/if}
          </div>
          <div class="meta-row">
            {#if imageInfo.isVideo}
              {#if imageInfo.frameRate}
                <span>{imageInfo.frameRate.toFixed(0)}fps</span>
              {/if}
              {#if imageInfo.bitrate}
                <span>{formatBitrate(imageInfo.bitrate)}</span>
              {/if}
              {#if imageInfo.videoCodec}
                <span>视频: {imageInfo.videoCodec}</span>
              {/if}
              {#if imageInfo.audioCodec}
                <span>音频: {imageInfo.audioCodec}</span>
              {/if}
            {/if}
            {#if imageInfo.createdAt}
              <span>创建: {formatDate(imageInfo.createdAt)}</span>
            {/if}
            {#if imageInfo.modifiedAt}
              <span>修改: {formatDate(imageInfo.modifiedAt)}</span>
            {/if}
          </div>
          <!-- 链路延迟追踪 -->
          {#if latencyTrace}
            <div class="latency-row">
              <span class={latencyTrace.cacheHit ? 'text-green' : 'text-yellow'}>
                {latencyTrace.dataSource === 'blob' ? '⚡' : '💾'}
                {latencyTrace.dataSource}
              </span>
              <span class="text-muted">
                {latencyTrace.renderMode === 'img' ? '🖼️img' : '🎨canvas'}
              </span>
              {#if latencyTrace.loadMs != null}
                <span class="text-blue">加载:{latencyTrace.loadMs.toFixed(0)}ms</span>
              {/if}
              {#if latencyTrace.decodeMs != null}
                <span class="text-purple">解码:{latencyTrace.decodeMs.toFixed(0)}ms</span>
              {/if}
              {#if latencyTrace.totalMs != null}
                <span class={latencyTrace.totalMs < 100 ? 'text-green' : latencyTrace.totalMs < 300 ? 'text-yellow' : 'text-red'}>
                  总计:{latencyTrace.totalMs.toFixed(0)}ms
                </span>
              {/if}
              {#if latencyTrace.cacheHit}
                <span class="text-green">✓缓存</span>
              {/if}
              {#if latencyTrace.dataSize}
                <span class="text-muted">{(latencyTrace.dataSize / 1024).toFixed(0)}KB</span>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .image-info-layer {
    position: absolute;
    pointer-events: none;
  }

  .info-content {
    position: relative;
    pointer-events: auto;
    max-width: 70vw;
    border-radius: 6px;
    font-size: 12px;
  }

  .info-content.with-border {
    border: 1px solid hsl(var(--border) / 0.6);
  }

  .info-inner {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    cursor: move;
    user-select: none;
    overflow: hidden;
  }

  .info-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .file-name {
    font-family: monospace;
    font-size: 11px;
    font-weight: 600;
    max-width: 32vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dimensions {
    font-size: 11px;
    color: hsl(var(--muted-foreground));
  }

  .media-badge {
    font-size: 12px;
    flex-shrink: 0;
  }

  .duration {
    font-size: 11px;
    color: hsl(var(--primary));
    font-family: monospace;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: hsl(var(--muted-foreground));
  }

  .latency-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-family: monospace;
  }

  .text-green { color: #22c55e; }
  .text-yellow { color: #eab308; }
  .text-blue { color: #3b82f6; }
  .text-purple { color: #a855f7; }
  .text-red { color: #ef4444; }
  .text-muted { color: hsl(var(--muted-foreground)); }
</style>
