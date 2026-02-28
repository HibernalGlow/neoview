<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		Maximize,
		FastForward,
		Pin,
		PinOff,
		PictureInPicture2
	} from '@lucide/svelte';
	import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
	import type { SubtitleData } from '$lib/utils/subtitleUtils';
	import { infoPanelStore } from '$lib/stores/infoPanel.svelte';
	import {
		formatTime,
		FrameCacheManager,
		captureVideoScreenshot,
		downloadScreenshot
	} from './videoPlayerUtils';
	// 导入子组件
	import {
		VideoControls,
		VideoProgressBar,
		VolumePanel,
		PlaybackRatePanel,
		MoreMenu,
		SubtitlePanel
	} from './VideoPlayer';

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
	let videoUrl = $state<string>('');

	// 进度条预览状态
	let progressBarComponent = $state<{ getPreviewCanvas: () => HTMLCanvasElement | null; getProgressBarRef: () => HTMLDivElement | null } | null>(null);
	let previewVisible = $state(false);
	let previewTime = $state(0);
	let previewX = $state(0);
	
	// 帧缓存管理器
	const frameCacheManager = new FrameCacheManager();
	
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
	let subtitleFontSize = $state(1.0); // em 单位
	let subtitleColor = $state('#ffffff');
	let subtitleBgOpacity = $state(0.7);
	let subtitleBottom = $state(5); // 底部距离百分比

	$effect(() => {
		videoUrl = src || '';
	});

	$effect(() => {
		subtitleFontSize = settings.subtitle?.fontSize ?? 1.0;
		subtitleColor = settings.subtitle?.color ?? '#ffffff';
		subtitleBgOpacity = settings.subtitle?.bgOpacity ?? 0.7;
		subtitleBottom = settings.subtitle?.bottom ?? 5;
	});

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

	// 生成预览帧缩略图（使用 FrameCacheManager）
	function generatePreviewFrame(time: number) {
		const previewCanvas = progressBarComponent?.getPreviewCanvas();
		if (!videoElement || !previewCanvas) return;
		
		frameCacheManager.generatePreviewFrame(
			time,
			videoUrl,
			previewCanvas,
			() => { /* preview generated */ }
		);
	}
	
	// 清理帧缓存（视频切换时调用）
	function clearFrameCache() {
		frameCacheManager.clear();
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
		
		try {
			const blob = await captureVideoScreenshot(videoElement, currentTime);
			if (blob) {
				downloadScreenshot(blob, currentTime);
			}
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
		// 【修复内存泄漏】清理帧缓存和临时视频元素
		clearFrameCache();
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
	class="video-player-container relative flex h-full w-full items-center justify-center"
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
			<!-- 进度条 - 使用子组件 -->
			<VideoProgressBar
				bind:this={progressBarComponent}
				{currentTime}
				{duration}
				onSeek={seek}
				{previewVisible}
				{previewTime}
				{previewX}
				{formatTime}
				onProgressHover={handleProgressHover}
				onProgressLeave={handleProgressLeave}
			/>

			<!-- 控制按钮（响应式：窄屏时缩小间距） -->
			<div class="controls-row flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4">
				<!-- 基本控制 - 使用子组件 -->
				<VideoControls
					{isPlaying}
					{loopMode}
					onTogglePlay={togglePlay}
					onSkipBackward={skipBackward}
					onSkipForward={skipForward}
					onCycleLoopMode={cycleLoopMode}
				/>

				<!-- 更多功能菜单 - 使用子组件 -->
				<MoreMenu
					{showMoreMenu}
					{abLoop}
					{abLoopActive}
					{showFilterPanel}
					{brightness}
					{contrast}
					{saturate}
					videoWidth={videoElement?.videoWidth ?? 0}
					videoHeight={videoElement?.videoHeight ?? 0}
					{duration}
					{formatTime}
					onToggleMenu={(e) => {
						e.stopPropagation();
						showMoreMenu = !showMoreMenu;
					}}
					onCaptureScreenshot={() => {
						captureScreenshot();
						showMoreMenu = false;
					}}
					onSetLoopPointA={setLoopPointA}
					onSetLoopPointB={setLoopPointB}
					onClearAbLoop={clearAbLoop}
					onToggleFilterPanel={() => showFilterPanel = !showFilterPanel}
					onResetFilters={resetFilters}
					onBrightnessChange={(v) => brightness = v}
					onContrastChange={(v) => contrast = v}
					onSaturateChange={(v) => saturate = v}
				/>

				<!-- 时间显示 -->
				<div class="time-display text-sm text-primary">
					{formatTime(currentTime)} / {formatTime(duration)}
				</div>

				<div class="flex-1"></div>

				<!-- 音量控制 - 使用子组件 -->
				<VolumePanel
					{volume}
					{isMuted}
					{showVolumePanel}
					onToggleMute={toggleMute}
					onVolumeChange={changeVolume}
					onTogglePanel={(e) => {
						e.stopPropagation();
						showVolumePanel = !showVolumePanel;
						showRatePanel = false;
					}}
				/>

				<!-- 倍速控制 - 使用子组件 -->
				<PlaybackRatePanel
					{playbackRate}
					{showRatePanel}
					minRate={getMinPlaybackRate()}
					maxRate={getMaxPlaybackRate()}
					rateStep={getPlaybackRateStep()}
					onSetRate={setPlaybackRate}
					onSliderChange={handlePlaybackSlider}
					onTogglePanel={(e) => {
						e.stopPropagation();
						showRatePanel = !showRatePanel;
						showVolumePanel = false;
					}}
				/>

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

				<!-- 字幕状态/选择 - 使用子组件 -->
				<SubtitlePanel
					{subtitle}
					{showSubtitleSettings}
					{subtitleFontSize}
					{subtitleColor}
					{subtitleBgOpacity}
					{subtitleBottom}
					onSelectSubtitle={() => onSelectSubtitle?.()}
					onToggleSettings={(e) => {
						e.preventDefault();
						e.stopPropagation();
						showSubtitleSettings = !showSubtitleSettings;
					}}
					onFontSizeChange={(v) => subtitleFontSize = v}
					onColorChange={(v) => subtitleColor = v}
					onBgOpacityChange={(v) => subtitleBgOpacity = v}
					onBottomChange={(v) => subtitleBottom = v}
					onReset={() => {
						subtitleFontSize = 1.0;
						subtitleColor = '#ffffff';
						subtitleBgOpacity = 0.7;
						subtitleBottom = 5;
					}}
					onSave={() => {
						saveSubtitleSettings();
						showSubtitleSettings = false;
					}}
					onApplyPreset={(preset) => {
						if (preset === 'large-yellow') {
							subtitleFontSize = 1.5;
							subtitleColor = '#ffff00';
							subtitleBgOpacity = 0.8;
							subtitleBottom = 8;
						}
					}}
				/>

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
