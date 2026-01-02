<!--
  PageIndexBadge - 页码徽章组件
  显示页码、预加载状态、超分状态等
  三个视图模式共用
-->
<script lang="ts">
  import { Zap, Download } from '@lucide/svelte';
  import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
  import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';
  import { preDecodeCache } from '$lib/stackview/stores/preDecodeCache.svelte';

  interface Props {
    pageIndex: number;
    /** 是否显示页面名称 */
    showName?: boolean;
    name?: string;
    /** 是否为当前页 */
    isCurrent?: boolean;
    /** 尺寸：sm 用于 thumb 视图，md 用于 list/grid */
    size?: 'sm' | 'md';
  }

  let {
    pageIndex,
    showName = false,
    name = '',
    isCurrent = false,
    size = 'md',
  }: Props = $props();

  // 响应式依赖
  const imagePoolVersion = $derived(imagePool.version);
  const upscaleStoreVersion = $derived(upscaleStore.version);
  const upscaleEnabled = $derived(upscaleStore.enabled);
  const preDecodeVersion = $derived(preDecodeCache.version);

  // 预加载状态
  type PreloadStatusType = 'decoded' | 'loaded' | 'none';
  
  let preloadStatus = $derived.by((): PreloadStatusType => {
    // 依赖 preDecodeCache.version 和 imagePool.version
    void preDecodeVersion;
    void imagePoolVersion;
    if (preDecodeCache.has(pageIndex)) return 'decoded';
    if (imagePool.has(pageIndex)) return 'loaded';
    return 'none';
  });

  // 超分状态
  type UpscaleStatusType = 'none' | 'pending' | 'processing' | 'completed' | 'skipped' | 'failed';

  let upscaleStatus = $derived.by((): UpscaleStatusType => {
    void imagePoolVersion;
    void upscaleStoreVersion;
    if (!upscaleEnabled) return 'none';
    if (imagePool.hasUpscaled(pageIndex)) return 'completed';
    const status = upscaleStore.getPageStatus(pageIndex);
    if (status === 'pending' || status === 'checking') return 'pending';
    if (status === 'processing') return 'processing';
    if (status === 'skipped') return 'skipped';
    if (status === 'failed') return 'failed';
    return 'none';
  });

  let conditionName = $derived.by(() => {
    void upscaleStoreVersion;
    if (!upscaleEnabled) return null;
    return upscaleStore.getPageConditionName(pageIndex);
  });

  let currentProgress = $derived.by(() => {
    void upscaleStoreVersion;
    if (upscaleStatus !== 'processing') return 0;
    return upscaleStore.state.pageStatus.get(pageIndex)?.progress ?? 0;
  });

  // 配置
  const preloadConfig = {
    decoded: { icon: 'zap', class: 'text-green-500', tooltip: '已预解码（翻页即时）' },
    loaded: { icon: 'download', class: 'text-blue-500', tooltip: '已预加载（需解码）' },
    none: null,
  } as const;

  const upscaleConfig = {
    none: null,
    pending: { label: '队列中', class: 'bg-amber-500/80 text-white' },
    processing: { label: '超分中', class: 'upscale-processing-badge' },
    completed: { label: '已超分', class: 'bg-green-500/80 text-white' },
    skipped: { label: '已跳过', class: 'bg-gray-500/80 text-white' },
    failed: { label: '失败', class: 'bg-red-500/80 text-white' },
  } as const;

  let preloadCfg = $derived(preloadConfig[preloadStatus]);
  let upscaleCfg = $derived(upscaleConfig[upscaleStatus]);

  // 尺寸样式
  let sizeClasses = $derived({
    pageNum: size === 'sm' ? 'text-[10px]' : 'text-xs',
    icon: size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3',
    badge: size === 'sm' ? 'px-1 text-[8px]' : 'px-1 py-0.5 text-[10px]',
    current: size === 'sm' ? 'px-1 text-[8px]' : 'px-1 py-0.5 text-[10px]',
  });
</script>

<div class="flex items-center gap-1 flex-wrap">
  <span class="{sizeClasses.pageNum} font-mono font-semibold text-primary">#{pageIndex + 1}</span>
  
  <!-- 预解码/预加载状态图标 -->
  {#if preloadCfg}
    <span class="{preloadCfg.class}" title={preloadCfg.tooltip}>
      {#if preloadCfg.icon === 'zap'}
        <Zap class="{sizeClasses.icon} fill-current" />
      {:else}
        <Download class={sizeClasses.icon} />
      {/if}
    </span>
  {/if}

  <!-- 页面名称 -->
  {#if showName && name}
    <span class="truncate flex-1 {sizeClasses.pageNum}">{name}</span>
  {/if}

  <!-- 条件名称 -->
  {#if conditionName}
    <span class="{sizeClasses.badge} font-medium rounded shrink-0 bg-purple-500/80 text-white" title="条件: {conditionName}">{conditionName}</span>
  {/if}

  <!-- 超分状态 -->
  {#if upscaleCfg}
    <span class="{sizeClasses.badge} font-medium rounded shrink-0 {upscaleCfg.class}">
      {upscaleStatus === 'processing' && currentProgress > 0 ? `超分 ${currentProgress.toFixed(1)}%` : upscaleCfg.label}
    </span>
  {/if}

  <!-- 当前页标记 -->
  {#if isCurrent}
    <span class="{sizeClasses.current} font-semibold bg-primary text-primary-foreground rounded shrink-0">当前</span>
  {/if}
</div>

<style>
  /* 超分处理中的动态进度条效果 */
  :global(.upscale-processing-badge) {
    position: relative;
    overflow: hidden;
    background: linear-gradient(90deg, hsl(217 91% 50% / 0.9), hsl(217 91% 60% / 0.9));
    color: white;
  }

  :global(.upscale-processing-badge)::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.4),
      transparent
    );
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% {
      left: -100%;
    }
    100% {
      left: 100%;
    }
  }
</style>
