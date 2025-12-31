<!--
  BackgroundLayer - 背景层
  z-index: 0
  
  支持多种背景模式：
  - solid: 纯色背景
  - auto: 自适应背景色（从图片边缘提取主色调）
  - ambient: 流光溢彩（类似苹果灵动岛，从图片提取多个主色调生成流动渐变）
  - aurora: 极光效果（基于 Aceternity UI）
  - spotlight: 聚光灯效果（基于 Aceternity UI）
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import { computeAutoBackgroundColor } from '$lib/utils/autoBackground';
  import { extractPalette } from '$lib/utils/ambientBackground';
  import { fade } from 'svelte/transition';
  
  let {
    color = 'var(--background)',
    mode = 'solid',
    imageSrc = '',
    preloadedColor = null,
    preloadedPalette = null,
    /** 流光动画速度，单位秒 */
    ambientSpeed = 8,
    /** 流光模糊程度 */
    ambientBlur = 80,
    /** 流光透明度 (0-1) */
    ambientOpacity = 0.8,
    /** 流光样式：'gentle' 柔和 | 'vibrant' 鲜艳 | 'dynamic' 动感 */
    ambientStyle = 'vibrant' as 'gentle' | 'vibrant' | 'dynamic',
    /** Aurora 是否显示径向渐变遮罩 */
    auroraShowRadialGradient = true,
    /** Spotlight 颜色 */
    spotlightColor = 'white',
  }: {
    color?: string;
    mode?: 'solid' | 'auto' | 'ambient' | 'aurora' | 'spotlight';
    imageSrc?: string;
    /** 预加载时已计算好的背景色 */
    preloadedColor?: string | null;
    /** 预加载时已计算好的调色板 */
    preloadedPalette?: string[] | null;
    ambientSpeed?: number;
    ambientBlur?: number;
    ambientOpacity?: number;
    ambientStyle?: 'gentle' | 'vibrant' | 'dynamic';
    auroraShowRadialGradient?: boolean;
    spotlightColor?: string;
  } = $props();
  
  // 自适应背景色状态
  let autoColor = $state<string | null>(null);
  let lastImageSrc = $state<string | null>(null);
  
  // 流光溢彩调色板状态
  let palette = $state<string[]>([]);
  let lastPaletteSrc = $state<string | null>(null);
  
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
  
  // 计算流光溢彩调色板
  $effect(() => {
    if (mode !== 'ambient' || !imageSrc) {
      palette = [];
      lastPaletteSrc = null;
      return;
    }
    
    // 优先使用预加载的调色板
    if (preloadedPalette && preloadedPalette.length > 0) {
      palette = preloadedPalette;
      lastPaletteSrc = imageSrc;
      return;
    }
    
    // 避免重复计算
    if (imageSrc === lastPaletteSrc && palette.length > 0) {
      return;
    }
    
    lastPaletteSrc = imageSrc;
    
    // 异步提取调色板
    void (async () => {
      const colors = await extractPalette(imageSrc, { 
        count: ambientStyle === 'dynamic' ? 6 : 4,
        enhance: true 
      });
      // 确保在计算完成时图片源没有变化
      if (lastPaletteSrc === imageSrc) {
        palette = colors;
      }
    })();
  });
  
  // 最终背景色（用于 solid 和 auto 模式）
  let effectiveColor = $derived(mode === 'auto' && autoColor ? autoColor : color);
  
  // 根据样式获取动画类名
  let animationClass = $derived(
    ambientStyle === 'dynamic' ? 'ambient-dynamic' : 
    ambientStyle === 'gentle' ? 'ambient-gentle' : 
    'ambient-vibrant'
  );
  
  // 生成调色板 CSS 变量
  let paletteVars = $derived(() => {
    if (palette.length === 0) return '';
    return palette.map((c, i) => `--ambient-color-${i + 1}: ${c};`).join(' ');
  });
</script>

<div 
  class="background-layer"
  class:ambient-mode={mode === 'ambient' && palette.length > 0}
  class:aurora-mode={mode === 'aurora'}
  class:spotlight-mode={mode === 'spotlight'}
  data-layer="BackgroundLayer"
  data-layer-id="background"
  style:background-color={['ambient', 'aurora', 'spotlight'].includes(mode) ? 'var(--background)' : effectiveColor}
  style:z-index={LayerZIndex.BACKGROUND}
>
  {#if mode === 'ambient' && palette.length > 0}
    <!-- 流光溢彩背景层 - 移除 {#key} 避免翻页闪屏，使用 CSS 过渡平滑切换颜色 -->
    <div 
      class="ambient-container {animationClass}"
      style="{paletteVars()} --ambient-speed: {ambientSpeed}s; --ambient-blur: {ambientBlur}px; --ambient-opacity: {ambientOpacity};"
    >
      <!-- 底层：深色背景 -->
      <div class="ambient-base"></div>
      
      <!-- 流动的色块 -->
      <div class="ambient-blob blob-1"></div>
      <div class="ambient-blob blob-2"></div>
      <div class="ambient-blob blob-3"></div>
      <div class="ambient-blob blob-4"></div>
      {#if ambientStyle === 'dynamic' && palette.length >= 5}
        <div class="ambient-blob blob-5"></div>
        <div class="ambient-blob blob-6"></div>
      {/if}
      
      <!-- 顶层：柔化噪点 -->
      <div class="ambient-noise"></div>
    </div>
  {:else if mode === 'aurora'}
    <!-- Aurora 极光背景 - 移除 in:fade 避免翻页闪屏 -->
    <div class="aurora-container">
      <div
        class="aurora-effect"
        class:aurora-masked={auroraShowRadialGradient}
      ></div>
    </div>
  {:else if mode === 'spotlight'}
    <!-- Spotlight 聚光灯背景 - 移除 in:fade 避免翻页闪屏 -->
    <svg
      class="spotlight-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 3787 2842"
      fill="none"
    >
      <g filter="url(#spotlight-filter)">
        <ellipse
          cx="1924.71"
          cy="273.501"
          rx="1924.71"
          ry="273.501"
          transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
          fill={spotlightColor}
          fill-opacity="0.21"
        ></ellipse>
      </g>
      <defs>
        <filter
          id="spotlight-filter"
          x="0.860352"
          y="0.838989"
          width="3785.16"
          height="2840.26"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          ></feBlend>
          <feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur"></feGaussianBlur>
        </filter>
      </defs>
    </svg>
  {/if}
</div>

<style>
  .background-layer {
    position: absolute;
    inset: 0;
    transition: background-color 0.3s ease;
    overflow: hidden;
  }
  
  .ambient-container {
    position: absolute;
    inset: -50%;
    width: 200%;
    height: 200%;
    filter: blur(var(--ambient-blur, 80px));
    opacity: var(--ambient-opacity, 0.8);
    will-change: transform;
  }
  
  .ambient-base {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at center,
      color-mix(in oklch, var(--ambient-color-1, #1a1a2e) 50%, black) 0%,
      black 100%
    );
  }
  
  .ambient-blob {
    position: absolute;
    border-radius: 50%;
    mix-blend-mode: screen;
    will-change: transform;
    /* 颜色过渡：翻页时平滑切换调色板颜色，避免闪屏 */
    transition: background 0.8s ease-out;
  }
  
  /* 色块尺寸和位置 */
  .blob-1 {
    width: 60%;
    height: 60%;
    background: radial-gradient(circle, var(--ambient-color-1, #6366f1) 0%, transparent 70%);
    top: 10%;
    left: 5%;
  }
  
  .blob-2 {
    width: 50%;
    height: 50%;
    background: radial-gradient(circle, var(--ambient-color-2, #ec4899) 0%, transparent 70%);
    top: 30%;
    right: 10%;
  }
  
  .blob-3 {
    width: 55%;
    height: 55%;
    background: radial-gradient(circle, var(--ambient-color-3, #22c55e) 0%, transparent 70%);
    bottom: 10%;
    left: 20%;
  }
  
  .blob-4 {
    width: 45%;
    height: 45%;
    background: radial-gradient(circle, var(--ambient-color-4, #f97316) 0%, transparent 70%);
    bottom: 20%;
    right: 5%;
  }
  
  .blob-5 {
    width: 40%;
    height: 40%;
    background: radial-gradient(circle, var(--ambient-color-5, #a855f7) 0%, transparent 70%);
    top: 5%;
    right: 30%;
  }
  
  .blob-6 {
    width: 35%;
    height: 35%;
    background: radial-gradient(circle, var(--ambient-color-6, #06b6d4) 0%, transparent 70%);
    bottom: 30%;
    left: 5%;
  }
  
  /* 柔和模式 - 缓慢、轻微的移动 */
  .ambient-gentle .blob-1 {
    animation: float-gentle-1 calc(var(--ambient-speed, 8s) * 1.5) ease-in-out infinite;
  }
  .ambient-gentle .blob-2 {
    animation: float-gentle-2 calc(var(--ambient-speed, 8s) * 1.8) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.3);
  }
  .ambient-gentle .blob-3 {
    animation: float-gentle-3 calc(var(--ambient-speed, 8s) * 2) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.6);
  }
  .ambient-gentle .blob-4 {
    animation: float-gentle-4 calc(var(--ambient-speed, 8s) * 1.7) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.9);
  }
  
  @keyframes float-gentle-1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(5%, 3%) scale(1.05); }
  }
  @keyframes float-gentle-2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(-4%, 5%) scale(0.95); }
  }
  @keyframes float-gentle-3 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(3%, -4%) scale(1.03); }
  }
  @keyframes float-gentle-4 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(-5%, -3%) scale(0.97); }
  }
  
  /* 鲜艳模式 - 更明显的移动，类似灵动岛 */
  .ambient-vibrant .blob-1 {
    animation: float-vibrant-1 var(--ambient-speed, 8s) ease-in-out infinite;
  }
  .ambient-vibrant .blob-2 {
    animation: float-vibrant-2 calc(var(--ambient-speed, 8s) * 1.2) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.25);
  }
  .ambient-vibrant .blob-3 {
    animation: float-vibrant-3 calc(var(--ambient-speed, 8s) * 0.9) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.5);
  }
  .ambient-vibrant .blob-4 {
    animation: float-vibrant-4 calc(var(--ambient-speed, 8s) * 1.1) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.75);
  }
  
  @keyframes float-vibrant-1 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    25% { transform: translate(10%, 5%) scale(1.1) rotate(5deg); }
    50% { transform: translate(5%, 10%) scale(0.95) rotate(-3deg); }
    75% { transform: translate(-5%, 5%) scale(1.05) rotate(3deg); }
  }
  @keyframes float-vibrant-2 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    25% { transform: translate(-8%, 10%) scale(0.9) rotate(-5deg); }
    50% { transform: translate(-15%, 5%) scale(1.1) rotate(5deg); }
    75% { transform: translate(-5%, -5%) scale(1) rotate(-3deg); }
  }
  @keyframes float-vibrant-3 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    25% { transform: translate(8%, -8%) scale(1.05) rotate(8deg); }
    50% { transform: translate(15%, 5%) scale(0.9) rotate(-5deg); }
    75% { transform: translate(5%, 10%) scale(1.1) rotate(3deg); }
  }
  @keyframes float-vibrant-4 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    25% { transform: translate(-10%, -10%) scale(1.15) rotate(-8deg); }
    50% { transform: translate(5%, -15%) scale(0.85) rotate(5deg); }
    75% { transform: translate(10%, -5%) scale(1) rotate(-3deg); }
  }
  
  /* 动感模式 - 更快速、更大幅度的移动 */
  .ambient-dynamic .blob-1 {
    animation: float-dynamic-1 calc(var(--ambient-speed, 8s) * 0.6) ease-in-out infinite;
  }
  .ambient-dynamic .blob-2 {
    animation: float-dynamic-2 calc(var(--ambient-speed, 8s) * 0.7) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.1);
  }
  .ambient-dynamic .blob-3 {
    animation: float-dynamic-3 calc(var(--ambient-speed, 8s) * 0.5) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.2);
  }
  .ambient-dynamic .blob-4 {
    animation: float-dynamic-4 calc(var(--ambient-speed, 8s) * 0.65) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.3);
  }
  .ambient-dynamic .blob-5 {
    animation: float-dynamic-5 calc(var(--ambient-speed, 8s) * 0.55) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.4);
  }
  .ambient-dynamic .blob-6 {
    animation: float-dynamic-6 calc(var(--ambient-speed, 8s) * 0.75) ease-in-out infinite;
    animation-delay: calc(var(--ambient-speed, 8s) * -0.5);
  }
  
  @keyframes float-dynamic-1 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    20% { transform: translate(15%, 10%) scale(1.2) rotate(10deg); }
    40% { transform: translate(25%, -5%) scale(0.8) rotate(-15deg); }
    60% { transform: translate(10%, -15%) scale(1.1) rotate(5deg); }
    80% { transform: translate(-10%, -5%) scale(0.9) rotate(-5deg); }
  }
  @keyframes float-dynamic-2 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    20% { transform: translate(-20%, 15%) scale(0.8) rotate(-12deg); }
    40% { transform: translate(-10%, 25%) scale(1.15) rotate(8deg); }
    60% { transform: translate(10%, 15%) scale(0.9) rotate(-8deg); }
    80% { transform: translate(5%, -10%) scale(1.1) rotate(5deg); }
  }
  @keyframes float-dynamic-3 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    20% { transform: translate(20%, -20%) scale(1.15) rotate(15deg); }
    40% { transform: translate(30%, 10%) scale(0.85) rotate(-10deg); }
    60% { transform: translate(5%, 20%) scale(1.2) rotate(8deg); }
    80% { transform: translate(-15%, 5%) scale(0.9) rotate(-5deg); }
  }
  @keyframes float-dynamic-4 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    20% { transform: translate(-15%, -15%) scale(1.25) rotate(-18deg); }
    40% { transform: translate(10%, -25%) scale(0.75) rotate(12deg); }
    60% { transform: translate(20%, -10%) scale(1.1) rotate(-5deg); }
    80% { transform: translate(-5%, 15%) scale(0.95) rotate(8deg); }
  }
  @keyframes float-dynamic-5 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    25% { transform: translate(25%, 20%) scale(0.7) rotate(20deg); }
    50% { transform: translate(-15%, 30%) scale(1.3) rotate(-15deg); }
    75% { transform: translate(-25%, 5%) scale(0.85) rotate(10deg); }
  }
  @keyframes float-dynamic-6 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    25% { transform: translate(-20%, -25%) scale(1.2) rotate(-20deg); }
    50% { transform: translate(20%, -20%) scale(0.8) rotate(15deg); }
    75% { transform: translate(15%, 15%) scale(1.1) rotate(-10deg); }
  }
  
  /* 噪点纹理层 - 增加质感 */
  .ambient-noise {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    opacity: 0.03;
    mix-blend-mode: overlay;
    pointer-events: none;
  }

  /* ==================== Aurora 极光效果 ==================== */
  .aurora-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .aurora-effect {
    --white: #ffffff;
    --black: #000000;
    --transparent: transparent;
    --blue-300: #93c5fd;
    --blue-400: #60a5fa;
    --blue-500: #3b82f6;
    --indigo-300: #a5b4fc;
    --violet-200: #ddd6fe;
    
    position: absolute;
    inset: -10px;
    opacity: 0.5;
    will-change: transform;
    
    /* 渐变背景 */
    background-image:
      repeating-linear-gradient(100deg, var(--black) 0%, var(--black) 7%, var(--transparent) 10%, var(--transparent) 12%, var(--black) 16%),
      repeating-linear-gradient(100deg, var(--blue-500) 10%, var(--indigo-300) 15%, var(--blue-300) 20%, var(--violet-200) 25%, var(--blue-400) 30%);
    background-size: 300% 200%;
    background-position: 50% 50%;
    filter: blur(10px);
    pointer-events: none;
    animation: aurora 60s linear infinite;
  }

  .aurora-effect::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(100deg, var(--black) 0%, var(--black) 7%, var(--transparent) 10%, var(--transparent) 12%, var(--black) 16%),
      repeating-linear-gradient(100deg, var(--blue-500) 10%, var(--indigo-300) 15%, var(--blue-300) 20%, var(--violet-200) 25%, var(--blue-400) 30%);
    background-size: 200% 100%;
    animation: aurora 60s linear infinite;
    mix-blend-mode: difference;
  }

  .aurora-masked {
    mask-image: radial-gradient(ellipse at 100% 0%, black 10%, var(--transparent) 70%);
    -webkit-mask-image: radial-gradient(ellipse at 100% 0%, black 10%, transparent 70%);
  }

  @keyframes aurora {
    from {
      background-position: 50% 50%;
    }
    to {
      background-position: 350% 50%;
    }
  }

  /* ==================== Spotlight 聚光灯效果 ==================== */
  .spotlight-svg {
    position: absolute;
    z-index: 1;
    height: 169%;
    width: 138%;
    pointer-events: none;
    opacity: 0;
    animation: spotlight 2s ease 0.75s 1 forwards;
  }

  @keyframes spotlight {
    0% {
      opacity: 0;
      transform: translate(-72%, -62%) scale(0.5);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, -40%) scale(1);
    }
  }
</style>
