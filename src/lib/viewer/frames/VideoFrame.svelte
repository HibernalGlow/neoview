<!--
  VideoFrame - 视频帧组件
  
  功能：
  - 视频播放
  - 支持原生控件
  - 支持自定义控件区域
-->
<script lang="ts">
  interface Props {
    /** 视频 URL */
    src: string;
    /** 视频类型 */
    type?: string;
    /** 自动播放 */
    autoplay?: boolean;
    /** 循环播放 */
    loop?: boolean;
    /** 静音 */
    muted?: boolean;
    /** 音量 (0-1) */
    volume?: number;
    /** 播放速率 */
    playbackRate?: number;
    /** 起始时间 */
    startTime?: number;
    /** 显示控件 */
    controls?: boolean;
    /** 播放结束回调 */
    onEnded?: () => void;
    /** 时间更新回调 */
    onTimeUpdate?: (currentTime: number, duration: number) => void;
    /** 加载完成回调 */
    onLoadedMetadata?: (duration: number) => void;
    /** 错误回调 */
    onError?: (error: string) => void;
  }

  let {
    src,
    type = 'video/mp4',
    autoplay = true,
    loop = false,
    muted = false,
    volume = 1,
    playbackRate = 1,
    startTime = 0,
    controls = true,
    onEnded,
    onTimeUpdate,
    onLoadedMetadata,
    onError,
  }: Props = $props();

  let videoRef: HTMLVideoElement | null = $state(null);

  // 同步音量和播放速率
  $effect(() => {
    if (videoRef) {
      videoRef.volume = volume;
      videoRef.playbackRate = playbackRate;
      videoRef.muted = muted;
    }
  });

  // 设置起始时间
  $effect(() => {
    if (videoRef && startTime > 0) {
      videoRef.currentTime = startTime;
    }
  });

  function handleLoadedMetadata() {
    if (videoRef) {
      onLoadedMetadata?.(videoRef.duration);
    }
  }

  function handleTimeUpdate() {
    if (videoRef) {
      onTimeUpdate?.(videoRef.currentTime, videoRef.duration);
    }
  }

  function handleEnded() {
    onEnded?.();
  }

  function handleError(event: Event) {
    const video = event.target as HTMLVideoElement;
    const error = video.error?.message || 'Unknown video error';
    onError?.(error);
  }

  // 导出方法供外部调用
  export function play() {
    videoRef?.play();
  }

  export function pause() {
    videoRef?.pause();
  }

  export function playPause() {
    if (videoRef) {
      if (videoRef.paused) {
        videoRef.play();
      } else {
        videoRef.pause();
      }
    }
  }

  export function seekForward(seconds: number = 5) {
    if (videoRef) {
      videoRef.currentTime = Math.min(videoRef.duration, videoRef.currentTime + seconds);
    }
  }

  export function seekBackward(seconds: number = 5) {
    if (videoRef) {
      videoRef.currentTime = Math.max(0, videoRef.currentTime - seconds);
    }
  }

  export function seek(time: number) {
    if (videoRef) {
      videoRef.currentTime = Math.max(0, Math.min(videoRef.duration, time));
    }
  }
</script>

<div class="video-frame">
  <video
    bind:this={videoRef}
    {src}
    {autoplay}
    {loop}
    {controls}
    onloadedmetadata={handleLoadedMetadata}
    ontimeupdate={handleTimeUpdate}
    onended={handleEnded}
    onerror={handleError}
  >
    <source {src} {type} />
    您的浏览器不支持视频播放
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
