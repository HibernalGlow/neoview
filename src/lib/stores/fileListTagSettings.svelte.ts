/**
 * 文件列表标签显示设置 Store
 * 独立管理文件列表标签显示模式，不依赖 emmMetadataStore 初始化
 */

const STORAGE_KEY = 'neoview-file-list-tag-mode';

export type FileListTagDisplayMode = 'all' | 'collect' | 'none';

/**
 * 从 localStorage 加载设置
 */
function loadMode(): FileListTagDisplayMode {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'all' || saved === 'collect' || saved === 'none') {
			return saved;
		}
	} catch (e) {
		console.error('[FileListTagSettings] 加载设置失败:', e);
	}
	return 'collect'; // 默认值
}

/**
 * 保存设置到 localStorage
 */
function saveMode(mode: FileListTagDisplayMode): void {
	try {
		localStorage.setItem(STORAGE_KEY, mode);
	} catch (e) {
		console.error('[FileListTagSettings] 保存设置失败:', e);
	}
}

/**
 * 文件列表标签显示设置 Store
 * 使用 Svelte 5 的 runes 实现响应式
 */
class FileListTagSettingsStore {
	private _mode = $state<FileListTagDisplayMode>(loadMode());
	private _subscribers = new Set<(mode: FileListTagDisplayMode) => void>();

	constructor() {
		// 初始化时立即从 localStorage 加载
		this._mode = loadMode();
	}

	/**
	 * 获取当前模式
	 */
	get mode(): FileListTagDisplayMode {
		return this._mode;
	}

	/**
	 * 设置模式并持久化
	 */
	setMode(mode: FileListTagDisplayMode): void {
		if (this._mode !== mode) {
			this._mode = mode;
			saveMode(mode);
			// 通知订阅者
			this._subscribers.forEach(cb => cb(mode));
		}
	}

	/**
	 * 切换到下一个模式
	 */
	cycleMode(): void {
		const modes: FileListTagDisplayMode[] = ['all', 'collect', 'none'];
		const currentIndex = modes.indexOf(this._mode);
		const nextIndex = (currentIndex + 1) % modes.length;
		this.setMode(modes[nextIndex]);
	}

	/**
	 * 订阅模式变化
	 */
	subscribe(callback: (mode: FileListTagDisplayMode) => void): () => void {
		// 立即调用一次
		callback(this._mode);
		this._subscribers.add(callback);
		return () => {
			this._subscribers.delete(callback);
		};
	}

	/**
	 * 获取模式的显示文本
	 */
	getModeLabel(mode?: FileListTagDisplayMode): string {
		const m = mode ?? this._mode;
		switch (m) {
			case 'all': return '全部';
			case 'collect': return '收藏';
			case 'none': return '隐藏';
		}
	}

	/**
	 * 获取模式的描述
	 */
	getModeDescription(mode?: FileListTagDisplayMode): string {
		const m = mode ?? this._mode;
		switch (m) {
			case 'all': return '显示所有标签';
			case 'collect': return '仅显示收藏的标签';
			case 'none': return '不显示标签';
		}
	}
}

export const fileListTagSettings = new FileListTagSettingsStore();
