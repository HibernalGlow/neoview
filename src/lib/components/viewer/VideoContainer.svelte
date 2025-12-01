<!--
  VideoContainer - 视频容器组件
  独立的视频播放管理组件，可供 ImageViewer 和 StackView 共同使用
  负责：视频URL管理、历史进度追踪、VideoPlayer 渲染
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import VideoPlayer from './VideoPlayer.svelte';
	import { videoStore } from '$lib/stores/video.svelte';
	import { historyStore } from '$lib/stores/history.svelte';
	import { bookStore } from '$lib/stores';
	import { isVideoFile, getVideoMimeType } from '$lib/utils/videoUtils';
	import { invoke, convertFileSrc } from '@tauri-apps/api/core';
	import type { Page } from '$lib/types';

	// 视频操作事件监听器
	let viewerActionListener: ((event: CustomEvent) => void) | null = null;

	// Props
	const {
		page = null,
		onEnded = () => {},
		onError = (error: any) => {}
	}: {
		page?: Page | null;
		onEnded?: () => void;
		onError?: (error: any) => void;
	} = $props();

	// 视频播放器引用
	let videoPlayerRef: any = null;

	// 视频URL状态
	let videoUrl = $state<string | null>(null);
	let videoUrlRevokeNeeded = false;
	let videoStartTime = $state(0);
	let lastVideoHistoryUpdateAt = 0;
	let currentVideoRequestId = 0;

	// 清理视频URL
	function clearVideoUrl() {
		if (videoUrlRevokeNeeded && videoUrl) {
			URL.revokeObjectURL(videoUrl);
		}
		videoUrl = null;
		videoUrlRevokeNeeded = false;
	}

	// 设置视频URL
	function setVideoUrl(url: string, revokeNeeded: boolean) {
		if (videoUrlRevokeNeeded && videoUrl) {
			URL.revokeObjectURL(videoUrl);
		}
		videoUrl = url;
		videoUrlRevokeNeeded = revokeNeeded;
	}

	// 加载视频
	async function loadVideo(videoPage: Page) {
		const requestId = ++currentVideoRequestId;
		clearVideoUrl();

		try {
			// 尝试获取历史进度
			const historyEntry = historyStore.findByPath(videoPage.path);
			if (historyEntry?.videoPosition && historyEntry.videoPosition > 0) {
				const duration = historyEntry.videoDuration || 0;
				const progress = historyEntry.videoPosition;
				// 如果已完成，从头开始
				if (historyEntry.videoCompleted || (duration > 0 && progress >= duration - 5)) {
					videoStartTime = 0;
				} else {
					videoStartTime = progress;
				}
			} else {
				videoStartTime = 0;
			}

			// 加载视频数据
			if (videoPage.data) {
				// 已有 base64 数据
				const mimeType = getVideoMimeType(videoPage.name) || 'video/mp4';
				const blob = await fetch(`data:${mimeType};base64,${videoPage.data}`).then(r => r.blob());
				if (requestId !== currentVideoRequestId) return;
				const url = URL.createObjectURL(blob);
				setVideoUrl(url, true);
			} else if (videoPage.innerPath && bookStore.currentBook?.type === 'archive') {
				// 从压缩包加载
				const archivePath = bookStore.currentBook.path;
				const videoData: number[] = await invoke('load_archive_entry', {
					archivePath,
					entryPath: videoPage.innerPath
				});
				if (requestId !== currentVideoRequestId) return;
				const mimeType = getVideoMimeType(videoPage.name) || 'video/mp4';
				const blob = new Blob([new Uint8Array(videoData)], { type: mimeType });
				const url = URL.createObjectURL(blob);
				setVideoUrl(url, true);
			} else {
				// 从文件系统加载
				const url = convertFileSrc(videoPage.path);
				if (requestId !== currentVideoRequestId) return;
				setVideoUrl(url, false);
			}
		} catch (err) {
			console.error('加载视频失败:', err);
			onError(err);
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
			historyStore.updateVideoProgress(
				page.path,
				clampedTime,       // 真实的当前时间（秒）
				safeDuration,      // 真实的总时长（秒）
				completed,         // 是否已完成
				finalPercent,      // 进度百分比（0-100）
				100                // 总数为100（百分比）
			);
		} catch (err) {
			console.error('Failed to update video progress history:', err);
		}
	}

	// 处理视频结束（列表循环）
	async function handleVideoEnded() {
		onEnded();
	}

	// 监听 page 变化，加载视频
	$effect(() => {
		// 使用与 StackView 一致的检测逻辑：优先 name，然后 innerPath
		const filename = page?.name || page?.innerPath || '';
		if (page && filename && isVideoFile(filename)) {
			loadVideo(page);
		} else {
			clearVideoUrl();
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
		// 移除事件监听
		if (viewerActionListener) {
			window.removeEventListener('neoview-viewer-action', viewerActionListener as EventListener);
			viewerActionListener = null;
		}
	});

	// 暴露控制方法
	export function playPause() {
		if (videoPlayerRef && typeof videoPlayerRef.playPause === 'function') {
			videoPlayerRef.playPause();
		}
	}

	export function seekForward() {
		if (videoPlayerRef && typeof videoPlayerRef.seekForward === 'function') {
			videoPlayerRef.seekForward();
		}
	}

	export function seekBackward() {
		if (videoPlayerRef && typeof videoPlayerRef.seekBackward === 'function') {
			videoPlayerRef.seekBackward();
		}
	}
</script>

<div class="video-container h-full w-full">
	{#if videoUrl}
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
		/>
	{:else}
		<div class="flex h-full w-full items-center justify-center text-white">
			加载视频中...
		</div>
	{/if}
</div>

<style>
	.video-container {
		background-color: black;
	}
</style>
