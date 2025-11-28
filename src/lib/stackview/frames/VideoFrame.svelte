<!--
  VideoFrame - 视频帧布局
  
  功能：
  - 显示视频播放器
  - 支持原生控件
  - 支持自定义控件（TODO）
-->
<script lang="ts">
  let {
    src,
    autoplay = false,
    loop = false,
    muted = false,
    controls = true,
    onEnded,
    onTimeUpdate,
    onLoadedMetadata,
  }: {
    src: string;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    controls?: boolean;
    onEnded?: () => void;
    onTimeUpdate?: (currentTime: number, duration: number) => void;
    onLoadedMetadata?: (duration: number) => void;
  } = $props();
  
  let videoRef: HTMLVideoElement | null = $state(null);
  
  function handleTimeUpdate() {
    if (videoRef && onTimeUpdate) {
      onTimeUpdate(videoRef.currentTime, videoRef.duration);
    }
  }
  
  function handleLoadedMetadata() {
    if (videoRef && onLoadedMetadata) {
      onLoadedMetadata(videoRef.duration);
    }
  }
  
  // 导出方法供外部调用
  export function play() {
    videoRef?.play();
  }
  
  export function pause() {
    videoRef?.pause();
  }
  
  export function seek(time: number) {
    if (videoRef) {
      videoRef.currentTime = time;
    }
  }
</script>

<div class="video-frame">
  <video
    bind:this={videoRef}
    {src}
    {autoplay}
    {loop}
    {muted}
    {controls}
    onended={onEnded}
    ontimeupdate={handleTimeUpdate}
    onloadedmetadata={handleLoadedMetadata}
  >
    <track kind="captions" />
  </video>
</div>

<style>
  .video-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  
  video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
