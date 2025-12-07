<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Play,
		Pause,
		Volume2,
		VolumeX,
		Maximize,
		SkipBack,
		SkipForward,
		Gauge,
		Repeat,
		Repeat1,
		FastForward,
		Pin,
		PinOff
	} from '@lucide/svelte';
	import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';

	type LoopMode = 'none' | 'list' | 'single';
	type PlayerSettings = {
		volume: number;
		muted: boolean;
		playbackRate: number;
		loopMode: LoopMode;
	};

	const {
		src = '',
		videoBlob = null,
		onEnded = () => {},
		onError = (error: any) => {},
		initialTime = 0,
		onProgress = undefined,
		initialVolume = 1,
		initialPlaybackRate = 1,
		initialLoopMode = 'list' as LoopMode,
		initialMuted = false,
		onSettingsChange = () => {},
		seekMode = false,
		onSeekModeChange = () => {}
	}: {
		src?: string;
		videoBlob?: Blob | null;
		onEnded?: () => void;
		onError?: (error: any) => void;
		initialTime?: number;
		onProgress?: (currentTime: number, duration: number, ended: boolean) => void;
		initialVolume?: number;
		initialPlaybackRate?: number;
		initialLoopMode?: LoopMode;
		initialMuted?: boolean;
		onSettingsChange?: (settings: PlayerSettings) => void;
		seekMode?: boolean;
		onSeekModeChange?: (enabled: boolean) => void;
	} = $props();

	let settings = $state<NeoViewSettings>(settingsManager.getSettings());

	function handleSettingsChange(newSettings: NeoViewSettings) {
		settings = newSettings;
	}

	settingsManager.addListener(handleSettingsChange);

	let videoElement = $state<HTMLVideoElement | undefined>(undefined);
	let isPlaying = $state(false);
	let isMuted = $state(initialMuted);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(initialVolume);
	let showControls = $state(true);
	let controlsPinned = $state(false); // 固定控件不隐藏
	let playbackRate = $state(initialPlaybackRate);
	let loopMode: LoopMode = $state(initialLoopMode);
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

	$effect(() => {
		if (!videoElement) return;
		videoElement.volume = volume;
		videoElement.muted = isMuted;
		videoElement.playbackRate = playbackRate;
	});

	// 同步来自父组件的初始设置（用于外部快捷键控制）
	$effect(() => {
		if (volume !== initialVolume) {
			volume = initialVolume;
		}
		if (isMuted !== initialMuted) {
			isMuted = initialMuted;
		}
		if (playbackRate !== initialPlaybackRate) {
			const min = getMinPlaybackRate();
			const max = getMaxPlaybackRate();
			const clamped = Math.min(max, Math.max(min, initialPlaybackRate));
			playbackRate = clamped;
		}
		if (loopMode !== initialLoopMode) {
			loopMode = initialLoopMode;
			applyLoopMode();
		}
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
		emitSettings();
	}

	function handleTimeUpdate() {
		if (!videoElement) return;
		currentTime = videoElement.currentTime;
		if (onProgress) {
			const safeDuration = duration || (videoElement.duration || 0);
			onProgress(currentTime, safeDuration, false);
		}
	}

	function handleLoadedMetadata() {
		if (!videoElement) return;
		duration = videoElement.duration;
		applyLoopMode();
		// 恢复上一次的播放配置
		videoElement.playbackRate = playbackRate;
		videoElement.volume = volume;
		videoElement.muted = isMuted;
		if (initialTime && isFinite(initialTime) && initialTime > 0 && initialTime < duration) {
			videoElement.currentTime = initialTime;
		}
	}

	function handlePlay() {
		isPlaying = true;
	}

	function handlePause() {
		isPlaying = false;
	}

	function handleEnded() {
		if (loopMode === 'single') {
			// 使用原生 loop 行为，保持播放状态且不触发外部 onEnded
			return;
		}
		isPlaying = false;
		if (onProgress) {
			const safeDuration = duration || (videoElement?.duration || 0);
			onProgress(safeDuration, safeDuration, true);
		}
		if (loopMode === 'list') {
			onEnded();
		}
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
		emitSettings();
	}

	function getMinPlaybackRate() {
		return settings.image.videoMinPlaybackRate;
	}

	function getMaxPlaybackRate() {
		return settings.image.videoMaxPlaybackRate;
	}

	function getPlaybackRateStep() {
		return settings.image.videoPlaybackRateStep;
	}

	function setPlaybackRate(rate: number) {
		const min = getMinPlaybackRate();
		const max = getMaxPlaybackRate();
		const clamped = Math.min(max, Math.max(min, rate));
		playbackRate = clamped;
		if (videoElement) {
			videoElement.playbackRate = clamped;
		}
		emitSettings();
	}

	function handlePlaybackSlider(e: Event) {
		const value = parseFloat((e.target as HTMLInputElement).value);
		setPlaybackRate(value);
	}

	function emitSettings() {
		onSettingsChange({
			volume,
			muted: isMuted,
			playbackRate,
			loopMode
		});
	}

	function applyLoopMode() {
		if (!videoElement) return;
		videoElement.loop = loopMode === 'single';
	}

	function cycleLoopMode() {
		if (loopMode === 'list') {
			loopMode = 'single';
		} else if (loopMode === 'single') {
			loopMode = 'none';
		} else {
			loopMode = 'list';
		}
		applyLoopMode();
		emitSettings();
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
		// 如果控件已显示且定时器已设置，不重置定时器（避免持续移动时控件不隐藏）
		if (showControls && hideControlsTimeout) {
			return;
		}
		
		showControls = true;
		// 固定模式下不自动隐藏
		if (controlsPinned) return;
		
		if (hideControlsTimeout) {
			clearTimeout(hideControlsTimeout);
		}
		hideControlsTimeout = setTimeout(() => {
			if (isPlaying && !controlsPinned) {
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
		settingsManager.removeListener(handleSettingsChange);
	});

	// 对外暴露的控制函数，方便父组件通过 bind:this 调用
	export function playPause() {
		togglePlay();
	}

	export function seekForward() {
		skipForward();
	}

	export function seekBackward() {
		skipBackward();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="video-player-container relative flex h-full w-full items-center justify-center bg-black"
	onmousemove={handleMouseMove}
	onmouseleave={() => isPlaying && !controlsPinned && (showControls = false)}
	role="region"
	aria-label="视频播放器"
>
	{#if videoUrl}
		<video
			bind:this={videoElement}
			class="h-full w-full"
			src={videoUrl}
			autoplay
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
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="video-controls absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300"
			class:opacity-0={!showControls}
			class:opacity-100={showControls}
			data-video-controls="true"
			onclick={(event) => event.stopPropagation()}
			onmousedown={(event) => event.stopPropagation()}
			onmousemove={() => {
				// 控件区域内移动时也保持显示并刷新定时器
				showControls = true;
				if (hideControlsTimeout) {
					clearTimeout(hideControlsTimeout);
					hideControlsTimeout = null;
				}
			}}
			onmouseenter={() => {
				// 鼠标进入控件区域时清除隐藏定时器，保持控件显示
				if (hideControlsTimeout) {
					clearTimeout(hideControlsTimeout);
					hideControlsTimeout = null;
				}
				showControls = true;
			}}
			onmouseleave={() => {
				// 鼠标离开控件区域时，如果正在播放且未固定，启动隐藏定时器
				if (isPlaying && !controlsPinned) {
					hideControlsTimeout = setTimeout(() => {
						showControls = false;
					}, 2000);
				}
			}}
			role="group"
			aria-label="视频控制栏"
		>
			<!-- 进度条 -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="progress-bar mb-4 h-0.5 w-full cursor-pointer rounded-full bg-primary/40 transition-all hover:h-1"
				onclick={seek}
				role="presentation"
			>
				<div
					class="progress-fill h-full rounded-full bg-primary"
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
						<Pause class="h-6 w-6 text-primary" />
					{:else}
						<Play class="h-6 w-6 text-primary" />
					{/if}
				</button>

				<!-- 快退 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={skipBackward}
					aria-label="后退10秒"
				>
					<SkipBack class="h-5 w-5 text-primary" />
				</button>

				<!-- 快进 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={skipForward}
					aria-label="前进10秒"
				>
					<SkipForward class="h-5 w-5 text-primary" />
				</button>

				<!-- 循环模式 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={(event) => {
						event.stopPropagation();
						cycleLoopMode();
					}}
					aria-label={
						loopMode === 'none'
							? '不循环'
							: loopMode === 'single'
								? '单个循环'
								: '列表循环'
					}
				>
					{#if loopMode === 'single'}
						<Repeat1 class="h-5 w-5 text-primary" />
					{:else if loopMode === 'list'}
						<Repeat class="h-5 w-5 text-primary" />
					{:else}
						<Repeat class="h-5 w-5 text-primary opacity-40" />
					{/if}
				</button>

				<!-- 时间显示 -->
				<div class="time-display text-sm text-primary">
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
							<VolumeX class="h-5 w-5 text-primary" />
						{:else}
							<Volume2 class="h-5 w-5 text-primary" />
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

				<!-- 倍速 -->
				<div class="playback-rate flex items-center gap-2 text-xs text-primary">
					<button
						class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
						onclick={(event) => {
							event.stopPropagation();
							setPlaybackRate(1);
						}}
						aria-label="重置为1倍速"
					>
						<Gauge class="h-5 w-5 text-primary" />
					</button>
					<input
						type="range"
						min={getMinPlaybackRate()}
						max={getMaxPlaybackRate()}
						step={getPlaybackRateStep()}
						value={playbackRate}
						oninput={handlePlaybackSlider}
						class="playback-slider w-28"
					/>
					<div class="w-10 text-right">
						{playbackRate.toFixed(2)}x
					</div>
				</div>

				<!-- 快进模式 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {seekMode ? 'bg-white/30' : ''}"
					onclick={(event) => {
						event.stopPropagation();
						onSeekModeChange(!seekMode);
					}}
					aria-label={seekMode ? '关闭快进模式' : '开启快进模式（翻页键变为快进/快退）'}
					title={seekMode ? '快进模式已开启' : '开启快进模式'}
				>
					<FastForward class="h-5 w-5 text-primary {seekMode ? '' : 'opacity-40'}" />
				</button>

				<!-- 固定控件 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {controlsPinned ? 'bg-white/30' : ''}"
					onclick={(event) => {
						event.stopPropagation();
						controlsPinned = !controlsPinned;
					}}
					aria-label={controlsPinned ? '取消固定控件' : '固定控件'}
					title={controlsPinned ? '控件已固定' : '固定控件'}
				>
					{#if controlsPinned}
						<Pin class="h-5 w-5 text-primary" />
					{:else}
						<PinOff class="h-5 w-5 text-primary opacity-40" />
					{/if}
				</button>

				<!-- 全屏 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20"
					onclick={toggleFullscreen}
					aria-label="全屏"
				>
					<Maximize class="h-5 w-5 text-primary" />
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
		position: relative;
	}

	/* 视频控件使用更高的 z-index，覆盖手势层 (z-index: 90) */
	.video-controls {
		z-index: 91;
		pointer-events: auto;
	}

	.volume-slider {
		accent-color: var(--primary);
	}

	.playback-slider {
		accent-color: var(--primary);
	}

	.progress-bar {
		position: relative;
	}

	.progress-fill {
		pointer-events: none;
	}
</style>
