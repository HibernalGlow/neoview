<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward } from '@lucide/svelte';

	const {
		src = '',
		videoBlob = null,
		onEnded = () => {},
		onError = (error: any) => {}
	}: {
		src?: string;
		videoBlob?: Blob | null;
		onEnded?: () => void;
		onError?: (error: any) => void;
	} = $props();

	let videoElement = $state<HTMLVideoElement | undefined>(undefined);
	let isPlaying = $state(false);
	let isMuted = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let showControls = $state(true);
	let hideControlsTimeout: ReturnType<typeof setTimeout> | null = null;
	let videoUrl = $state<string>('');

	// 当有新的 blob 时创建 URL
	$effect(() => {
		if (videoBlob) {
			// 清理旧的 URL
			if (videoUrl && !src) {
				URL.revokeObjectURL(videoUrl);
			}
			videoUrl = URL.createObjectURL(videoBlob);
		} else if (src) {
			videoUrl = src;
		}

		return () => {
			// 清理时撤销 URL
			if (videoUrl && !src) {
				URL.revokeObjectURL(videoUrl);
			}
		};
	});

	function togglePlay() {
		if (!videoElement) return;

		if (isPlaying) {
			videoElement.pause();
		} else {
			videoElement.play();
		}
	}

	function toggleMute() {
		if (!videoElement) return;
		isMuted = !isMuted;
		videoElement.muted = isMuted;
	}

	function handleTimeUpdate() {
		if (!videoElement) return;
		currentTime = videoElement.currentTime;
	}

	function handleLoadedMetadata() {
		if (!videoElement) return;
		duration = videoElement.duration;
	}

	function handlePlay() {
		isPlaying = true;
	}

	function handlePause() {
		isPlaying = false;
	}

	function handleEnded() {
		isPlaying = false;
		onEnded();
	}

	function handleError(e: Event) {
		console.error('视频播放错误:', e);
		onError(e);
	}

	function seek(e: MouseEvent) {
		if (!videoElement) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const pos = (e.clientX - rect.left) / rect.width;
		videoElement.currentTime = pos * duration;
	}

	function changeVolume(e: Event) {
		if (!videoElement) return;
		const value = parseFloat((e.target as HTMLInputElement).value);
		volume = value;
		videoElement.volume = value;
		isMuted = value === 0;
	}

	function skipForward() {
		if (!videoElement) return;
		videoElement.currentTime = Math.min(videoElement.currentTime + 10, duration);
	}

	function skipBackward() {
		if (!videoElement) return;
		videoElement.currentTime = Math.max(videoElement.currentTime - 10, 0);
	}

	function toggleFullscreen() {
		if (!videoElement) return;
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			videoElement.requestFullscreen();
		}
	}

	function formatTime(seconds: number): string {
		if (!isFinite(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function handleMouseMove() {
		showControls = true;
		if (hideControlsTimeout) {
			clearTimeout(hideControlsTimeout);
		}
		hideControlsTimeout = setTimeout(() => {
			if (isPlaying) {
				showControls = false;
			}
		}, 3000);
	}

	onDestroy(() => {
		if (hideControlsTimeout) {
			clearTimeout(hideControlsTimeout);
		}
		if (videoUrl && !src) {
			URL.revokeObjectURL(videoUrl);
		}
	});
</script>

<div
	class="video-player-container relative flex h-full w-full items-center justify-center bg-black"
	onmousemove={handleMouseMove}
	onmouseleave={() => isPlaying && (showControls = false)}
>
	{#if videoUrl}
		<video
			bind:this={videoElement}
			class="h-full w-full"
			src={videoUrl}
			ontimeupdate={handleTimeUpdate}
			onloadedmetadata={handleLoadedMetadata}
			onplay={handlePlay}
			onpause={handlePause}
			onended={handleEnded}
			onerror={handleError}
		>
			<track kind="captions" />
		</video>

		<!-- 控制栏 -->
		<div
			class="video-controls absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300"
			class:opacity-0={!showControls}
			class:opacity-100={showControls}
		>
			<!-- 进度条 -->
			<div
				class="progress-bar mb-4 h-1 w-full cursor-pointer rounded-full bg-white/30 transition-all hover:h-2"
				onclick={seek}
			>
				<div
					class="progress-fill h-full rounded-full bg-blue-500"
					style="width: {duration > 0 ? (currentTime / duration) * 100 : 0}%"
				></div>
			</div>

			<!-- 控制按钮 -->
			<div class="controls-row flex items-center gap-4">
				<!-- 播放/暂停 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={togglePlay}
					aria-label={isPlaying ? '暂停' : '播放'}
				>
					{#if isPlaying}
						<Pause class="h-6 w-6 text-white" />
					{:else}
						<Play class="h-6 w-6 text-white" />
					{/if}
				</button>

				<!-- 快退 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={skipBackward}
					aria-label="后退10秒"
				>
					<SkipBack class="h-5 w-5 text-white" />
				</button>

				<!-- 快进 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={skipForward}
					aria-label="前进10秒"
				>
					<SkipForward class="h-5 w-5 text-white" />
				</button>

				<!-- 时间显示 -->
				<div class="time-display text-sm text-white">
					{formatTime(currentTime)} / {formatTime(duration)}
				</div>

				<div class="flex-1"></div>

				<!-- 音量控制 -->
				<div class="volume-control flex items-center gap-2">
					<button
						class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
						onclick={toggleMute}
						aria-label={isMuted ? '取消静音' : '静音'}
					>
						{#if isMuted || volume === 0}
							<VolumeX class="h-5 w-5 text-white" />
						{:else}
							<Volume2 class="h-5 w-5 text-white" />
						{/if}
					</button>
					<input
						type="range"
						min="0"
						max="1"
						step="0.1"
						value={volume}
						oninput={changeVolume}
						class="volume-slider w-20"
					/>
				</div>

				<!-- 全屏 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={toggleFullscreen}
					aria-label="全屏"
				>
					<Maximize class="h-5 w-5 text-white" />
				</button>
			</div>
		</div>
	{:else}
		<div class="text-white">加载视频中...</div>
	{/if}
</div>

<style>
	.video-player-container {
		user-select: none;
	}

	.volume-slider {
		accent-color: white;
	}

	.progress-bar {
		position: relative;
	}

	.progress-fill {
		pointer-events: none;
	}
</style>
