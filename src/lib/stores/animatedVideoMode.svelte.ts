import { invoke } from '@tauri-apps/api/core';

const STORAGE_KEY = 'neoview-animated-video-mode-v1';
const KEYWORDS_STORAGE_KEY = 'neoview-animated-video-keywords-v1';
const DEFAULT_KEYWORDS = ['[#dyna]'];

class AnimatedVideoModeStore {
	private _enabled = $state(this.loadEnabled());
	private _keywords = $state<string[]>(this.loadKeywords());
	private _ffmpegAvailable = $state(false);
	private _ffmpegChecked = $state(false);
	private _ffmpegChecking = $state(false);
	private _lastError = $state<string | null>(null);

	constructor() {
		if (typeof window !== 'undefined') {
			void this.refreshFfmpegAvailability();
		}
	}

	private loadEnabled(): boolean {
		if (typeof window === 'undefined') return false;
		try {
			return localStorage.getItem(STORAGE_KEY) === '1';
		} catch {
			return false;
		}
	}

	private saveEnabled(enabled: boolean): void {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
		} catch {
			// Ignore storage failures.
		}
	}

	private normalizeKeywords(keywords: string[]): string[] {
		const normalized = keywords
			.map((keyword) => keyword.trim().toLowerCase())
			.filter((keyword) => keyword.length > 0);
		return [...new Set(normalized)];
	}

	private loadKeywords(): string[] {
		if (typeof window === 'undefined') return [...DEFAULT_KEYWORDS];
		try {
			const stored = localStorage.getItem(KEYWORDS_STORAGE_KEY);
			if (!stored) return [...DEFAULT_KEYWORDS];
			const parsed = JSON.parse(stored);
			if (!Array.isArray(parsed)) return [...DEFAULT_KEYWORDS];
			const normalized = this.normalizeKeywords(parsed.filter((item) => typeof item === 'string'));
			return normalized.length > 0 ? normalized : [...DEFAULT_KEYWORDS];
		} catch {
			return [...DEFAULT_KEYWORDS];
		}
	}

	private saveKeywords(keywords: string[]): void {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(keywords));
		} catch {
			// Ignore storage failures.
		}
	}

	get enabled(): boolean {
		return this._enabled;
	}

	get ffmpegAvailable(): boolean {
		return this._ffmpegAvailable;
	}

	get keywords(): string[] {
		return this._keywords;
	}

	get ffmpegChecked(): boolean {
		return this._ffmpegChecked;
	}

	get ffmpegChecking(): boolean {
		return this._ffmpegChecking;
	}

	get lastError(): string | null {
		return this._lastError;
	}

	get canUse(): boolean {
		return this._enabled;
	}

	get preferFfmpegConversion(): boolean {
		return this._enabled && this._ffmpegAvailable;
	}

	setEnabled(enabled: boolean): void {
		this._enabled = enabled;
		this.saveEnabled(enabled);
	}

	setKeywords(keywords: string[]): void {
		const normalized = this.normalizeKeywords(keywords);
		this._keywords = normalized.length > 0 ? normalized : [...DEFAULT_KEYWORDS];
		this.saveKeywords(this._keywords);
	}

	setKeywordsFromText(text: string): void {
		const parts = text
			.split(/[,\n\r]+/)
			.map((part) => part.trim())
			.filter((part) => part.length > 0);
		this.setKeywords(parts);
	}

	toggleEnabled(): void {
		this.setEnabled(!this._enabled);
	}

	async refreshFfmpegAvailability(): Promise<boolean> {
		if (this._ffmpegChecking) {
			return this._ffmpegAvailable;
		}

		this._ffmpegChecking = true;
		this._lastError = null;
		try {
			const available = await invoke<boolean>('check_ffmpeg_available');
			this._ffmpegAvailable = !!available;
			this._ffmpegChecked = true;
			return this._ffmpegAvailable;
		} catch (error) {
			this._ffmpegAvailable = false;
			this._ffmpegChecked = true;
			this._lastError = error instanceof Error ? error.message : String(error);
			return false;
		} finally {
			this._ffmpegChecking = false;
		}
	}
}

export const animatedVideoModeStore = new AnimatedVideoModeStore();
