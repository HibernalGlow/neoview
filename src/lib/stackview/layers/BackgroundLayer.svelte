<!--
  BackgroundLayer - 背景层
  z-index: 0
  
  支持两种背景模式：
  - solid: 纯色背景
  - auto: 自适应背景色（从图片边缘提取主色调）
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import { computeAutoBackgroundColor } from '$lib/utils/autoBackground';
  
  let {
    color = 'var(--background)',
    mode = 'solid',
    imageSrc = '',
    preloadedColor = null,
  }: {
    color?: string;
    mode?: 'solid' | 'auto';
    imageSrc?: string;
    /** 预加载时已计算好的背景色 */
    preloadedColor?: string | null;
  } = $props();
  
  // 自适应背景色状态
  let autoColor = $state<string | null>(null);
  let lastImageSrc = $state<string | null>(null);
  
  // 计算自适应背景色
  $effect(() => {
    if (mode !== 'auto' || !imageSrc) {
      autoColor = null;
      lastImageSrc = null;
      return;
    }
    
    // 优先使用预加载的背景色
    if (preloadedColor) {
      autoColor = preloadedColor;
      lastImageSrc = imageSrc;
      return;
    }
    
    // 避免重复计算
    if (imageSrc === lastImageSrc && autoColor) {
      return;
    }
    
    lastImageSrc = imageSrc;
    
    // 没有预加载背景色时才异步计算
    void (async () => {
      const computed = await computeAutoBackgroundColor(imageSrc);
      // 确保在计算完成时图片源没有变化
      if (lastImageSrc === imageSrc) {
        autoColor = computed;
      }
    })();
  });
  
  // 最终背景色
  let effectiveColor = $derived(mode === 'auto' && autoColor ? autoColor : color);
</script>

<div 
  class="background-layer"
  data-layer="BackgroundLayer"
  data-layer-id="background"
  style:background-color={effectiveColor}
  style:z-index={LayerZIndex.BACKGROUND}
></div>

<style>
  .background-layer {
    position: absolute;
    inset: 0;
    transition: background-color 0.3s ease;
  }
</style>
