/**
 * 视频状态管理模块
 * 独立管理视频播放相关的状态和逻辑
 */

import { settingsManager } from '$lib/settings/settingsManager';

export type VideoLoopMode = 'none' | 'list' | 'single';

export interface VideoPlayerSettings {
	volume: number;
	muted: boolean;
	playbackRate: number;
	loopMode: VideoLoopMode;
}

class VideoStore {
	// 播放器设置
	settings = $state<VideoPlayerSettings>({
		volume: 1,
		muted: false,
		playbackRate: 1,
		loopMode: 'list'
	});

	// 快进模式：开启后翻页键作为快进/快退
	seekMode = $state(false);

	// 上一个倍速（用于倍速切换）
	private previousPlaybackRate = $state(1);

	// 暴露到全局以便 App.svelte 读取
	constructor() {
		$effect(() => {
			if (typeof window !== 'undefined') {
				(window as unknown as { __neoview_video_seek_mode?: boolean }).__neoview_video_seek_mode = this.seekMode;
			}
		});
	}

	/**
	 * 调整音量
	 */
	adjustVolume(direction: 1 | -1) {
		const step = 0.1;
		const next = Math.min(1, Math.max(0, this.settings.volume + direction * step));
		this.settings = {
			...this.settings,
			volume: next,
			muted: next === 0
		};
	}

	/**
	 * 调整播放速度
	 */
	adjustSpeed(direction: 1 | -1) {
		const s = settingsManager.getSettings();
		const min = s.image.videoMinPlaybackRate;
		const max = s.image.videoMaxPlaybackRate;
		const step = s.image.videoPlaybackRateStep;
		const next = Math.min(max, Math.max(min, this.settings.playbackRate + direction * step));
		this.settings = {
			...this.settings,
			playbackRate: next
		};
	}

	/**
	 * 切换倍速（在当前倍速和1倍之间切换）
	 */
	toggleSpeed() {
		const current = this.settings.playbackRate;
		if (current === 1) {
			// 当前是1倍速，切换到上一个倍速
			const target = this.previousPlaybackRate !== 1 ? this.previousPlaybackRate : 1;
			this.settings = {
				...this.settings,
				playbackRate: target
			};
		} else {
			// 当前不是1倍速，保存当前倍速并切换到1倍速
			this.previousPlaybackRate = current;
			this.settings = {
				...this.settings,
				playbackRate: 1
			};
		}
	}

	/**
	 * 切换静音
	 */
	toggleMute() {
		this.settings = {
			...this.settings,
			muted: !this.settings.muted
		};
	}

	/**
	 * 切换循环模式
	 */
	cycleLoopMode() {
		let next: VideoLoopMode;
		if (this.settings.loopMode === 'list') {
			next = 'single';
		} else if (this.settings.loopMode === 'single') {
			next = 'none';
		} else {
			next = 'list';
		}
		this.settings = {
			...this.settings,
			loopMode: next
		};
	}

	/**
	 * 切换快进模式
	 */
	toggleSeekMode() {
		this.seekMode = !this.seekMode;
		console.log('视频快进模式:', this.seekMode ? '开启' : '关闭');
	}

	/**
	 * 更新设置（从 VideoPlayer 回调）
	 */
	updateSettings(newSettings: VideoPlayerSettings) {
		this.settings = newSettings;
	}

	/**
	 * 设置快进模式
	 */
	setSeekMode(enabled: boolean) {
		this.seekMode = enabled;
	}
}

export const videoStore = new VideoStore();
