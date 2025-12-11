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
		PinOff,
		Captions,
		CaptionsOff,
		PictureInPicture2,
		Camera,
		RotateCcw,
		Sun,
		RefreshCw,
		MoreVertical
	} from '@lucide/svelte';
	import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
	import type { SubtitleData } from '$lib/utils/subtitleUtils';
	import { infoPanelStore } from '$lib/stores/infoPanel.svelte';

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
		onSeekModeChange = () => {},
		subtitle = null,
		onSelectSubtitle = undefined
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
		subtitle?: SubtitleData | null;
		onSelectSubtitle?: () => void;
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
	let videoUrl = $state<string>(src || '');

	// 进度条预览状态
	let progressBarRef = $state<HTMLDivElement | null>(null);
	let previewVisible = $state(false);
	let previewTime = $state(0);
	let previewX = $state(0);
	let previewCanvas = $state<HTMLCanvasElement | null>(null);
	let previewGenerating = $state(false);
	
	// 帧缓存：key 为时间戳（精确到0.5秒），value 为 dataURL
	const frameCache = new Map<number, string>();
	const CACHE_PRECISION = 0.5; // 缓存精度：0.5秒
	const MAX_CACHE_SIZE = 100; // 最大缓存帧数
	
	// 复用的临时 video 元素
	let tempVideoElement: HTMLVideoElement | null = null;

	// 截图功能
	let screenshotCanvas: HTMLCanvasElement | null = null;
	
	// AB循环
	let abLoop = $state<{ a: number | null; b: number | null }>({ a: null, b: null });
	let abLoopActive = $derived(abLoop.a !== null && abLoop.b !== null);
	
	// 视频滤镜
	let showFilterPanel = $state(false);
	let brightness = $state(100); // 0-200, 100 = 正常
	let contrast = $state(100);   // 0-200, 100 = 正常
	let saturate = $state(100);   // 0-200, 100 = 正常
	
	// 更多菜单
	let showMoreMenu = $state(false);
	
	// 音量/倍速展开面板
	let showVolumePanel = $state(false);
	let showRatePanel = $state(false);
	
	// 字幕设置 - 从 settings 读取初始值
	let showSubtitleSettings = $state(false);
	let subtitleFontSize = $state(settings.subtitle?.fontSize ?? 1.0); // em 单位
	let subtitleColor = $state(settings.subtitle?.color ?? '#ffffff');
	let subtitleBgOpacity = $state(settings.subtitle?.bgOpacity ?? 0.7);
	let subtitleBottom = $state(settings.subtitle?.bottom ?? 5); // 底部距离百分比

	// 自定义字幕渲染状态
	let currentSubtitleText = $state<string>('');

	// 保存字幕设置
	function saveSubtitleSettings() {
		settingsManager.updateSettings({
			subtitle: {
				fontSize: subtitleFontSize,
				color: subtitleColor,
				bgOpacity: subtitleBgOpacity,
				bottom: subtitleBottom
			}
		});
	}

	// 监听字幕轨道变化，获取当前字幕文本
	$effect(() => {
		if (!videoElement || !subtitle?.vttUrl) {
			currentSubtitleText = '';
			return;
		}

		const track = videoElement.textTracks[0];
		if (!track) return;

		// 隐藏原生字幕渲染，使用自定义渲染
		track.mode = 'hidden';

		const handleCueChange = () => {
			const activeCues = track.activeCues;
			if (activeCues && activeCues.length > 0) {
				const texts: string[] = [];
				for (let i = 0; i < activeCues.length; i++) {
					const cue = activeCues[i] as VTTCue;
					if (cue.text) {
						texts.push(cue.text);
					}
				}
				currentSubtitleText = texts.join('\n');
			} else {
				currentSubtitleText = '';
			}
		};

		track.addEventListener('cuechange', handleCueChange);

		return () => {
			track.removeEventListener('cuechange', handleCueChange);
		};
	});

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
		
		// 更新信息面板 - 视频元数据
		const fileName = src ? src.split('/').pop()?.split('\\').pop() || 'video' : 'video';
		infoPanelStore.setImageInfo({
			path: src || '',
			name: fileName,
			isVideo: true,
			width: videoElement.videoWidth,
			height: videoElement.videoHeight,
			duration: videoElement.duration
		});
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

	// 进度条悬浮预览
	function handleProgressHover(e: MouseEvent) {
		if (!videoElement || !duration) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		previewTime = pos * duration;
		previewX = e.clientX - rect.left;
		previewVisible = true;
		
		// 生成预览帧
		generatePreviewFrame(previewTime);
	}

	function handleProgressLeave() {
		previewVisible = false;
	}

	// 生成预览帧缩略图（带缓存）
	let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	
	function getCacheKey(time: number): number {
		return Math.round(time / CACHE_PRECISION) * CACHE_PRECISION;
	}
	
	function generatePreviewFrame(time: number) {
		if (!videoElement || !previewCanvas) return;
		
		const cacheKey = getCacheKey(time);
		
		// 检查缓存
		if (frameCache.has(cacheKey)) {
			const cachedDataUrl = frameCache.get(cacheKey)!;
			const img = new Image();
			img.onload = () => {
				const ctx = previewCanvas?.getContext('2d');
				if (ctx && previewCanvas) {
					previewCanvas.width = img.width;
					previewCanvas.height = img.height;
					ctx.drawImage(img, 0, 0);
				}
			};
			img.src = cachedDataUrl;
			return;
		}
		
		// 防抖，避免频繁生成
		if (previewDebounceTimer) {
			clearTimeout(previewDebounceTimer);
		}
		
		previewDebounceTimer = setTimeout(() => {
			if (!videoElement || !previewCanvas || previewGenerating) return;
			
			previewGenerating = true;
			
			// 复用或创建临时 video 元素
			if (!tempVideoElement) {
				tempVideoElement = document.createElement('video');
				tempVideoElement.crossOrigin = 'anonymous';
				tempVideoElement.muted = true;
				tempVideoElement.preload = 'metadata';
			}
			
			// 如果 src 变了才更新
			if (tempVideoElement.src !== videoUrl) {
				tempVideoElement.src = videoUrl;
			}
			
			const handleSeeked = () => {
				try {
					const ctx = previewCanvas?.getContext('2d');
					if (ctx && previewCanvas && tempVideoElement) {
						// 计算缩略图尺寸，保持宽高比
						const videoRatio = tempVideoElement.videoWidth / tempVideoElement.videoHeight;
						const canvasWidth = 160;
						const canvasHeight = Math.round(canvasWidth / videoRatio);
						previewCanvas.width = canvasWidth;
						previewCanvas.height = canvasHeight;
						ctx.drawImage(tempVideoElement, 0, 0, canvasWidth, canvasHeight);
						
						// 存入缓存
						try {
							const dataUrl = previewCanvas.toDataURL('image/jpeg', 0.7);
							// 控制缓存大小
							if (frameCache.size >= MAX_CACHE_SIZE) {
								const firstKey = frameCache.keys().next().value;
								if (firstKey !== undefined) frameCache.delete(firstKey);
							}
							frameCache.set(cacheKey, dataUrl);
						} catch (e) {
							// 跨域视频可能无法 toDataURL，忽略缓存
						}
					}
				} catch (err) {
					console.warn('生成预览帧失败:', err);
				} finally {
					previewGenerating = false;
					tempVideoElement?.removeEventListener('seeked', handleSeeked);
				}
			};
			
			tempVideoElement.addEventListener('seeked', handleSeeked, { once: true });
			tempVideoElement.addEventListener('error', () => {
				previewGenerating = false;
			}, { once: true });
			
			tempVideoElement.currentTime = time;
		}, 30); // 30ms 防抖（更快响应）
	}
	
	// 清理帧缓存（视频切换时调用）
	function clearFrameCache() {
		frameCache.clear();
		if (tempVideoElement) {
			tempVideoElement.src = '';
			tempVideoElement = null;
		}
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

	// 画中画状态
	let isPiP = $state(false);
	
	async function togglePictureInPicture() {
		if (!videoElement) return;
		
		try {
			if (document.pictureInPictureElement) {
				await document.exitPictureInPicture();
				isPiP = false;
			} else if (document.pictureInPictureEnabled) {
				await videoElement.requestPictureInPicture();
				isPiP = true;
			}
		} catch (err) {
			console.warn('画中画切换失败:', err);
		}
	}
	
	// 监听画中画状态变化
	$effect(() => {
		const video = videoElement;
		if (!video) return;
		
		const handleEnterPiP = () => { isPiP = true; };
		const handleLeavePiP = () => { isPiP = false; };
		
		video.addEventListener('enterpictureinpicture', handleEnterPiP);
		video.addEventListener('leavepictureinpicture', handleLeavePiP);
		
		return () => {
			video.removeEventListener('enterpictureinpicture', handleEnterPiP);
			video.removeEventListener('leavepictureinpicture', handleLeavePiP);
		};
	});

	// === 截图功能 ===
	async function captureScreenshot() {
		if (!videoElement) return;
		
		const canvas = document.createElement('canvas');
		canvas.width = videoElement.videoWidth;
		canvas.height = videoElement.videoHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		
		ctx.drawImage(videoElement, 0, 0);
		
		try {
			const blob = await new Promise<Blob | null>((resolve) => 
				canvas.toBlob(resolve, 'image/png')
			);
			if (!blob) return;
			
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `screenshot_${formatTime(currentTime).replace(':', '-')}.png`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.warn('截图失败:', err);
		}
	}

	// === AB循环功能 ===
	function setLoopPointA() {
		if (!videoElement) return;
		abLoop = { ...abLoop, a: currentTime };
	}
	
	function setLoopPointB() {
		if (!videoElement) return;
		if (abLoop.a !== null && currentTime > abLoop.a) {
			abLoop = { ...abLoop, b: currentTime };
		}
	}
	
	function clearAbLoop() {
		abLoop = { a: null, b: null };
	}
	
	// AB循环时间检测
	$effect(() => {
		if (!videoElement || !abLoopActive) return;
		
		const checkAbLoop = () => {
			if (abLoop.a !== null && abLoop.b !== null) {
				if (videoElement!.currentTime >= abLoop.b) {
					videoElement!.currentTime = abLoop.a;
				}
			}
		};
		
		videoElement.addEventListener('timeupdate', checkAbLoop);
		return () => videoElement?.removeEventListener('timeupdate', checkAbLoop);
	});

	// === 视频滤镜 ===
	let videoFilter = $derived(
		`brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`
	);
	
	function resetFilters() {
		brightness = 100;
		contrast = 100;
		saturate = 100;
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
	style="--subtitle-font-size: {subtitleFontSize}em; --subtitle-color: {subtitleColor}; --subtitle-bg: rgba(0, 0, 0, {subtitleBgOpacity}); --subtitle-bottom: {subtitleBottom}%;"
	onmousemove={handleMouseMove}
	onmouseleave={() => isPlaying && !controlsPinned && (showControls = false)}
	role="region"
	aria-label="视频播放器"
>
	{#if videoUrl}
		<video
			bind:this={videoElement}
			class="h-full w-full"
			style="filter: {videoFilter};"
			src={videoUrl}
			autoplay
			ontimeupdate={handleTimeUpdate}
			onloadedmetadata={handleLoadedMetadata}
			onplay={handlePlay}
			onpause={handlePause}
			onended={handleEnded}
			onerror={handleError}
			crossorigin="anonymous"
		>
			{#if subtitle?.vttUrl}
				<track kind="subtitles" src={subtitle.vttUrl} srclang="zh" label="字幕" default />
			{:else}
				<track kind="captions" />
			{/if}
		</video>

		<!-- 自定义字幕渲染层 -->
		{#if currentSubtitleText}
			<div
				class="pointer-events-none absolute left-0 right-0 flex justify-center px-4"
				style="bottom: {subtitleBottom}%;"
			>
				<div
					class="max-w-[80%] whitespace-pre-wrap rounded px-3 py-1 text-center"
					style="
						font-size: {subtitleFontSize}em;
						color: {subtitleColor};
						background-color: rgba(0, 0, 0, {subtitleBgOpacity});
						text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
						line-height: 1.4;
					"
				>
					{@html currentSubtitleText.replace(/\n/g, '<br>')}
				</div>
			</div>
		{/if}

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
				bind:this={progressBarRef}
				class="progress-bar relative mb-4 h-1 w-full cursor-pointer rounded-full bg-primary/40 transition-all hover:h-1.5"
				onclick={seek}
				onmousemove={handleProgressHover}
				onmouseleave={handleProgressLeave}
				role="presentation"
			>
				<div
					class="progress-fill h-full rounded-full bg-primary"
					style="width: {duration > 0 ? (currentTime / duration) * 100 : 0}%"
				></div>
				
				<!-- 进度条预览提示 -->
				{#if previewVisible && duration > 0}
					<div
						class="preview-tooltip absolute bottom-full mb-2 -translate-x-1/2 transform"
						style="left: {Math.max(80, Math.min(previewX, (progressBarRef?.offsetWidth ?? 0) - 80))}px;"
					>
						<!-- 预览缩略图 -->
						<div class="preview-frame mb-1 overflow-hidden rounded border border-white/20 bg-black shadow-lg">
							<canvas
								bind:this={previewCanvas}
								class="preview-canvas"
								width="160"
								height="90"
							></canvas>
						</div>
						<!-- 时间显示 -->
						<div class="preview-time rounded bg-black/80 px-2 py-0.5 text-center text-xs text-white">
							{formatTime(previewTime)}
						</div>
					</div>
				{/if}
			</div>

			<!-- 控制按钮（响应式：窄屏时缩小间距） -->
			<div class="controls-row flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4">
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

				<!-- 更多功能菜单 -->
				<div class="relative">
					<button
						class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {showMoreMenu || abLoopActive ? 'bg-white/20' : ''}"
						onclick={(event) => {
							event.stopPropagation();
							showMoreMenu = !showMoreMenu;
						}}
						title="更多功能"
						aria-label="更多功能"
					>
						<MoreVertical class="h-5 w-5 text-primary" />
					</button>

					{#if showMoreMenu}
						<div
							class="absolute bottom-full left-0 mb-2 w-48 rounded-lg bg-black/95 p-2 shadow-lg backdrop-blur-sm"
							onclick={(e) => e.stopPropagation()}
							onmousedown={(e) => e.stopPropagation()}
						>
							<!-- 截图 -->
							<button
								class="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-white hover:bg-white/10"
								onclick={() => {
									captureScreenshot();
									showMoreMenu = false;
								}}
							>
								<Camera class="h-4 w-4" />
								截图
							</button>

							<!-- AB循环 -->
							<div class="border-t border-white/10 pt-2 mt-2">
								<div class="px-3 py-1 text-xs text-white/50">AB循环</div>
								<div class="flex items-center gap-1 px-3 py-1">
									<button
										class="rounded px-3 py-1 text-xs transition-colors {abLoop.a !== null ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}"
										onclick={() => setLoopPointA()}
									>
										A{abLoop.a !== null ? `: ${formatTime(abLoop.a)}` : ''}
									</button>
									<button
										class="rounded px-3 py-1 text-xs transition-colors {abLoop.b !== null ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}"
										onclick={() => setLoopPointB()}
										disabled={abLoop.a === null}
									>
										B{abLoop.b !== null ? `: ${formatTime(abLoop.b)}` : ''}
									</button>
									{#if abLoopActive}
										<button
											class="rounded bg-white/10 p-1 text-xs text-white hover:bg-white/20"
											onclick={() => clearAbLoop()}
											title="清除"
										>
											<RotateCcw class="h-3 w-3" />
										</button>
									{/if}
								</div>
							</div>

							<!-- 滤镜 -->
							<div class="border-t border-white/10 pt-2 mt-2">
								<button
									class="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-sm text-white hover:bg-white/10"
									onclick={() => {
										showFilterPanel = !showFilterPanel;
									}}
								>
									<span class="flex items-center gap-2">
										<Sun class="h-4 w-4" />
										视频滤镜
									</span>
									{#if brightness !== 100 || contrast !== 100 || saturate !== 100}
										<span class="text-xs text-primary">已调整</span>
									{/if}
								</button>
								
								{#if showFilterPanel}
									<div class="px-3 py-2 space-y-2">
										<div>
											<div class="flex justify-between text-xs text-white/70 mb-1">
												<span>亮度</span><span>{brightness}%</span>
											</div>
											<input type="range" min="0" max="200" step="5" bind:value={brightness}
												class="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer" />
										</div>
										<div>
											<div class="flex justify-between text-xs text-white/70 mb-1">
												<span>对比度</span><span>{contrast}%</span>
											</div>
											<input type="range" min="0" max="200" step="5" bind:value={contrast}
												class="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer" />
										</div>
										<div>
											<div class="flex justify-between text-xs text-white/70 mb-1">
												<span>饱和度</span><span>{saturate}%</span>
											</div>
											<input type="range" min="0" max="200" step="5" bind:value={saturate}
												class="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer" />
										</div>
										<button
											class="w-full rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
											onclick={resetFilters}
										>
											重置滤镜
										</button>
									</div>
								{/if}
							</div>

							<!-- 视频信息 -->
							<div class="border-t border-white/10 pt-2 mt-2">
								<div class="px-3 py-1 text-xs text-white/50">视频信息</div>
								<div class="px-3 py-1 space-y-1 text-xs text-white/80">
									{#if videoElement}
										<div class="flex justify-between">
											<span>分辨率</span>
											<span>{videoElement.videoWidth}×{videoElement.videoHeight}</span>
										</div>
										<div class="flex justify-between">
											<span>时长</span>
											<span>{formatTime(duration)}</span>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- 时间显示 -->
				<div class="time-display text-sm text-primary">
					{formatTime(currentTime)} / {formatTime(duration)}
				</div>

				<div class="flex-1"></div>

				<!-- 音量控制（点击展开） -->
				<div class="relative">
					<button
						class="control-btn flex items-center gap-1 rounded-full px-2 py-1.5 transition-colors hover:bg-white/20 {showVolumePanel ? 'bg-white/20' : ''}"
						onclick={(e) => {
							e.stopPropagation();
							showVolumePanel = !showVolumePanel;
							showRatePanel = false;
						}}
						aria-label="音量控制"
						title="点击展开音量调节"
					>
						{#if isMuted || volume === 0}
							<VolumeX class="h-4 w-4 text-primary" />
						{:else}
							<Volume2 class="h-4 w-4 text-primary" />
						{/if}
						<span class="text-xs text-primary">{Math.round(volume * 100)}%</span>
					</button>
					{#if showVolumePanel}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="absolute bottom-full right-0 mb-2 rounded-lg bg-black/95 p-3 shadow-lg"
							style="min-width: 140px;"
							onclick={(e) => e.stopPropagation()}
							onmousedown={(e) => e.stopPropagation()}>
							<div class="flex items-center gap-2">
								<button onclick={toggleMute} class="shrink-0 p-1 hover:bg-white/20 rounded">
									{#if isMuted || volume === 0}
										<VolumeX class="h-4 w-4 text-white" />
									{:else}
										<Volume2 class="h-4 w-4 text-white" />
									{/if}
								</button>
								<input type="range" min="0" max="1" step="0.05" value={volume}
									oninput={changeVolume}
									class="w-20 h-1 bg-white/20 rounded appearance-none cursor-pointer" />
							</div>
						</div>
					{/if}
				</div>

				<!-- 倍速控制（点击展开） -->
				<div class="relative">
					<button
						class="control-btn flex items-center gap-1 rounded-full px-2 py-1.5 transition-colors hover:bg-white/20 {showRatePanel ? 'bg-white/20' : ''}"
						onclick={(e) => {
							e.stopPropagation();
							showRatePanel = !showRatePanel;
							showVolumePanel = false;
						}}
						aria-label="倍速控制"
						title="点击展开倍速调节"
					>
						<Gauge class="h-4 w-4 text-primary" />
						<span class="text-xs text-primary">{playbackRate.toFixed(2)}x</span>
					</button>
					{#if showRatePanel}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="absolute bottom-full right-0 mb-2 rounded-lg bg-black/95 p-3 shadow-lg"
							style="min-width: 160px;"
							onclick={(e) => e.stopPropagation()}
							onmousedown={(e) => e.stopPropagation()}>
							<div class="flex items-center gap-2 mb-2">
								<input type="range" min={getMinPlaybackRate()} max={getMaxPlaybackRate()} step={getPlaybackRateStep()}
									value={playbackRate} oninput={handlePlaybackSlider}
									class="w-24 h-1 bg-white/20 rounded appearance-none cursor-pointer" />
								<span class="text-xs text-white shrink-0">{playbackRate.toFixed(2)}x</span>
							</div>
							<div class="flex flex-wrap gap-1">
								{#each [0.5, 1, 1.5, 2] as rate}
									<button class="px-2 py-0.5 text-xs rounded {playbackRate === rate ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20'}"
										onclick={() => setPlaybackRate(rate)}>{rate}x</button>
								{/each}
							</div>
						</div>
					{/if}
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

				<!-- 字幕状态/选择 -->
				<div class="relative">
					<button
						class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {subtitle ? 'bg-white/20' : ''}"
						onclick={(event) => {
							event.stopPropagation();
							onSelectSubtitle?.();
						}}
						oncontextmenu={(event) => {
							event.preventDefault();
							event.stopPropagation();
							showSubtitleSettings = !showSubtitleSettings;
						}}
						title={subtitle ? `字幕: ${subtitle.filename}（左键更换，右键设置）` : '左键选择字幕，右键设置'}
						aria-label={subtitle ? '更换字幕' : '选择字幕'}
					>
						{#if subtitle}
							<Captions class="h-5 w-5 text-primary" />
						{:else}
							<CaptionsOff class="h-5 w-5 text-primary opacity-40" />
						{/if}
					</button>

					<!-- 字幕设置面板 -->
					{#if showSubtitleSettings}
						<div
							class="absolute bottom-full right-0 mb-2 w-64 rounded-lg bg-black/90 p-4 shadow-lg backdrop-blur-sm"
							onclick={(e) => e.stopPropagation()}
							onmousedown={(e) => e.stopPropagation()}
						>
							<div class="mb-3 flex items-center justify-between">
								<span class="text-sm font-medium text-white">字幕设置</span>
								<button
									class="text-white/60 hover:text-white"
									onclick={() => (showSubtitleSettings = false)}
								>
									✕
								</button>
							</div>

							<!-- 字体大小 -->
							<div class="mb-3">
								<span class="mb-1 block text-xs text-white/70">字体大小</span>
								<div class="flex items-center gap-2">
									<input
										type="range"
										min="0.5"
										max="3"
										step="0.1"
										bind:value={subtitleFontSize}
										class="subtitle-slider h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20"
									/>
									<span class="w-10 text-right text-xs text-white">{subtitleFontSize.toFixed(1)}em</span>
								</div>
							</div>

							<!-- 字幕位置 -->
							<div class="mb-3">
								<span class="mb-1 block text-xs text-white/70">底部距离</span>
								<div class="flex items-center gap-2">
									<input
										type="range"
										min="0"
										max="30"
										step="1"
										bind:value={subtitleBottom}
										class="subtitle-slider h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20"
									/>
									<span class="w-10 text-right text-xs text-white">{subtitleBottom}%</span>
								</div>
							</div>

							<!-- 字幕颜色 -->
							<div class="mb-3">
								<span class="mb-1 block text-xs text-white/70">字幕颜色</span>
								<div class="flex gap-2">
									{#each ['#ffffff', '#ffff00', '#00ff00', '#00ffff', '#ff9900'] as color}
										<button
											class="h-6 w-6 rounded border-2 transition-transform hover:scale-110 {subtitleColor === color ? 'border-primary' : 'border-transparent'}"
											style="background-color: {color}"
											onclick={() => (subtitleColor = color)}
											title={color}
										></button>
									{/each}
								</div>
							</div>

							<!-- 背景透明度 -->
							<div class="mb-3">
								<span class="mb-1 block text-xs text-white/70">背景透明度</span>
								<div class="flex items-center gap-2">
									<input
										type="range"
										min="0"
										max="1"
										step="0.1"
										bind:value={subtitleBgOpacity}
										class="subtitle-slider h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20"
									/>
									<span class="w-10 text-right text-xs text-white">{Math.round(subtitleBgOpacity * 100)}%</span>
								</div>
							</div>

							<!-- 预设和保存按钮 -->
							<div class="flex gap-2">
								<button
									class="flex-1 rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
									onclick={() => {
										subtitleFontSize = 1.0;
										subtitleColor = '#ffffff';
										subtitleBgOpacity = 0.7;
										subtitleBottom = 5;
									}}
									title="重置为默认值"
								>
									重置
								</button>
								<button
									class="flex-1 rounded bg-primary/50 px-2 py-1 text-xs text-white hover:bg-primary/70"
									onclick={() => {
										saveSubtitleSettings();
										showSubtitleSettings = false;
									}}
									title="保存设置"
								>
									保存
								</button>
							</div>
							<div class="mt-2 flex gap-2">
								<button
									class="flex-1 rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
									onclick={() => {
										subtitleFontSize = 1.5;
										subtitleColor = '#ffff00';
										subtitleBgOpacity = 0.8;
										subtitleBottom = 8;
									}}
									title="大号黄色字幕"
								>
									大号黄色
								</button>
							</div>
						</div>
					{/if}
				</div>

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

				<!-- 画中画 -->
				<button
					class="control-btn rounded-full p-2 transition-colors hover:bg-white/20 {isPiP ? 'bg-white/30' : ''}"
					onclick={(event) => {
						event.stopPropagation();
						togglePictureInPicture();
					}}
					aria-label={isPiP ? '退出画中画' : '画中画'}
					title={isPiP ? '退出画中画' : '画中画模式'}
				>
					<PictureInPicture2 class="h-5 w-5 text-primary {isPiP ? '' : 'opacity-70'}" />
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

	.preview-tooltip {
		pointer-events: none;
		z-index: 100;
	}

	.preview-canvas {
		display: block;
		width: 160px;
		height: auto;
		min-height: 60px;
		background: #000;
	}

	/* 字幕样式 - 使用 CSS 变量实现动态样式 */
	:global(video::cue) {
		background-color: var(--subtitle-bg, rgba(0, 0, 0, 0.7));
		color: var(--subtitle-color, white);
		font-size: var(--subtitle-font-size, 1.2em);
		line-height: 1.4;
		padding: 0.2em 0.4em;
		border-radius: 4px;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
	}

	.subtitle-slider::-webkit-slider-thumb {
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--primary);
		cursor: pointer;
	}
</style>
