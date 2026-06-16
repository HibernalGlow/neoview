/**
 * Window Manager
 * 窗口管理器 - 支持应用多开和多窗口管理
 * 主窗口为无边框（decorations: false），所有新窗口保持一致
 * 窗口位置/大小持久化由 tauri-plugin-window-state 负责
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

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
	private fullscreenUnlisten: UnlistenFn | null = null;
	private resizeDebounce: ReturnType<typeof setTimeout> | null = null;

	/**
	 * 创建新窗口（无边框，和主窗口一致）
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
				decorations: false,
				resizable: true,
				minimizable: true,
				maximizable: true,
				closable: true,
				transparent: false
			});

			this.windows.set(windowId, window);

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
		if (!window) return false;

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

	// =========================================================================
	// 全屏
	// =========================================================================

	/**
	 * 获取当前窗口是否为全屏
	 */
	async isFullscreen(): Promise<boolean> {
		try {
			return await getCurrentWindow().isFullscreen();
		} catch (error) {
			console.error('获取全屏状态失败:', error);
			return false;
		}
	}

	/**
	 * 设置当前窗口全屏状态
	 *
	 * 主窗口已经是 decorations: false，不需要额外调 setDecorations。
	 * 全屏前如果窗口是最大化状态，先取消最大化避免退出全屏后窗口状态异常。
	 */
	async setFullscreen(fullscreen: boolean): Promise<void> {
		try {
			const win = getCurrentWindow();

			if (fullscreen) {
				// 进入全屏前取消最大化，避免退出全屏后窗口状态异常
				const isMaximized = await win.isMaximized();
				if (isMaximized) {
					await win.unmaximize();
					await new Promise((resolve) => setTimeout(resolve, 32));
				}
				await win.setFullscreen(true);
			} else {
				await win.setFullscreen(false);
			}
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
	 * 监听窗口 resize 事件，防抖检查全屏状态
	 */
	async initFullscreenSync(onStateChange: (isFullscreen: boolean) => void): Promise<void> {
		if (this.fullscreenUnlisten) {
			this.fullscreenUnlisten();
			this.fullscreenUnlisten = null;
		}

		try {
			const win = getCurrentWindow();

			this.fullscreenUnlisten = await win.onResized(() => {
				// 防抖：resize 事件会频繁触发，延迟 150ms 再检查
				if (this.resizeDebounce) clearTimeout(this.resizeDebounce);
				this.resizeDebounce = setTimeout(async () => {
					const isFs = await this.isFullscreen();
					onStateChange(isFs);
				}, 150);
			});
		} catch (error) {
			console.error('初始化全屏状态同步失败:', error);
		}
	}

	/**
	 * 同步全屏状态
	 */
	async syncFullscreenState(): Promise<boolean> {
		return await this.isFullscreen();
	}

	/**
	 * 清理全屏状态监听器
	 */
	cleanupFullscreenSync(): void {
		if (this.fullscreenUnlisten) {
			this.fullscreenUnlisten();
			this.fullscreenUnlisten = null;
		}
		if (this.resizeDebounce) {
			clearTimeout(this.resizeDebounce);
			this.resizeDebounce = null;
		}
	}

	// =========================================================================
	// 窗口置顶
	// =========================================================================

	/**
	 * 设置窗口置顶
	 */
	async setAlwaysOnTop(onTop: boolean): Promise<void> {
		try {
			await getCurrentWindow().setAlwaysOnTop(onTop);
		} catch (error) {
			console.error('设置窗口置顶失败:', error);
		}
	}

	/**
	 * 切换窗口置顶
	 */
	async toggleAlwaysOnTop(): Promise<boolean> {
		try {
			const win = getCurrentWindow();
			const current = await win.isAlwaysOnTop();
			await win.setAlwaysOnTop(!current);
			return !current;
		} catch (error) {
			console.error('切换窗口置顶失败:', error);
			return false;
		}
	}

	// =========================================================================
	// 窗口大小限制
	// =========================================================================

	/**
	 * 设置窗口最小尺寸
	 */
	async setMinSize(width: number, height: number): Promise<void> {
		try {
			await getCurrentWindow().setMinSize(new PhysicalSize(width, height));
		} catch (error) {
			console.error('设置窗口最小尺寸失败:', error);
		}
	}

	/**
	 * 设置窗口最大尺寸
	 */
	async setMaxSize(width: number, height: number): Promise<void> {
		try {
			await getCurrentWindow().setMaxSize(new PhysicalSize(width, height));
		} catch (error) {
			console.error('设置窗口最大尺寸失败:', error);
		}
	}
}

// 单例
export const windowManager = new WindowManager();
