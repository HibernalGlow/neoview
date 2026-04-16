<!--
  VideoContainer - 视频容器组件
  独立的视频播放管理组件，可供 ImageViewer 和 StackView 共同使用
  负责：视频URL管理、历史进度追踪、VideoPlayer 渲染
-->
<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import VideoPlayer from './VideoPlayer.svelte';
	import AnimatedImagePlayer from './AnimatedImagePlayer.svelte';
	import { videoStore } from '$lib/stores/video.svelte';
	import { animatedVideoModeStore } from '$lib/stores/animatedVideoMode.svelte';
	import { unifiedHistoryStore } from '$lib/stores/unifiedHistory.svelte';
	import { bookStore } from '$lib/stores';
	import { keyBindingsStore } from '$lib/stores/keybindings';
	import { isVideoFile } from '$lib/utils/videoUtils';
	import {
		isAnimatedImageVideoCandidate,
		isAnimatedWebpCandidate,
		matchesAnimatedVideoKeyword
	} from '$lib/utils/animatedVideoModeUtils';
	import { isAnimatedImage } from '$lib/utils/imageUtils';
	import {
		getPossibleSubtitleNames,
		getSubtitleType,
		parseSubtitleContent,
		revokeSubtitleBlobUrl,
		type SubtitleData
	} from '$lib/utils/subtitleUtils';
	import { invoke, convertFileSrc } from '@tauri-apps/api/core';
	import { dirname, join, basename } from '@tauri-apps/api/path';
	import { open } from '@tauri-apps/plugin-dialog';
	import type { Page } from '$lib/types';
	import { getArchiveImageUrl } from '$lib/api/imageProtocol';
	import { getBookHash } from '$lib/components/viewer/flow/imageReader';

	// 视频操作事件监听器
	let viewerActionListener: ((event: CustomEvent) => void) | null = null;

	// Props
	interface Props {
		page?: Page | null;
		onEnded?: () => void;
		onError?: (error: any) => void;
	}

	let {
		page = null,
		onEnded = () => {},
		onError = (error: any) => {}
	}: Props = $props();

	// 视频播放器引用
	let videoPlayerRef = $state<any>(null);
	let animatedPlayerRef = $state<any>(null);

	// 视频URL状态
	let videoUrl = $state<string | null>(null);
	let frontendAnimatedUrl = $state<string | null>(null);
	let videoUrlRevokeNeeded = false;
	let videoStartTime = $state(0);
	let lastVideoHistoryUpdateAt = 0;
	let currentVideoRequestId = 0;
	const animatedWebpProbeCache = new Map<string, boolean>();
	let webpAnimatedForCurrentPage = $state(false);
	let webpProbeVersion = 0;

	// 字幕状态
	let subtitleData = $state<SubtitleData | null>(null);

	// 清理视频URL
	function clearVideoUrl() {
		if (videoUrlRevokeNeeded && videoUrl) {
			URL.revokeObjectURL(videoUrl);
		}
		videoUrl = null;
		frontendAnimatedUrl = null;
		videoUrlRevokeNeeded = false;
	}

	// 清理字幕
	function clearSubtitle() {
		if (subtitleData?.vttUrl) {
			revokeSubtitleBlobUrl(subtitleData.vttUrl);
		}
		subtitleData = null;
	}

	// 设置视频URL
	function setVideoUrl(url: string, revokeNeeded: boolean) {
		if (videoUrlRevokeNeeded && videoUrl) {
			URL.revokeObjectURL(videoUrl);
		}
		videoUrl = url;
		videoUrlRevokeNeeded = revokeNeeded;
	}

	function shouldOpenAnimatedAsVideo(filename: string): boolean {
		if (!filename) return false;
		if (!animatedVideoModeStore.canUse) return false;
		if (isVideoFile(filename)) return false;
		if (matchesAnimatedVideoKeyword(filename, animatedVideoModeStore.keywords)) return true;
		if (isAnimatedImageVideoCandidate(filename)) return true;
		if (isAnimatedWebpCandidate(filename)) return webpAnimatedForCurrentPage;
		return false;
	}

	$effect(() => {
		const currentPage = page;
		const filename = currentPage?.name || currentPage?.innerPath || currentPage?.path || '';
		const probeKey = currentPage
			? `${bookStore.currentBook?.path ?? ''}::${currentPage.innerPath ?? currentPage.path}`
			: '';

		webpAnimatedForCurrentPage = false;

		if (!currentPage || !animatedVideoModeStore.canUse || !isAnimatedWebpCandidate(filename)) {
			return;
		}

		const cached = animatedWebpProbeCache.get(probeKey);
		if (cached !== undefined) {
			webpAnimatedForCurrentPage = cached;
			return;
		}

		const probeId = ++webpProbeVersion;
		void (async () => {
			try {
				let probePath = currentPage.path;
				if (currentPage.innerPath && bookStore.currentBook?.type === 'archive') {
					probePath = await invoke<string>('extract_image_to_temp', {
						archivePath: bookStore.currentBook.path,
						filePath: currentPage.innerPath,
						traceId: `video-container-webp-probe-${Date.now()}`,
						pageIndex: currentPage.index
					});
				}

				const animated = await isAnimatedImage(convertFileSrc(probePath));
				if (probeId !== webpProbeVersion) return;
				animatedWebpProbeCache.set(probeKey, animated);
				webpAnimatedForCurrentPage = animated;
			} catch (error) {
				if (probeId !== webpProbeVersion) return;
				animatedWebpProbeCache.set(probeKey, false);
				webpAnimatedForCurrentPage = false;
				console.warn('VideoContainer WebP 动图检测失败，按静态图处理:', error);
			}
		})();
	});

	// 加载视频
	async function loadVideo(videoPage: Page) {
		const requestId = ++currentVideoRequestId;
		clearVideoUrl();

		try {
			// 尝试获取历史进度
			const historyEntry = unifiedHistoryStore.findByPath(videoPage.path);
			const vp = historyEntry?.videoProgress;
			if (vp?.position && vp.position > 0) {
				const duration = vp.duration || 0;
				const progress = vp.position;
				// 如果已完成，从头开始
				if (vp.completed || (duration > 0 && progress >= duration - 5)) {
					videoStartTime = 0;
				} else {
					videoStartTime = progress;
				}
			} else {
				videoStartTime = 0;
			}

			const filename = videoPage.name || videoPage.innerPath || videoPage.path || '';
			const useAnimatedVideoMode = shouldOpenAnimatedAsVideo(filename);

			if (useAnimatedVideoMode) {
				let animatedImagePath = videoPage.path;
				if (videoPage.innerPath && bookStore.currentBook?.type === 'archive') {
					const archivePath = bookStore.currentBook.path;
					animatedImagePath = await invoke<string>('extract_image_to_temp', {
						archivePath,
						filePath: videoPage.innerPath,
						traceId: `animated-image-${Date.now()}`,
						pageIndex: videoPage.index
					});
					if (requestId !== currentVideoRequestId) return;
				}

				if (animatedVideoModeStore.preferFfmpegConversion) {
					const convertedVideoPath = await invoke<string>('convert_animated_image_to_video_temp', {
						imagePath: animatedImagePath,
						traceId: `animated-video-${Date.now()}`
					});
					if (requestId !== currentVideoRequestId) return;
					setVideoUrl(convertFileSrc(convertedVideoPath), false);
				} else {
					if (requestId !== currentVideoRequestId) return;
					frontendAnimatedUrl = convertFileSrc(animatedImagePath);
				}
				return;
			}

			// 加载视频数据
			if (videoPage.innerPath && bookStore.currentBook?.type === 'archive') {
				// 【优化】使用 neoview:// 协议直连，避免磁盘解压等待
				const archivePath = bookStore.currentBook.path;
				const bookHash = await getBookHash(archivePath);
				
				if (requestId !== currentVideoRequestId) return;
				
				// 如果有 entryIndex，使用 protocol 直连
				if (videoPage.entryIndex != null) {
					const url = getArchiveImageUrl(bookHash, videoPage.entryIndex);
					setVideoUrl(url, false);
				} else {
					// 回退方案：提取到临时文件
					const tempPath: string = await invoke('extract_video_to_temp', {
						archivePath,
						filePath: videoPage.innerPath,
						traceId: `video-${Date.now()}`
					});
					if (requestId !== currentVideoRequestId) return;
					const url = convertFileSrc(tempPath);
					setVideoUrl(url, false);
				}
			} else {
				// 从文件系统加载 - 直接使用 convertFileSrc
				const url = convertFileSrc(videoPage.path);
				if (requestId !== currentVideoRequestId) return;
				setVideoUrl(url, false);
			}
			// 加载字幕
			await loadSubtitle(videoPage);
		} catch (err) {
			console.error('加载视频失败:', err);
			onError(err);
		}
	}

	// 加载字幕文件
	async function loadSubtitle(videoPage: Page) {
		clearSubtitle();

		try {
			const filename = videoPage.name || videoPage.innerPath || '';
			if (!filename) return;

			const possibleNames = getPossibleSubtitleNames(filename);

			if (videoPage.innerPath && bookStore.currentBook?.type === 'archive') {
				// 压缩包内查找字幕
				const archivePath = bookStore.currentBook.path;
				const pages = bookStore.currentBook.pages || [];

				// 在压缩包的页面列表中查找匹配的字幕文件
				for (const subName of possibleNames) {
					const subPage = pages.find((p) => {
						const pName = p.name || p.innerPath || '';
						return pName.toLowerCase() === subName.toLowerCase();
					});

					if (subPage?.innerPath) {
						try {
							const subData: number[] = await invoke('load_text_from_archive', {
								archivePath,
								filePath: subPage.innerPath
							});
							const content = new TextDecoder('utf-8').decode(new Uint8Array(subData));
							const type = getSubtitleType(subPage.innerPath);
							if (type && content) {
								subtitleData = parseSubtitleContent(content, type, subPage.innerPath);
								return;
							}
						} catch (e) {
							// 该字幕文件不存在或无法读取，继续尝试下一个
						}
					}
				}
			} else {
				// 文件系统中查找字幕
				const videoDir = await dirname(videoPage.path);

				for (const subName of possibleNames) {
					try {
						const subPath = await join(videoDir, subName);
						const content: string = await invoke('read_text_file', { path: subPath });
						const type = getSubtitleType(subName);
						if (type && content) {
							subtitleData = parseSubtitleContent(content, type, subName);
							return;
						}
					} catch (e) {
						// 该字幕文件不存在，继续尝试下一个
					}
				}
			}
		} catch (err) {
			console.warn('加载字幕失败:', err);
		}
	}

	// 处理视频进度更新 - 记录真实的时间和百分比
	function handleVideoProgress(currentTimeSec: number, durationSec: number, ended: boolean) {
		if (!page) return;
		if (!durationSec || !isFinite(durationSec) || durationSec <= 0) return;

		const now = Date.now();
		// 节流：未结束时最多每 5 秒写一次历史
		if (!ended && now - lastVideoHistoryUpdateAt < 5000) {
			return;
		}
		lastVideoHistoryUpdateAt = now;

		const safeDuration = durationSec;
		const clampedTime = Math.max(0, Math.min(currentTimeSec, safeDuration));
		const completed = ended || clampedTime >= safeDuration - Math.min(5, safeDuration * 0.05);

		// 计算真实的进度百分比（0-100）
		const progressPercent = Math.round((clampedTime / safeDuration) * 100);
		const finalPercent = completed ? 100 : progressPercent;

		try {
			// 使用 pathStack 更新视频进度
			const pathStack = bookStore.buildPathStack();
			unifiedHistoryStore.updateVideoProgress(
				pathStack,
				clampedTime,       // 真实的当前时间（秒）
				safeDuration,      // 真实的总时长（秒）
				completed          // 是否已完成
			);
		} catch (err) {
			console.error('Failed to update video progress history:', err);
		}
	}

	// 处理视频结束（列表循环）
	async function handleVideoEnded() {
		onEnded();
	}

	// 追踪当前是否为视频模式
	let isInVideoMode = false;

	// 监听 page 变化，加载视频并切换上下文
	$effect(() => {
		// 使用与 StackView 一致的检测逻辑：优先 name，然后 innerPath
		const filename = page?.name || page?.innerPath || page?.path || '';
		const currentPage = page;
		const isAnimatedVideoPage = shouldOpenAnimatedAsVideo(filename);
		if (currentPage && filename && (isVideoFile(filename) || isAnimatedVideoPage)) {
			// 切换到视频上下文
			keyBindingsStore.setContexts(['global', 'videoPlayer']);
			isInVideoMode = true;
			// 使用 untrack 防止 loadVideo 内部的状态修改触发循环
			untrack(() => {
				loadVideo(currentPage);
			});
		} else if (isInVideoMode) {
			// 只有从视频模式退出时才切换回图片上下文
			keyBindingsStore.setContexts(['global', 'viewer']);
			isInVideoMode = false;
			untrack(() => {
				clearVideoUrl();
			});
		}
	});

	// 组件卸载时恢复图片上下文
	onDestroy(() => {
		if (isInVideoMode) {
			keyBindingsStore.setContexts(['global', 'viewer']);
		}
	});

	// 处理视频操作事件
	function handleViewerAction(action: string) {
		switch (action) {
			case 'videoPlayPause':
				playPause();
				break;
			case 'videoSeekForward':
				seekForward();
				break;
			case 'videoSeekBackward':
				seekBackward();
				break;
			case 'videoToggleMute':
				videoStore.toggleMute();
				break;
			case 'videoToggleLoopMode':
				videoStore.cycleLoopMode();
				break;
			case 'videoVolumeUp':
				videoStore.adjustVolume(1);
				break;
			case 'videoVolumeDown':
				videoStore.adjustVolume(-1);
				break;
			case 'videoSpeedUp':
				videoStore.adjustSpeed(1);
				break;
			case 'videoSpeedDown':
				videoStore.adjustSpeed(-1);
				break;
			case 'videoSpeedToggle':
				videoStore.toggleSpeed();
				break;
			case 'videoSeekModeToggle':
				videoStore.toggleSeekMode();
				break;
		}
	}

	// 挂载时添加事件监听
	onMount(() => {
		viewerActionListener = (event: CustomEvent) => handleViewerAction(event.detail.action);
		window.addEventListener('neoview-viewer-action', viewerActionListener as EventListener);
	});

	// 卸载时清理
	onDestroy(() => {
		// 清理视频URL
		clearVideoUrl();
		// 清理字幕
		clearSubtitle();
		// 移除事件监听
		if (viewerActionListener) {
			window.removeEventListener('neoview-viewer-action', viewerActionListener as EventListener);
			viewerActionListener = null;
		}
	});

	// 暴露控制方法
	export function playPause() {
		if (frontendAnimatedUrl && animatedPlayerRef && typeof animatedPlayerRef.playPause === 'function') {
			animatedPlayerRef.playPause();
			return;
		}
		if (videoPlayerRef && typeof videoPlayerRef.playPause === 'function') {
			videoPlayerRef.playPause();
		}
	}

	export function seekForward() {
		if (frontendAnimatedUrl && animatedPlayerRef && typeof animatedPlayerRef.seekForward === 'function') {
			animatedPlayerRef.seekForward();
			return;
		}
		if (videoPlayerRef && typeof videoPlayerRef.seekForward === 'function') {
			videoPlayerRef.seekForward();
		}
	}

	export function seekBackward() {
		if (frontendAnimatedUrl && animatedPlayerRef && typeof animatedPlayerRef.seekBackward === 'function') {
			animatedPlayerRef.seekBackward();
			return;
		}
		if (videoPlayerRef && typeof videoPlayerRef.seekBackward === 'function') {
			videoPlayerRef.seekBackward();
		}
	}

	// 手动选择字幕文件
	async function handleSelectSubtitle() {
		try {
			const selected = await open({
				title: '选择字幕文件',
				multiple: false,
				filters: [
					{
						name: '字幕文件',
						extensions: ['srt', 'ass', 'ssa', 'vtt']
					}
				]
			});

			if (selected && typeof selected === 'string') {
				const content: string = await invoke('read_text_file', { path: selected });
				const filename = await basename(selected);
				const type = getSubtitleType(filename);

				if (type && content) {
					clearSubtitle();
					subtitleData = parseSubtitleContent(content, type, filename);
				}
			}
		} catch (err) {
			console.error('选择字幕失败:', err);
		}
	}
</script>

<div class="video-container h-full w-full">
	{#if frontendAnimatedUrl}
		<AnimatedImagePlayer
			bind:this={animatedPlayerRef}
			src={frontendAnimatedUrl}
			initialPlaybackRate={videoStore.settings.playbackRate}
			initialLoopMode={videoStore.settings.loopMode}
			onSettingsChange={(settings) => {
				videoStore.updateSettings({
					...videoStore.settings,
					playbackRate: settings.playbackRate,
					loopMode: settings.loopMode
				});
			}}
			onEnded={handleVideoEnded}
			onError={(error) => onError(error)}
		/>
	{:else if videoUrl}
		<VideoPlayer
			bind:this={videoPlayerRef}
			src={videoUrl}
			initialTime={videoStartTime}
			onProgress={handleVideoProgress}
			onEnded={handleVideoEnded}
			initialVolume={videoStore.settings.volume}
			initialMuted={videoStore.settings.muted}
			initialPlaybackRate={videoStore.settings.playbackRate}
			initialLoopMode={videoStore.settings.loopMode}
			onSettingsChange={(settings) => {
				videoStore.updateSettings(settings);
			}}
			seekMode={videoStore.seekMode}
			onSeekModeChange={(enabled) => {
				videoStore.setSeekMode(enabled);
			}}
			subtitle={subtitleData}
			onSelectSubtitle={handleSelectSubtitle}
		/>
	{/if}
</div>

<style>
	.video-container {
		/* 背景透明，让动态背景效果可见 */
		background-color: transparent;
	}
</style>
