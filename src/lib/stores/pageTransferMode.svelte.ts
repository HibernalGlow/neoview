/**
 * 页面传输模式 Store
 * 
 * 用于切换 Base64 和直接二进制传输模式
 * 方便调试和性能对比
 * 
 * 持久化到 localStorage
 */

export type PageTransferMode = 'binary' | 'base64';

const STORAGE_KEY = 'neoview:pageTransferMode';

class PageTransferModeStore {
	// 默认使用 Base64 传输（兼容性好）
	mode = $state<PageTransferMode>('base64');

	constructor() {
		// 从 localStorage 恢复
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved === 'binary' || saved === 'base64') {
				this.mode = saved;
			}
		}
	}

	toggle() {
		this.mode = this.mode === 'binary' ? 'base64' : 'binary';
		this.save();
		console.log(`📦 [PageTransfer] 切换传输模式: ${this.mode}`);
	}

	setMode(mode: PageTransferMode) {
		this.mode = mode;
		this.save();
		console.log(`📦 [PageTransfer] 设置传输模式: ${this.mode}`);
	}

	private save() {
		if (typeof window !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, this.mode);
		}
	}

	get isBinary() {
		return this.mode === 'binary';
	}

	get isBase64() {
		return this.mode === 'base64';
	}
}

export const pageTransferModeStore = new PageTransferModeStore();
