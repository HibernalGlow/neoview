/**
 * CardWindowManager - 卡片窗口管理器
 * 管理卡片窗口的生命周期、持久化和跨窗口通信
 * Requirements: 1.2, 1.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4
 */

import { emit, listen, isRunningInTauri, type UnlistenFn } from '$lib/api/window';
import { cardRegistry } from '$lib/cards/registry';
import { 
	CardWindowTabStore, 
	getOrCreateTabStore, 
	getTabStore, 
	registerTabStore, 
	removeTabStore,
	getAllWindowIds,
	type CardTabConfig 
} from '$lib/stores/cardWindowTabStore.svelte';

// ============ Types ============

export interface CardWindowConfig {
	windowId: string;
	label: string;
	tabs: CardTabConfig[];
	activeTabId: string;
	position?: { x: number; y: number };
	size?: { width: number; height: number };
	createdAt: number;
}

export interface PersistedCardWindowConfig {
	version: number;
	windows: CardWindowConfig[];
}

export interface TabTransferPayload {
	sourceWindowId: string;
	targetWindowId: string;
	tabConfig: CardTabConfig;
}

// ============ Constants ============

const STORAGE_KEY = 'neoview_card_windows_v1';
const CONFIG_VERSION = 1;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

// ============ CardWindowManager Class ============

class CardWindowManagerImpl {
	private windows = new Map<string, unknown>();
	private windowCounter = 0;
	private unlistenFns: UnlistenFn[] = [];
	private initialized = false;

	/**
	 * 初始化管理器
	 */
	async init(): Promise<void> {
		if (this.initialized) return;
		
		// 监听窗口间通信事件
		const unlistenTransfer = await listen<TabTransferPayload>('card-window-tab-transfer', (event) => {
			this.handleTabTransfer(event.payload);
		});
		this.unlistenFns.push(unlistenTransfer);

		const unlistenClose = await listen<string>('card-window-closed', (event) => {
			this.handleWindowClosed(event.payload);
		});
		this.unlistenFns.push(unlistenClose);

		this.initialized = true;
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		this.unlistenFns.forEach(fn => fn());
		this.unlistenFns = [];
		this.initialized = false;
	}

	/**
	 * 创建新卡片窗口
	 * Requirements: 1.2, 1.4
	 */
	async createCardWindow(cardId: string): Promise<string | null> {
		// 验证卡片 ID
		if (!cardRegistry[cardId]) {
			console.error(`[CardWindowManager] Invalid card ID: ${cardId}`);
			return null;
		}

		const windowId = `card-window-${++this.windowCounter}-${Date.now()}`;
		const cardDef = cardRegistry[cardId];
		const url = `/cardwindow.html?windowId=${encodeURIComponent(windowId)}&cardId=${encodeURIComponent(cardId)}`;

		// 浏览器模式：使用 window.open
		if (!isRunningInTauri()) {
			const newWindow = window.open(url, windowId, `width=${DEFAULT_WIDTH},height=${DEFAULT_HEIGHT}`);
			if (newWindow) {
				this.windows.set(windowId, newWindow);
				newWindow.document.title = cardDef.title;
				// 创建标签页 store
				getOrCreateTabStore(windowId, cardId);
				this.saveConfigs();
			}
			return newWindow ? windowId : null;
		}

		// Tauri 模式
		try {
			const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
			const tauriWindow = new WebviewWindow(windowId, {
				url,
				title: cardDef.title,
				width: DEFAULT_WIDTH,
				height: DEFAULT_HEIGHT,
				center: true,
				decorations: false, // 无边框窗口，使用自定义标题栏
				resizable: true,
				minimizable: true,
				maximizable: true,
				closable: true
			});

			this.windows.set(windowId, tauriWindow);

			// 创建标签页 store
			getOrCreateTabStore(windowId, cardId);
			
			// 监听窗口关闭事件
			tauriWindow.once('tauri://close-requested', async () => {
				await this.closeCardWindow(windowId);
			});

			// 保存配置
			this.saveConfigs();

			return windowId;
		} catch (error) {
			console.error('[CardWindowManager] Failed to create window:', error);
			return null;
		}
	}

	/**
	 * 从配置创建窗口（用于恢复）
	 */
	async createWindowFromConfig(config: CardWindowConfig): Promise<string | null> {
		const windowId = config.windowId;
		const firstTab = config.tabs[0];
		
		if (!firstTab || !cardRegistry[firstTab.cardId]) {
			console.warn(`[CardWindowManager] Invalid config for window ${windowId}`);
			return null;
		}

		const cardDef = cardRegistry[firstTab.cardId];
		const url = `/cardwindow.html?windowId=${encodeURIComponent(windowId)}`;
		const width = config.size?.width || DEFAULT_WIDTH;
		const height = config.size?.height || DEFAULT_HEIGHT;

		// 浏览器模式：使用 window.open
		if (!isRunningInTauri()) {
			const newWindow = window.open(url, windowId, `width=${width},height=${height}`);
			if (newWindow) {
				this.windows.set(windowId, newWindow);
				newWindow.document.title = cardDef.title;
				
				// 从配置创建标签页 store
				const tabStore = CardWindowTabStore.fromConfig(windowId, config.tabs);
				if (config.activeTabId && tabStore.tabs.find(t => t.id === config.activeTabId)) {
					tabStore.setActiveTab(config.activeTabId);
				}
				registerTabStore(windowId, tabStore);
			}
			return newWindow ? windowId : null;
		}

		// Tauri 模式
		try {
			const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
			const tauriWindow = new WebviewWindow(windowId, {
				url,
				title: cardDef.title,
				width,
				height,
				x: config.position?.x,
				y: config.position?.y,
				center: !config.position,
				decorations: false, // 无边框窗口，使用自定义标题栏
				resizable: true,
				minimizable: true,
				maximizable: true,
				closable: true
			});

			this.windows.set(windowId, tauriWindow);

			// 从配置创建标签页 store
			const tabStore = CardWindowTabStore.fromConfig(windowId, config.tabs);
			if (config.activeTabId && tabStore.tabs.find(t => t.id === config.activeTabId)) {
				tabStore.setActiveTab(config.activeTabId);
			}
			registerTabStore(windowId, tabStore);

			// 监听窗口关闭事件
			tauriWindow.once('tauri://close-requested', async () => {
				await this.closeCardWindow(windowId);
			});

			return windowId;
		} catch (error) {
			console.error('[CardWindowManager] Failed to create window from config:', error);
			return null;
		}
	}

	/**
	 * 向现有窗口添加标签页
	 */
	addTabToWindow(windowId: string, cardId: string): string | null {
		const tabStore = getTabStore(windowId);
		if (!tabStore) {
			console.warn(`[CardWindowManager] Window not found: ${windowId}`);
			return null;
		}

		const tabId = tabStore.addTab(cardId);
		if (tabId) {
			this.saveConfigs();
		}
		return tabId;
	}

	/**
	 * 关闭卡片窗口
	 * Requirements: 5.3
	 */
	async closeCardWindow(windowId: string): Promise<void> {
		const win = this.windows.get(windowId);
		
		// 移除标签页 store
		removeTabStore(windowId);
		
		// 关闭窗口
		if (win) {
			try {
				// 浏览器模式
				if (!isRunningInTauri() && win instanceof Window) {
					win.close();
				} else {
					// Tauri 模式
					await (win as { close: () => Promise<void> }).close();
				}
			} catch {
				// 窗口可能已经关闭
			}
			this.windows.delete(windowId);
		}

		// 更新持久化配置
		this.saveConfigs();

		// 通知其他窗口
		await emit('card-window-closed', windowId);
	}

	/**
	 * 获取所有卡片窗口配置
	 */
	getAllCardWindows(): CardWindowConfig[] {
		const windowIds = getAllWindowIds();
		return windowIds.map(windowId => {
			const tabStore = getTabStore(windowId);
			if (!tabStore) return null;

			return {
				windowId,
				label: `Card Window ${windowId}`,
				tabs: tabStore.toConfig(),
				activeTabId: tabStore.activeTabId,
				createdAt: Date.now()
			};
		}).filter((config): config is CardWindowConfig => config !== null);
	}

	/**
	 * 跨窗口移动标签页
	 * Requirements: 4.2, 4.3
	 */
	moveTabBetweenWindows(
		sourceWindowId: string,
		targetWindowId: string,
		tabId: string
	): boolean {
		const sourceStore = getTabStore(sourceWindowId);
		const targetStore = getTabStore(targetWindowId);

		if (!sourceStore || !targetStore) {
			console.warn('[CardWindowManager] Source or target window not found');
			return false;
		}

		// 获取要移动的标签页
		const tab = sourceStore.tabs.find(t => t.id === tabId);
		if (!tab) {
			console.warn(`[CardWindowManager] Tab not found: ${tabId}`);
			return false;
		}

		// 从源窗口移除
		const wasOnlyTab = sourceStore.tabCount === 1;
		sourceStore.removeTab(tabId);

		// 添加到目标窗口
		targetStore.addTab(tab.cardId);

		// 如果源窗口只有一个标签页，关闭源窗口
		if (wasOnlyTab) {
			this.closeCardWindow(sourceWindowId);
		}

		// 保存配置
		this.saveConfigs();

		return true;
	}

	/**
	 * 拖拽标签页到窗口外创建新窗口
	 * Requirements: 4.1
	 */
	async dragTabToNewWindow(sourceWindowId: string, tabId: string): Promise<string | null> {
		const sourceStore = getTabStore(sourceWindowId);
		if (!sourceStore) return null;

		const tab = sourceStore.tabs.find(t => t.id === tabId);
		if (!tab) return null;

		// 创建新窗口
		const newWindowId = await this.createCardWindow(tab.cardId);
		if (!newWindowId) return null;

		// 从源窗口移除标签页
		const wasOnlyTab = sourceStore.tabCount === 1;
		sourceStore.removeTab(tabId);

		// 如果源窗口只有一个标签页，关闭源窗口
		if (wasOnlyTab) {
			await this.closeCardWindow(sourceWindowId);
		}

		this.saveConfigs();
		return newWindowId;
	}

	// ============ Persistence ============

	/**
	 * 保存配置到 localStorage
	 * Requirements: 5.1
	 */
	saveConfigs(): void {
		try {
			const config: PersistedCardWindowConfig = {
				version: CONFIG_VERSION,
				windows: this.getAllCardWindows()
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
		} catch (error) {
			console.error('[CardWindowManager] Failed to save configs:', error);
		}
	}

	/**
	 * 从 localStorage 加载配置
	 */
	loadConfigs(): PersistedCardWindowConfig | null {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (!stored) return null;

			const config = JSON.parse(stored) as PersistedCardWindowConfig;
			
			// 版本检查
			if (config.version !== CONFIG_VERSION) {
				console.warn('[CardWindowManager] Config version mismatch, resetting');
				return null;
			}

			return config;
		} catch (error) {
			console.error('[CardWindowManager] Failed to load configs:', error);
			return null;
		}
	}

	/**
	 * 恢复之前的窗口
	 * Requirements: 5.2, 5.4
	 */
	async restoreWindows(): Promise<void> {
		const config = this.loadConfigs();
		if (!config || config.windows.length === 0) return;

		for (const windowConfig of config.windows) {
			// 过滤无效的卡片
			const validTabs = windowConfig.tabs.filter(tab => cardRegistry[tab.cardId]);
			
			if (validTabs.length === 0) {
				console.warn(`[CardWindowManager] No valid tabs for window ${windowConfig.windowId}`);
				continue;
			}

			// 更新配置中的标签页
			const updatedConfig: CardWindowConfig = {
				...windowConfig,
				tabs: validTabs,
				activeTabId: validTabs.find(t => t.tabId === windowConfig.activeTabId)
					? windowConfig.activeTabId
					: validTabs[0].tabId
			};

			await this.createWindowFromConfig(updatedConfig);
		}
	}

	// ============ Event Handlers ============

	/**
	 * 处理标签页转移事件
	 */
	private handleTabTransfer(payload: TabTransferPayload): void {
		const { sourceWindowId, targetWindowId, tabConfig } = payload;
		
		const targetStore = getTabStore(targetWindowId);
		if (!targetStore) return;

		// 添加标签页到目标窗口
		targetStore.addTab(tabConfig.cardId);
		this.saveConfigs();
	}

	/**
	 * 处理窗口关闭事件
	 */
	private handleWindowClosed(windowId: string): void {
		this.windows.delete(windowId);
		removeTabStore(windowId);
	}

	// ============ Utility Methods ============

	/**
	 * 获取窗口数量
	 */
	getWindowCount(): number {
		return this.windows.size;
	}

	/**
	 * 检查窗口是否存在
	 */
	hasWindow(windowId: string): boolean {
		return this.windows.has(windowId);
	}

	/**
	 * 获取窗口实例
	 */
	getWindow(windowId: string): unknown | undefined {
		return this.windows.get(windowId);
	}

	/**
	 * 聚焦窗口
	 */
	async focusWindow(windowId: string): Promise<void> {
		const win = this.windows.get(windowId);
		if (!win) return;
		
		// 浏览器模式
		if (!isRunningInTauri() && win instanceof Window) {
			win.focus();
			return;
		}
		
		// Tauri 模式
		await (win as { setFocus: () => Promise<void> }).setFocus();
	}
}

// ============ Singleton Export ============

export const cardWindowManager = new CardWindowManagerImpl();

// ============ Helper Functions ============

/**
 * 在新窗口打开卡片
 */
export async function openCardInNewWindow(cardId: string): Promise<string | null> {
	return cardWindowManager.createCardWindow(cardId);
}

/**
 * 初始化卡片窗口系统
 */
export async function initCardWindowSystem(): Promise<void> {
	await cardWindowManager.init();
}

/**
 * 恢复卡片窗口
 */
export async function restoreCardWindows(): Promise<void> {
	await cardWindowManager.restoreWindows();
}
