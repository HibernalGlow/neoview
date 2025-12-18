/**
 * Window Manager
 * 窗口管理器 - 支持应用多开和多窗口管理
 */

import { listen, isRunningInTauri } from '$lib/api/adapter';
import type { UnlistenFn } from '@tauri-apps/api/event';

export interface WindowInfo {
	id: string;
	label: string;
	title: string;
	url: string;
	createdAt: number;
}

class WindowManager {
	private windows = new Map<string, unknown>();
	private windowCounter = 0;
	private fullscreenUnlisten: UnlistenFn | null = null;

	/**
	 * 创建新窗口
	 * 浏览器模式下使用 window.open
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
	): Promise<unknown | null> {
		const windowId = `window-${++this.windowCounter}-${Date.now()}`;
		
		// 浏览器模式：使用 window.open
		if (!isRunningInTauri()) {
			const width = options?.width || 1200;
			const height = options?.height || 800;
			const newWindow = window.open(url, windowId, `width=${width},height=${height}`);
			if (newWindow) {
				this.windows.set(windowId, newWindow);
				newWindow.document.title = options?.title || label;
			}
			return newWindow;
		}
		
		// Tauri 模式：使用 WebviewWindow
		try {
			const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
			const tauriWindow = new WebviewWindow(windowId, {
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

			this.windows.set(windowId, tauriWindow);

			// 监听窗口关闭事件
			tauriWindow.once('tauri://close-requested', () => {
				this.windows.delete(windowId);
			});

			return tauriWindow;
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
	getAllWindows(): unknown[] {
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
		const win = this.windows.get(windowId);
		if (!win) {
			return false;
		}

		try {
			// 浏览器模式
			if (!isRunningInTauri() && win instanceof Window) {
				win.close();
				this.windows.delete(windowId);
				return true;
			}
			// Tauri 模式
			await (win as { close: () => Promise<void> }).close();
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
		for (const [windowId, win] of windowsToClose) {
			try {
				// 浏览器模式
				if (!isRunningInTauri() && win instanceof Window) {
					win.close();
				} else {
					// Tauri 模式
					await (win as { close: () => Promise<void> }).close();
				}
				this.windows.delete(windowId);
			} catch (error) {
				console.error(`关闭窗口 ${windowId} 失败:`, error);
			}
		}
	}

	/**
	 * 获取当前窗口是否为全屏
	 */
	async isFullscreen(): Promise<boolean> {
		// 浏览器模式：使用 Fullscreen API
		if (!isRunningInTauri()) {
			return !!document.fullscreenElement;
		}
		
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();
			return await win.isFullscreen();
		} catch (error) {
			console.error('获取全屏状态失败:', error);
			return false;
		}
	}

	/**
	 * 设置当前窗口全屏状态
	 */
	async setFullscreen(fullscreen: boolean): Promise<void> {
		// 浏览器模式：使用 Fullscreen API
		if (!isRunningInTauri()) {
			try {
				if (fullscreen) {
					await document.documentElement.requestFullscreen();
				} else if (document.fullscreenElement) {
					await document.exitFullscreen();
				}
			} catch (error) {
				console.error('设置全屏状态失败:', error);
			}
			return;
		}
		
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();
			await win.setFullscreen(fullscreen);
		} catch (error) {
			console.error('设置全屏状态失败:', error);
		}
	}

	/**
	 * 切换当前窗口全屏状态
	 */
	async toggleFullscreen(): Promise<boolean> {
		const current = await this.isFullscreen();
		await this.setFullscreen(!current);
		return !current;
	}

	/**
	 * 初始化全屏状态同步
	 * 监听原生窗口的全屏状态变化事件，并在状态变化时调用回调
	 * @param onStateChange 状态变化时的回调函数
	 * Requirements: 4.1, 4.3
	 */
	async initFullscreenSync(onStateChange: (isFullscreen: boolean) => void): Promise<void> {
		// 清理之前的监听器（如果存在）
		if (this.fullscreenUnlisten) {
			this.fullscreenUnlisten();
			this.fullscreenUnlisten = null;
		}

		// 浏览器模式：监听 fullscreenchange 事件
		if (!isRunningInTauri()) {
			const handler = () => {
				onStateChange(!!document.fullscreenElement);
			};
			document.addEventListener('fullscreenchange', handler);
			this.fullscreenUnlisten = () => document.removeEventListener('fullscreenchange', handler);
			return;
		}

		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();
			
			// 监听窗口进入全屏事件
			const unlistenEnter = await win.onResized(async () => {
				// 当窗口大小变化时检查全屏状态
				const isFs = await this.isFullscreen();
				onStateChange(isFs);
			});

			// 存储 unlisten 函数用于清理
			this.fullscreenUnlisten = unlistenEnter;
		} catch (error) {
			console.error('初始化全屏状态同步失败:', error);
		}
	}

	/**
	 * 同步全屏状态
	 * 查询当前原生窗口的全屏状态并返回
	 * @returns 当前全屏状态
	 * Requirements: 1.1
	 */
	async syncFullscreenState(): Promise<boolean> {
		return await this.isFullscreen();
	}

	/**
	 * 清理全屏状态监听器
	 * 移除之前注册的事件监听器
	 * Requirements: 4.1
	 */
	cleanupFullscreenSync(): void {
		if (this.fullscreenUnlisten) {
			this.fullscreenUnlisten();
			this.fullscreenUnlisten = null;
		}
	}
}

// 单例
export const windowManager = new WindowManager();
