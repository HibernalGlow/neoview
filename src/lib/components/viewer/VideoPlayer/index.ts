/**
 * VideoPlayer 组件导出
 */

// 子组件导出
export { default as VideoControls } from './VideoControls.svelte';
export { default as VideoProgressBar } from './VideoProgressBar.svelte';
export { default as VolumePanel } from './VolumePanel.svelte';
export { default as PlaybackRatePanel } from './PlaybackRatePanel.svelte';
export { default as MoreMenu } from './MoreMenu.svelte';
export { default as SubtitlePanel } from './SubtitlePanel.svelte';

// 类型导出
export type LoopMode = 'none' | 'list' | 'single';

export type PlayerSettings = {
	volume: number;
	muted: boolean;
	playbackRate: number;
	loopMode: LoopMode;
};
