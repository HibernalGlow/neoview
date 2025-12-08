/**
 * GitHub Gist 同步存储管理
 * 支持将设置同步到 GitHub Gist
 */

const STORAGE_KEY = 'neoview-gist-sync';

export interface GistSyncConfig {
	/** GitHub Personal Access Token */
	token: string;
	/** Gist ID (创建后保存) */
	gistId: string;
	/** 是否启用自动同步 */
	autoSync: boolean;
	/** 自动同步间隔 (分钟) */
	syncInterval: number;
	/** 上次同步时间 */
	lastSyncTime: number;
	/** 同步的文件名 */
	filename: string;
	/** Gist 描述 */
	description: string;
	/** 是否公开 */
	isPublic: boolean;
	/** 同步条件：仅在设置变更时同步 */
	syncOnChange: boolean;
}

export interface GistFile {
	filename: string;
	type: string;
	language: string;
	raw_url: string;
	size: number;
	truncated: boolean;
	content: string;
}

export interface GistResponse {
	id: string;
	url: string;
	html_url: string;
	files: Record<string, GistFile>;
	public: boolean;
	created_at: string;
	updated_at: string;
	description: string;
	owner?: {
		login: string;
		avatar_url: string;
	};
}

export interface GitHubUser {
	login: string;
	avatar_url: string;
	name: string | null;
	html_url: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

const DEFAULT_CONFIG: GistSyncConfig = {
	token: '',
	gistId: '',
	autoSync: false,
	syncInterval: 60,
	lastSyncTime: 0,
	filename: 'neoview-settings.json',
	description: 'NeoView Settings Backup',
	isPublic: false,
	syncOnChange: false
};

class GistSyncStore {
	private _config = $state<GistSyncConfig>({ ...DEFAULT_CONFIG });
	private _status = $state<SyncStatus>('idle');
	private _statusMessage = $state<string>('');
	private _user = $state<GitHubUser | null>(null);
	private _syncTimer: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.load();
	}

	// Getters
	get config() {
		return this._config;
	}

	get status() {
		return this._status;
	}

	get statusMessage() {
		return this._statusMessage;
	}

	get user() {
		return this._user;
	}

	get isLoggedIn() {
		return !!this._config.token && !!this._user;
	}

	/** 从 localStorage 加载配置 */
	private load() {
		if (typeof window === 'undefined') return;
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				this._config = { ...DEFAULT_CONFIG, ...parsed };
				
				// 如果有 token，验证并获取用户信息
				if (this._config.token) {
					this.validateToken();
				}
				
				// 启动自动同步
				if (this._config.autoSync) {
					this.startAutoSync();
				}
			}
		} catch (e) {
			console.error('加载 Gist 同步配置失败:', e);
		}
	}

	/** 保存配置到 localStorage */
	private save() {
		if (typeof window === 'undefined') return;
		try {
			// 不保存敏感信息的明文，但这里为了简单先直接保存
			// 生产环境应该使用 Tauri 的安全存储
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this._config));
		} catch (e) {
			console.error('保存 Gist 同步配置失败:', e);
		}
	}

	/** 更新配置 */
	updateConfig(partial: Partial<GistSyncConfig>) {
		this._config = { ...this._config, ...partial };
		this.save();
		
		// 处理自动同步开关
		if ('autoSync' in partial || 'syncInterval' in partial) {
			if (this._config.autoSync) {
				this.startAutoSync();
			} else {
				this.stopAutoSync();
			}
		}
	}

	/** 验证 Token 并获取用户信息 */
	async validateToken(): Promise<boolean> {
		if (!this._config.token) {
			this._user = null;
			return false;
		}

		try {
			const response = await fetch('https://api.github.com/user', {
				headers: {
					Authorization: `Bearer ${this._config.token}`,
					Accept: 'application/vnd.github.v3+json'
				}
			});

			if (response.ok) {
				this._user = await response.json();
				return true;
			} else {
				this._user = null;
				return false;
			}
		} catch (e) {
			console.error('验证 GitHub Token 失败:', e);
			this._user = null;
			return false;
		}
	}

	/** 登录 (设置 Token) */
	async login(token: string): Promise<{ success: boolean; message: string }> {
		this._status = 'syncing';
		this._statusMessage = '正在验证 Token...';

		this._config.token = token;
		const valid = await this.validateToken();

		if (valid) {
			this.save();
			this._status = 'success';
			this._statusMessage = `已登录为 ${this._user?.login}`;
			return { success: true, message: `已登录为 ${this._user?.login}` };
		} else {
			this._config.token = '';
			this._status = 'error';
			this._statusMessage = 'Token 无效或无权限';
			return { success: false, message: 'Token 无效或无权限，请确保 Token 具有 gist 权限' };
		}
	}

	/** 登出 */
	logout() {
		this._config.token = '';
		this._config.gistId = '';
		this._user = null;
		this.stopAutoSync();
		this.save();
		this._status = 'idle';
		this._statusMessage = '';
	}

	/** 创建新 Gist */
	async createGist(content: string): Promise<{ success: boolean; gistId?: string; message: string }> {
		if (!this._config.token) {
			return { success: false, message: '请先登录' };
		}

		this._status = 'syncing';
		this._statusMessage = '正在创建 Gist...';

		try {
			const response = await fetch('https://api.github.com/gists', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this._config.token}`,
					Accept: 'application/vnd.github.v3+json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					description: this._config.description,
					public: this._config.isPublic,
					files: {
						[this._config.filename]: {
							content
						}
					}
				})
			});

			if (response.ok) {
				const gist: GistResponse = await response.json();
				this._config.gistId = gist.id;
				this._config.lastSyncTime = Date.now();
				this.save();
				this._status = 'success';
				this._statusMessage = '已创建 Gist';
				return { success: true, gistId: gist.id, message: '已创建 Gist' };
			} else {
				const error = await response.json();
				this._status = 'error';
				this._statusMessage = `创建失败: ${error.message}`;
				return { success: false, message: `创建失败: ${error.message}` };
			}
		} catch (e) {
			this._status = 'error';
			this._statusMessage = `创建失败: ${e}`;
			return { success: false, message: `创建失败: ${e}` };
		}
	}

	/** 更新 Gist */
	async updateGist(content: string): Promise<{ success: boolean; message: string }> {
		if (!this._config.token) {
			return { success: false, message: '请先登录' };
		}

		if (!this._config.gistId) {
			return this.createGist(content);
		}

		this._status = 'syncing';
		this._statusMessage = '正在上传到 Gist...';

		try {
			const response = await fetch(`https://api.github.com/gists/${this._config.gistId}`, {
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${this._config.token}`,
					Accept: 'application/vnd.github.v3+json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					description: this._config.description,
					files: {
						[this._config.filename]: {
							content
						}
					}
				})
			});

			if (response.ok) {
				this._config.lastSyncTime = Date.now();
				this.save();
				this._status = 'success';
				this._statusMessage = '已上传到 Gist';
				return { success: true, message: '已上传到 Gist' };
			} else if (response.status === 404) {
				// Gist 不存在，创建新的
				this._config.gistId = '';
				return this.createGist(content);
			} else {
				const error = await response.json();
				this._status = 'error';
				this._statusMessage = `上传失败: ${error.message}`;
				return { success: false, message: `上传失败: ${error.message}` };
			}
		} catch (e) {
			this._status = 'error';
			this._statusMessage = `上传失败: ${e}`;
			return { success: false, message: `上传失败: ${e}` };
		}
	}

	/** 从 Gist 下载 */
	async downloadFromGist(): Promise<{ success: boolean; content?: string; message: string }> {
		if (!this._config.token) {
			return { success: false, message: '请先登录' };
		}

		if (!this._config.gistId) {
			return { success: false, message: '没有关联的 Gist，请先上传' };
		}

		this._status = 'syncing';
		this._statusMessage = '正在从 Gist 下载...';

		try {
			const response = await fetch(`https://api.github.com/gists/${this._config.gistId}`, {
				headers: {
					Authorization: `Bearer ${this._config.token}`,
					Accept: 'application/vnd.github.v3+json'
				}
			});

			if (response.ok) {
				const gist: GistResponse = await response.json();
				const file = gist.files[this._config.filename];
				
				if (!file) {
					this._status = 'error';
					this._statusMessage = `Gist 中没有找到文件: ${this._config.filename}`;
					return { success: false, message: `Gist 中没有找到文件: ${this._config.filename}` };
				}

				this._status = 'success';
				this._statusMessage = '已从 Gist 下载';
				return { success: true, content: file.content, message: '已从 Gist 下载' };
			} else {
				const error = await response.json();
				this._status = 'error';
				this._statusMessage = `下载失败: ${error.message}`;
				return { success: false, message: `下载失败: ${error.message}` };
			}
		} catch (e) {
			this._status = 'error';
			this._statusMessage = `下载失败: ${e}`;
			return { success: false, message: `下载失败: ${e}` };
		}
	}

	/** 获取用户的所有 Gist */
	async listUserGists(): Promise<GistResponse[]> {
		if (!this._config.token) {
			return [];
		}

		try {
			const response = await fetch('https://api.github.com/gists', {
				headers: {
					Authorization: `Bearer ${this._config.token}`,
					Accept: 'application/vnd.github.v3+json'
				}
			});

			if (response.ok) {
				return await response.json();
			}
		} catch (e) {
			console.error('获取 Gist 列表失败:', e);
		}

		return [];
	}

	/** 使用指定的 Gist ID */
	async useGist(gistId: string): Promise<{ success: boolean; message: string }> {
		if (!this._config.token) {
			return { success: false, message: '请先登录' };
		}

		this._status = 'syncing';
		this._statusMessage = '正在验证 Gist...';

		try {
			const response = await fetch(`https://api.github.com/gists/${gistId}`, {
				headers: {
					Authorization: `Bearer ${this._config.token}`,
					Accept: 'application/vnd.github.v3+json'
				}
			});

			if (response.ok) {
				this._config.gistId = gistId;
				this.save();
				this._status = 'success';
				this._statusMessage = '已关联 Gist';
				return { success: true, message: '已关联 Gist' };
			} else {
				this._status = 'error';
				this._statusMessage = 'Gist 不存在或无权访问';
				return { success: false, message: 'Gist 不存在或无权访问' };
			}
		} catch (e) {
			this._status = 'error';
			this._statusMessage = `验证失败: ${e}`;
			return { success: false, message: `验证失败: ${e}` };
		}
	}

	/** 启动自动同步 */
	startAutoSync() {
		this.stopAutoSync();
		
		if (!this._config.autoSync || !this._config.token) {
			return;
		}

		const intervalMs = this._config.syncInterval * 60 * 1000;
		this._syncTimer = setInterval(() => {
			// 自动同步逻辑由外部调用 syncNow 实现
			window.dispatchEvent(new CustomEvent('gist-auto-sync'));
		}, intervalMs);
	}

	/** 停止自动同步 */
	stopAutoSync() {
		if (this._syncTimer) {
			clearInterval(this._syncTimer);
			this._syncTimer = null;
		}
	}

	/** 重置状态 */
	resetStatus() {
		this._status = 'idle';
		this._statusMessage = '';
	}
}

export const gistSyncStore = new GistSyncStore();
