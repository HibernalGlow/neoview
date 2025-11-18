/**
 * Window Manager
 * 窗口管理器 - 支持应用多开和多窗口管理
 */

import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { appWindow } from '@tauri-apps/api/window';

export interface WindowInfo {
	id: string;
	label: string;
	title: string;
	url: string;
	createdAt: number;
}

class WindowManager {
	private windows = new Map<string, WebviewWindow>();
	private windowCounter = 0;

	/**
	 * 创建新窗口
	 */
	async createWindow(
		label: string,
		url: string,
		options?: {
			title?: string;
			width?: number;
			height?: number;
			center?: boolean;
		}
	): Promise<WebviewWindow | null> {
		try {
			const windowId = `window-${++this.windowCounter}-${Date.now()}`;
			const window = new WebviewWindow(windowId, {
				url,
				title: options?.title || label,
				width: options?.width || 1200,
				height: options?.height || 800,
				center: options?.center !== false,
				decorations: true,
				resizable: true,
				minimizable: true,
				maximizable: true,
				closable: true
			});

			this.windows.set(windowId, window);

			// 监听窗口关闭事件
			window.once('tauri://close-requested', () => {
				this.windows.delete(windowId);
			});

			return window;
		} catch (error) {
			console.error('创建新窗口失败:', error);
			return null;
		}
	}

	/**
	 * 创建查看器窗口
	 */
	async createViewerWindow(bookPath?: string): Promise<WebviewWindow | null> {
		const url = bookPath
			? `/standalone/viewer?book=${encodeURIComponent(bookPath)}`
			: '/standalone/viewer';
		return this.createWindow('viewer', url, {
			title: 'NeoView 查看器',
			width: 1400,
			height: 900
		});
	}

	/**
	 * 创建文件浏览器窗口
	 */
	async createFileBrowserWindow(path?: string): Promise<WebviewWindow | null> {
		const url = path
			? `/standalone/filebrowser?path=${encodeURIComponent(path)}`
			: '/standalone/filebrowser';
		return this.createWindow('filebrowser', url, {
			title: 'NeoView 文件浏览器',
			width: 1000,
			height: 700
		});
	}

	/**
	 * 获取所有窗口
	 */
	getAllWindows(): WebviewWindow[] {
		return Array.from(this.windows.values());
	}

	/**
	 * 获取窗口数量
	 */
	getWindowCount(): number {
		return this.windows.size;
	}

	/**
	 * 关闭指定窗口
	 */
	async closeWindow(windowId: string): Promise<boolean> {
		const window = this.windows.get(windowId);
		if (!window) {
			return false;
		}

		try {
			await window.close();
			this.windows.delete(windowId);
			return true;
		} catch (error) {
			console.error('关闭窗口失败:', error);
			return false;
		}
	}

	/**
	 * 关闭所有窗口（除了主窗口）
	 */
	async closeAllWindows(): Promise<void> {
		const windowsToClose = Array.from(this.windows.entries());
		for (const [windowId, window] of windowsToClose) {
			try {
				await window.close();
				this.windows.delete(windowId);
			} catch (error) {
				console.error(`关闭窗口 ${windowId} 失败:`, error);
			}
		}
	}
}

// 单例
export const windowManager = new WindowManager();

