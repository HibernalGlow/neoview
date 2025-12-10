<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	/**
	 * 轻量级背景视频组件
	 * 专门用于 Empty 状态的装饰性背景播放
	 */
	let {
		src = '',
		opacity = 0.3,
		blur = 0,
		objectFit = 'cover' as 'cover' | 'contain' | 'fill',
		playbackRate = 1.0,
		onLoaded = () => {},
		onError = (error: any) => {}
	}: {
		src?: string;
		opacity?: number; // 0-1
		blur?: number; // px
		objectFit?: 'cover' | 'contain' | 'fill';
		playbackRate?: number;
		onLoaded?: () => void;
		onError?: (error: any) => void;
	} = $props();

	let videoElement = $state<HTMLVideoElement | undefined>(undefined);
	let isLoaded = $state(false);
	let videoUrl = $state<string>('');

	// 当 src 改变时更新 videoUrl
	$effect(() => {
		if (src) {
			videoUrl = src;
		}
	});

	// 更新播放速率
	$effect(() => {
		if (videoElement && isLoaded) {
			videoElement.playbackRate = playbackRate;
		}
	});

	function handleLoadedMetadata() {
		isLoaded = true;
		if (videoElement) {
			videoElement.playbackRate = playbackRate;
		}
		onLoaded();
	}

	function handleError(e: Event) {
		console.error('背景视频加载失败:', e);
		onError(e);
	}

	// 确保视频播放（某些浏览器可能阻止自动播放）
	async function ensurePlay() {
		if (!videoElement) return;
		
		try {
			await videoElement.play();
		} catch (err) {
			console.warn('背景视频自动播放被阻止:', err);
		}
	}

	onMount(() => {
		// 组件挂载后尝试播放
		if (videoElement && src) {
			ensurePlay();
		}
	});

	onDestroy(() => {
		// 清理
		if (videoElement) {
			videoElement.pause();
			videoElement.src = '';
		}
	});
</script>

<!-- 背景视频容器 -->
<div
	class="absolute inset-0 overflow-hidden"
	style="opacity: {opacity}; filter: blur({blur}px);"
>
	{#if videoUrl}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={videoElement}
			class="h-full w-full transition-opacity duration-500"
			class:opacity-0={!isLoaded}
			class:opacity-100={isLoaded}
			style="object-fit: {objectFit};"
			src={videoUrl}
			autoplay
			loop
			muted
			playsinline
			onloadedmetadata={handleLoadedMetadata}
			onerror={handleError}
		>
			<!-- 浏览器不支持视频时的提示 -->
			您的浏览器不支持视频播放
		</video>
	{/if}
</div>

<style>
	/* 确保视频在 iOS Safari 等设备上正常工作 */
	video {
		pointer-events: none;
	}

	/* 平滑的加载过渡 */
	video {
		transition: opacity 0.5s ease-in-out;
	}
</style>
