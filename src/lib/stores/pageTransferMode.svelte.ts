/**
 * 页面传输模式 Store
 *
 * 用于切换 Protocol / Base64 传输模式
 * 方便调试和性能对比
 *
 * 持久化到 localStorage
 */

export type PageTransferMode = 'binary' | 'base64' | 'protocol';

const STORAGE_KEY = 'neoview:pageTransferMode';

class PageTransferModeStore {
	// 默认使用 Protocol 传输（neoview:// 自定义协议，绕过 IPC 序列化）
	mode = $state<PageTransferMode>('protocol');

	constructor() {
		// 从 localStorage 恢复，并自动迁移旧模式
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved === 'protocol') {
				this.mode = saved;
			} else if (saved === 'binary' || saved === 'base64') {
				// 自动迁移到 protocol
				this.mode = 'protocol';
				this.save();
				console.log(`📦 [PageTransfer] 已迁移传输模式: ${saved} → protocol`);
			}
		}
	}

	toggle() {
		this.mode = this.mode === 'protocol' ? 'base64' : 'protocol';
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

	get isProtocol() {
		return this.mode === 'protocol';
	}
}

export const pageTransferModeStore = new PageTransferModeStore();
