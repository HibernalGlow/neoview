<!--
  TranslationOverlay - 翻译悬浮 SVG 叠加层
  
  功能：
  - 在图片上叠加显示翻译区域
  - 使用 SVG 渲染，完美跟随图片缩放
  - 支持多边形边界框、译文显示
  - 悬停显示原文
-->
<script lang="ts">
  import { translationStore, TranslationStore, type TranslationRegion } from '$lib/stores/translation/translationStore.svelte';
  
  interface Props {
    /** 页面索引 */
    pageIndex: number;
    /** 图片原始宽度 */
    imageWidth: number;
    /** 图片原始高度 */
    imageHeight: number;
    /** 额外的缩放比例（用于双页模式） */
    scale?: number;
  }
  
  let { 
    pageIndex, 
    imageWidth, 
    imageHeight,
    scale = 1 
  }: Props = $props();
  
  // 响应式获取区域数据
  let regions = $derived.by(() => {
    void translationStore.version;
    return translationStore.getRegions(pageIndex);
  });
  
  // 响应式获取设置
  let settings = $derived.by(() => {
    void translationStore.version;
    return translationStore.overlaySettings;
  });
  
  // 当前悬停的区域 ID
  let hoveredRegionId = $state<string | null>(null);
  
  /** 计算多边形 points 属性 */
  function getPolygonPoints(region: TranslationRegion): string {
    return region.polygon.map(p => `${p.x},${p.y}`).join(' ');
  }
  
  /** 获取区域边界框 */
  function getBounds(region: TranslationRegion) {
    return TranslationStore.getBounds(region.polygon);
  }
  
  /** 处理区域悬停 */
  function handleMouseEnter(regionId: string) {
    hoveredRegionId = regionId;
  }
  
  function handleMouseLeave() {
    hoveredRegionId = null;
  }
  
  /** 获取显示文本 */
  function getDisplayText(region: TranslationRegion): string {
    const isHovered = hoveredRegionId === region.id;
    
    // 悬停时显示原文
    if (isHovered && settings.showOriginalOnHover && region.originalText) {
      return region.originalText;
    }
    
    // 优先显示译文
    if (settings.showTranslation && region.translatedText) {
      return region.translatedText;
    }
    
    // 显示原文
    if (settings.showOriginal && region.originalText) {
      return region.originalText;
    }
    
    return '';
  }
  
  /** 检查是否应该显示区域 */
  function shouldShowRegion(region: TranslationRegion): boolean {
    if (!region.visible) return false;
    if (!settings.enabled) return false;
    return true;
  }
</script>

{#if settings.enabled && imageWidth > 0 && imageHeight > 0}
  <svg
    class="translation-overlay"
    viewBox="0 0 {imageWidth} {imageHeight}"
    preserveAspectRatio="xMidYMid meet"
    style:opacity={settings.opacity}
  >
    <defs>
      <!-- 文本背景滤镜 -->
      <filter id="text-bg-filter" x="-5%" y="-5%" width="110%" height="110%">
        <feFlood flood-color="rgba(0,0,0,0.7)" result="bg" />
        <feMerge>
          <feMergeNode in="bg" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    
    {#each regions as region (region.id)}
      {#if shouldShowRegion(region)}
        {@const bounds = getBounds(region)}
        {@const displayText = getDisplayText(region)}
        {@const isHovered = hoveredRegionId === region.id}
        
        <g 
          class="translation-region"
          class:hovered={isHovered}
          transform="rotate({region.rotation}, {bounds.centerX}, {bounds.centerY})"
          role="group"
          aria-label={region.translatedText || region.originalText}
          onmouseenter={() => handleMouseEnter(region.id)}
          onmouseleave={handleMouseLeave}
        >
          <!-- 边界框 -->
          {#if settings.showBoundingBox}
            <polygon
              class="region-polygon"
              points={getPolygonPoints(region)}
              fill="transparent"
              stroke={settings.boundingBoxColor}
              stroke-width={settings.boundingBoxWidth}
              stroke-opacity={isHovered ? 1 : 0.6}
            />
          {/if}
          
          <!-- 译文容器 -->
          {#if displayText}
            <foreignObject
              x={bounds.x}
              y={bounds.y}
              width={bounds.width}
              height={bounds.height}
              class="text-container"
            >
              <div
                class="translation-text"
                style:font-size="{region.style.fontSize}px"
                style:font-family={region.style.fontFamily}
                style:color={region.style.color}
                style:background-color={region.style.backgroundColor}
                style:--stroke-color={region.style.strokeColor}
                style:--stroke-width="{region.style.strokeWidth}px"
              >
                {displayText}
              </div>
            </foreignObject>
          {/if}
          
          <!-- 交互热区（扩大点击区域） -->
          <rect
            class="hit-area"
            x={bounds.x - 4}
            y={bounds.y - 4}
            width={bounds.width + 8}
            height={bounds.height + 8}
            fill="transparent"
            pointer-events="all"
          />
        </g>
      {/if}
    {/each}
  </svg>
{/if}

<style>
  .translation-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 10;
  }
  
  .translation-region {
    pointer-events: auto;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }
  
  .translation-region:hover {
    opacity: 1;
  }
  
  .region-polygon {
    transition: stroke-opacity 0.15s ease, stroke-width 0.15s ease;
  }
  
  .translation-region.hovered .region-polygon {
    stroke-width: 3;
  }
  
  .text-container {
    overflow: visible;
  }
  
  .translation-text {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 4px 6px;
    border-radius: 4px;
    text-align: center;
    word-break: break-word;
    line-height: 1.3;
    box-sizing: border-box;
    /* 文字描边效果 */
    text-shadow: 
      var(--stroke-width, 0) var(--stroke-width, 0) 0 var(--stroke-color, transparent),
      calc(-1 * var(--stroke-width, 0)) var(--stroke-width, 0) 0 var(--stroke-color, transparent),
      var(--stroke-width, 0) calc(-1 * var(--stroke-width, 0)) 0 var(--stroke-color, transparent),
      calc(-1 * var(--stroke-width, 0)) calc(-1 * var(--stroke-width, 0)) 0 var(--stroke-color, transparent);
  }
  
  .hit-area {
    cursor: pointer;
  }
</style>
