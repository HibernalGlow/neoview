/**
 * Slideshow Store - 幻灯片播放模式
 * 支持自动翻页、循环、随机播放、淡入淡出过渡
 */

import { settingsManager } from '$lib/settings/settingsManager';

export type SlideshowState = 'stopped' | 'playing' | 'paused';

class SlideshowStore {
	// === 状态 ===
	private _state = $state<SlideshowState>('stopped');
	private _interval = $state(5); // 默认5秒
	private _loop = $state(false);
	private _random = $state(false);
	private _fadeTransition = $state(true);
	private _remainingTime = $state(0); // 剩余时间（秒）
	private _showTimer = $state(true); // 是否显示计时器

	// 内部计时器
	private timer: ReturnType<typeof setInterval> | null = null;
	private tickInterval: ReturnType<typeof setInterval> | null = null;

	// 翻页回调
	private nextPageCallback: (() => void) | null = null;
	private randomPageCallback: ((index: number) => void) | null = null;
	private getTotalPages: (() => number) | null = null;
	private getCurrentIndex: (() => number) | null = null;

	constructor() {
		// 从设置加载初始值
		const settings = settingsManager.getSettings();
		this._interval = settings.slideshow?.defaultInterval ?? 5;
		this._loop = settings.slideshow?.loop ?? false;
		this._random = settings.slideshow?.random ?? false;
		this._fadeTransition = settings.slideshow?.fadeTransition ?? true;
	}

	// === Getters ===
	get state(): SlideshowState {
		return this._state;
	}

	get isPlaying(): boolean {
		return this._state === 'playing';
	}

	get isPaused(): boolean {
		return this._state === 'paused';
	}

	get isStopped(): boolean {
		return this._state === 'stopped';
	}

	get interval(): number {
		return this._interval;
	}

	get loop(): boolean {
		return this._loop;
	}

	get random(): boolean {
		return this._random;
	}

	get fadeTransition(): boolean {
		return this._fadeTransition;
	}

	get remainingTime(): number {
		return this._remainingTime;
	}

	get showTimer(): boolean {
		return this._showTimer;
	}

	get progress(): number {
		if (this._interval <= 0) return 0;
		return ((this._interval - this._remainingTime) / this._interval) * 100;
	}

	// === 设置方法 ===
	setInterval(seconds: number) {
		this._interval = Math.max(1, Math.min(60, seconds));
		this.saveSettings();
		// 如果正在播放，重新开始计时
		if (this._state === 'playing') {
			this.resetTimer();
		}
	}

	setLoop(enabled: boolean) {
		this._loop = enabled;
		this.saveSettings();
	}

	setRandom(enabled: boolean) {
		this._random = enabled;
		this.saveSettings();
	}

	setFadeTransition(enabled: boolean) {
		this._fadeTransition = enabled;
		this.saveSettings();
	}

	setShowTimer(show: boolean) {
		this._showTimer = show;
	}

	// === 控制方法 ===

	/**
	 * 注册回调函数
	 */
	registerCallbacks(callbacks: {
		nextPage: () => void;
		randomPage?: (index: number) => void;
		getTotalPages?: () => number;
		getCurrentIndex?: () => number;
	}) {
		this.nextPageCallback = callbacks.nextPage;
		this.randomPageCallback = callbacks.randomPage ?? null;
		this.getTotalPages = callbacks.getTotalPages ?? null;
		this.getCurrentIndex = callbacks.getCurrentIndex ?? null;
	}

	/**
	 * 开始/恢复播放
	 */
	play() {
		if (this._state === 'playing') return;

		this._state = 'playing';
		this._remainingTime = this._interval;
		this.startTimer();
		this.emitEvent('play');
	}

	/**
	 * 暂停播放
	 */
	pause() {
		if (this._state !== 'playing') return;

		this._state = 'paused';
		this.stopTimer();
		this.emitEvent('pause');
	}

	/**
	 * 停止播放
	 */
	stop() {
		this._state = 'stopped';
		this._remainingTime = 0;
		this.stopTimer();
		this.emitEvent('stop');
	}

	/**
	 * 切换播放/暂停
	 */
	toggle() {
		if (this._state === 'playing') {
			this.pause();
		} else {
			this.play();
		}
	}

	/**
	 * 跳过当前，立即翻页
	 */
	skip() {
		if (this._state === 'stopped') return;
		this.triggerNextPage();
		this.resetTimer();
	}

	/**
	 * 重置计时器（用于用户手动翻页后重新计时）
	 */
	resetOnUserAction() {
		if (this._state === 'playing') {
			this._remainingTime = this._interval;
		}
	}

	// === 内部方法 ===

	private startTimer() {
		this.stopTimer();

		// 主计时器 - 每秒触发一次
		this.tickInterval = setInterval(() => {
			if (this._state !== 'playing') return;

			this._remainingTime -= 1;

			if (this._remainingTime <= 0) {
				this.triggerNextPage();
				this._remainingTime = this._interval;
			}
		}, 1000);
	}

	private stopTimer() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		if (this.tickInterval) {
			clearInterval(this.tickInterval);
			this.tickInterval = null;
		}
	}

	private resetTimer() {
		this._remainingTime = this._interval;
	}

	private triggerNextPage() {
		const total = this.getTotalPages?.() ?? 0;
		const current = this.getCurrentIndex?.() ?? 0;

		if (this._random && this.randomPageCallback && total > 0) {
			// 随机模式
			let randomIndex: number;

			// 避免跳转到当前页
			do {
				randomIndex = Math.floor(Math.random() * total);
			} while (randomIndex === current && total > 1);

			this.randomPageCallback(randomIndex);
		} else {
			// 顺序模式
			const isLastPage = current >= total - 1;

			if (isLastPage) {
				if (this._loop && this.randomPageCallback) {
					// 循环模式：跳回第一页
					this.randomPageCallback(0);
				} else if (!this._loop) {
					// 非循环模式：停止播放
					this.stop();
					return;
				}
			} else if (this.nextPageCallback) {
				// 还有下一页，正常翻页
				this.nextPageCallback();
			}
		}
	}

	private saveSettings() {
		settingsManager.updateSettings({
			slideshow: {
				defaultInterval: this._interval,
				loop: this._loop,
				random: this._random,
				fadeTransition: this._fadeTransition
			}
		});
	}

	private emitEvent(type: 'play' | 'pause' | 'stop') {
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('slideshow:statechange', {
					detail: { state: this._state, type }
				})
			);
		}
	}

	/**
	 * 清理资源
	 */
	destroy() {
		this.stopTimer();
		this.nextPageCallback = null;
		this.randomPageCallback = null;
		this.getTotalPages = null;
		this.getCurrentIndex = null;
	}
}

// 导出单例
export const slideshowStore = new SlideshowStore();
