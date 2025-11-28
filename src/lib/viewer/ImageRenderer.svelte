<!--
  ImageRenderer - 图片渲染组件
  
  职责：
  - 渲染单张图片
  - 支持裁剪（分割页面）
  - 支持旋转（自动旋转）
  - 支持缩放和平移
  
  实现原理：
  - 使用 CSS transform 实现缩放、旋转、平移
  - 使用 CSS clip-path 实现裁剪（分割页面）
  - 图片加载状态管理
  
  使用方式：
  <ImageRenderer
    src={imageUrl}
    rotation={0}
    cropRect={null}
    scale={1}
    offset={{ x: 0, y: 0 }}
    onLoad={() => {}}
    onError={(e) => {}}
  />
-->
<script lang="ts">
  import type { Rect, Point } from '$lib/core/types';
  
  // ============================================================================
  // Props
  // ============================================================================
  
  interface Props {
    /** 图片 URL */
    src: string | null;
    /** 旋转角度 (0, 90, 180, 270) */
    rotation?: 0 | 90 | 180 | 270;
    /** 裁剪区域（分割页面时使用） */
    cropRect?: Rect | null;
    /** 
     * 横向分割半边
     * - 'left': 显示左半边
     * - 'right': 显示右半边
     * - null/undefined: 不分割
     */
    splitHalf?: 'left' | 'right' | null;
    /** 缩放比例 */
    scale?: number;
    /** 偏移量 */
    offset?: Point;
    /** 适应模式 */
    fitMode?: 'contain' | 'cover' | 'none';
    /** 加载中 */
    loading?: boolean;
    /** 加载完成回调 */
    onLoad?: (event: Event) => void;
    /** 加载错误回调 */
    onError?: (event: Event) => void;
    /** 尺寸检测回调（图片加载后） */
    onSizeDetected?: (width: number, height: number) => void;
  }
  
  let {
    src,
    rotation = 0,
    cropRect = null,
    splitHalf = null,
    scale = 1,
    offset = { x: 0, y: 0 },
    fitMode = 'contain',
    loading = false,
    onLoad,
    onError,
    onSizeDetected,
  }: Props = $props();
  
  // ============================================================================
  // 计算样式
  // ============================================================================
  
  /** 是否为分割页面 */
  let isDivided = $derived(cropRect !== null || splitHalf !== null);
  
  /** 是否需要旋转 */
  let isRotated = $derived(rotation !== 0);
  
  /** 是否为 90° 或 270° 旋转（需要交换宽高） */
  let isVerticalRotation = $derived(rotation === 90 || rotation === 270);
  
  /** 计算 transform 样式 */
  let transformStyle = $derived.by(() => {
    const transforms: string[] = [];
    
    // 平移
    if (offset.x !== 0 || offset.y !== 0) {
      transforms.push(`translate(${offset.x}px, ${offset.y}px)`);
    }
    
    // 缩放
    if (scale !== 1) {
      transforms.push(`scale(${scale})`);
    }
    
    // 旋转
    if (rotation !== 0) {
      transforms.push(`rotate(${rotation}deg)`);
    }
    
    return transforms.length > 0 ? transforms.join(' ') : 'none';
  });
  
  /** 计算 clip-path 样式（分割页面） */
  let clipPathStyle = $derived.by(() => {
    if (!isDivided) return 'none';
    // 左半边: inset(0 50% 0 0) - 裁掉右边 50%
    // 右半边: inset(0 0 0 50%) - 裁掉左边 50%
    const isLeft = splitHalf === 'left';
    return isLeft ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)';
  });
  
  /** 分割页面的位移补偿 */
  let splitTranslate = $derived.by(() => {
    if (!isDivided) return '';
    // 左半边需要向右移动 25%，右半边需要向左移动 25%
    const isLeft = splitHalf === 'left';
    return isLeft ? 'translateX(25%)' : 'translateX(-25%)';
  });
  
  /** 计算容器样式 */
  let containerStyle = $derived.by(() => {
    const styles: string[] = [];
    
    // 旋转时需要调整容器尺寸
    if (isVerticalRotation) {
      styles.push('width: 100vh');
      styles.push('height: 100vw');
    }
    
    return styles.join('; ');
  });
  
  /** 计算图片样式 */
  let imageStyle = $derived.by(() => {
    const styles: string[] = [];
    
    // transform - 合并所有变换
    const transforms: string[] = [];
    if (splitTranslate) {
      transforms.push(splitTranslate);
    }
    if (transformStyle !== 'none') {
      transforms.push(transformStyle);
    }
    if (transforms.length > 0) {
      styles.push(`transform: ${transforms.join(' ')}`);
    }
    
    // clip-path
    if (clipPathStyle !== 'none') {
      styles.push(`clip-path: ${clipPathStyle}`);
    }
    
    return styles.join('; ');
  });
  
  /** 计算图片 class */
  let imageClass = $derived.by(() => {
    const classes: string[] = ['image-renderer__image'];
    
    // 适应模式
    switch (fitMode) {
      case 'contain':
        classes.push('object-contain');
        break;
      case 'cover':
        classes.push('object-cover');
        break;
      case 'none':
        break;
    }
    
    // 加载中
    if (loading) {
      classes.push('opacity-50');
    }
    
    return classes.join(' ');
  });
  
  // ============================================================================
  // 事件处理
  // ============================================================================
  
  function handleLoad(event: Event) {
    // 获取图片尺寸并通知
    const img = event.target as HTMLImageElement;
    if (img && onSizeDetected) {
      onSizeDetected(img.naturalWidth, img.naturalHeight);
    }
    onLoad?.(event);
  }
  
  function handleError(event: Event) {
    onError?.(event);
  }
</script>

<div class="image-renderer" style={containerStyle}>
  {#if src}
    <img
      {src}
      alt=""
      class={imageClass}
      style={imageStyle}
      onload={handleLoad}
      onerror={handleError}
      draggable="false"
    />
  {:else}
    <div class="image-renderer__placeholder">
      <slot name="placeholder">
        <span class="text-muted-foreground">无图片</span>
      </slot>
    </div>
  {/if}
  
  {#if loading}
    <div class="image-renderer__loading">
      <slot name="loading">
        <span class="text-muted-foreground">加载中...</span>
      </slot>
    </div>
  {/if}
</div>

<style>
  .image-renderer {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  
  .image-renderer__image {
    max-width: 100%;
    max-height: 100%;
    user-select: none;
    -webkit-user-drag: none;
  }
  
  .image-renderer__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  
  .image-renderer__loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
  }
</style>
