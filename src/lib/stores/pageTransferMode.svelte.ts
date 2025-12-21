/**
 * 页面传输模式 Store
 * 
 * 用于切换 Base64 和直接二进制传输模式
 * 方便调试和性能对比
 */

export type PageTransferMode = 'binary' | 'base64';

class PageTransferModeStore {
	// 默认使用二进制传输（更快）
	mode = $state<PageTransferMode>('binary');

	toggle() {
		this.mode = this.mode === 'binary' ? 'base64' : 'binary';
		console.log(`📦 [PageTransfer] 切换传输模式: ${this.mode}`);
	}

	setMode(mode: PageTransferMode) {
		this.mode = mode;
		console.log(`📦 [PageTransfer] 设置传输模式: ${this.mode}`);
	}

	get isBinary() {
		return this.mode === 'binary';
	}

	get isBase64() {
		return this.mode === 'base64';
	}
}

export const pageTransferModeStore = new PageTransferModeStore();
