/**
 * Book Store - 核心模块
 * 整合所有子模块，保持原有 API 兼容性
 */

import type { Page, PageSortMode } from '$lib/types';
import * as bookApi from '$lib/api/book';
import { infoPanelStore } from '../infoPanel.svelte';
import { appState, type ViewerJumpSource } from '$lib/core/state/appState';
import { emmMetadataStore } from '../emmMetadata.svelte';
import { fileBrowserStore } from '../fileBrowser.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { showToast } from '$lib/utils/toast';
import type { EMMMetadata } from '$lib/api/emm';
import { pageNavigationDedup, RequestDeduplicator } from '$lib/utils/requestDedup';
import * as dimensionApi from '$lib/api/dimensions';
import * as pageManagerApi from '$lib/api/pageManager';

import { SvelteMap } from 'svelte/reactivity';
import {
	PAGE_WINDOW_PADDING,
	JUMP_HISTORY_LIMIT,
	formatBytesShort,
	formatBookTypeLabel,
	mapEmmToRaw,
	clampInitialPage
} from './utils';
import type { UpscaleStatus } from './types';
import type {
	BookState,
	OpenBookOptions,
	SwitchToastContext,
	SwitchToastBookContext,
	SwitchToastPageContext,
	ContentRef
} from './types';
import { isArchivePath } from './streamingLoader.svelte';
import { renderSwitchToastTemplate } from './toast';
import { cleanupBookResources } from '$lib/core/bookCleanup';
import { readerStore } from '$lib/stores/readerStore.svelte';
import { folderTabActions } from '$lib/components/panels/folderPanel/stores/folderTabStore';
import {
	folderPanelActions,
	isBookCandidate,
	normalizePath as normalizeFolderPath
} from '$lib/components/panels/folderPanel/stores/folderPanelStore';

export type { SwitchToastContext };

const BOOK_CORE_DEBUG = false;

function debugBookCore(...args: unknown[]): void {
	if (BOOK_CORE_DEBUG) {
		console.debug(...args);
	}
}

/** BookStore 核心类 - 第一部分：状态和基础 Getters */
class BookStore {
	private state = $state<BookState>({
		currentBook: null,
		loading: false,
		error: '',
		viewerOpen: false,
		upscaledImageData: null,
		pathStack: [],
		singleFileMode: false,
		originalFilePath: null
	});

	private lastEmmMetadataForCurrentBook: EMMMetadata | null = null;
	private openBookDedup = new RequestDeduplicator(30000);
	private openBookRequestVersion = 0;
	private activeOpenBookKey: string | null = null;

	// 超分状态管理：每页超分状态映射 pageIndex -> status
	private upscaleStatusByPage = $state<SvelteMap<number, UpscaleStatus>>(new SvelteMap());

	private buildOpenBookDedupKey(path: string, options: OpenBookOptions): string {
		const normalizedPath = path.replace(/\\/g, '/');
		const normalizedInitialFilePath = (options.initialFilePath ?? '').replace(/\\/g, '/');
		const initialPage = options.initialPage ?? -1;
		const skipHistory = options.skipHistory ? 1 : 0;
		const useStreaming = options.useStreaming === undefined ? 'd' : options.useStreaming ? 1 : 0;
		return `open-${normalizedPath}-${initialPage}-${normalizedInitialFilePath}-${skipHistory}-${useStreaming}`;
	}

	private beginOpenBookRequest(dedupKey: string): { key: string; version: number } {
		if (this.activeOpenBookKey !== dedupKey) {
			this.activeOpenBookKey = dedupKey;
			this.openBookRequestVersion += 1;
		}

		return {
			key: dedupKey,
			version: this.openBookRequestVersion
		};
	}

	private isOpenBookRequestCurrent(ticket: { key: string; version: number }): boolean {
		return this.activeOpenBookKey === ticket.key && this.openBookRequestVersion === ticket.version;
	}

	// Getters
	get currentBook() {
		return this.state.currentBook;
	}
	get loading() {
		return this.state.loading;
	}
	get error() {
		return this.state.error;
	}
	get viewerOpen() {
		return this.state.viewerOpen;
	}
	get upscaledImageData() {
		return this.state.upscaledImageData;
	}
	get isSingleFileMode() {
		return this.state.singleFileMode;
	}
	get originalFilePath() {
		return this.state.originalFilePath;
	}
	get pathStack(): ContentRef[] {
		return this.state.pathStack;
	}

	get currentPage(): Page | null {
		if (!this.state.currentBook) return null;
		return this.state.currentBook.pages[this.state.currentBook.currentPage] || null;
	}

	get currentPageIndex(): number {
		return this.state.currentBook?.currentPage ?? 0;
	}

	get totalPages(): number {
		return this.state.currentBook?.totalPages ?? 0;
	}

	get hasBook(): boolean {
		return this.state.currentBook !== null;
	}

	get canNextPage(): boolean {
		const book = this.state.currentBook;
		return book !== null && book.currentPage < book.totalPages - 1;
	}

	get canPreviousPage(): boolean {
		const book = this.state.currentBook;
		return book !== null && book.currentPage > 0;
	}

	/** 将 fileBrowserStore 的排序字段映射到 folderPanel 的排序字段 */
	private mapFileBrowserSortField(
		field: string
	): 'name' | 'date' | 'size' | 'type' | 'random' | 'rating' | 'path' | 'collectTagCount' {
		const mapping: Record<
			string,
			'name' | 'date' | 'size' | 'type' | 'random' | 'rating' | 'path'
		> = {
			name: 'name',
			modified: 'date',
			size: 'size',
			type: 'type',
			path: 'path',
			random: 'random',
			rating: 'rating'
		};
		return mapping[field] ?? 'name';
	}

	setSingleFileMode(enabled: boolean, filePath: string | null = null) {
		this.state.singleFileMode = enabled;
		this.state.originalFilePath = filePath;
	}

	getHistoryPath(): string | null {
		if (this.state.singleFileMode && this.state.originalFilePath) {
			return this.state.originalFilePath;
		}
		return this.state.currentBook?.path ?? null;
	}

	getHistoryName(): string {
		if (this.state.singleFileMode && this.state.originalFilePath) {
			return this.state.originalFilePath.split(/[\\/]/).pop() || this.state.originalFilePath;
		}
		return this.state.currentBook?.name ?? '';
	}

	buildPathStack(): ContentRef[] {
		const stack: ContentRef[] = [...this.state.pathStack];
		const book = this.state.currentBook;
		const page = this.currentPage;

		if (book && (stack.length === 0 || stack[0].path !== book.path)) {
			stack.unshift({ path: book.path });
		}

		if (this.state.singleFileMode && page) {
			stack.push({ path: page.path, innerPath: page.innerPath });
		}

		return stack;
	}

	// ==================== 书籍操作 ====================

	async openBook(path: string, options: OpenBookOptions = {}) {
		const dedupKey = this.buildOpenBookDedupKey(path, options);
		const ticket = this.beginOpenBookRequest(dedupKey);
		await this.openBookDedup.run(dedupKey, async () => {
			try {
				if (!this.isOpenBookRequestCurrent(ticket)) return;

				debugBookCore('📖 Opening book:', path);
				this.state.loading = true;
				this.state.error = '';
				this.state.upscaledImageData = null;
				this.state.singleFileMode = false;
				this.state.originalFilePath = null;
				this.state.pathStack = [{ path }];
				infoPanelStore.resetAll();

				if (!this.isOpenBookRequestCurrent(ticket)) return;

				// 【内存泄漏修复】清理上一本书的所有缓存资源
				cleanupBookResources();

				if (!this.isOpenBookRequestCurrent(ticket)) return;

				await this.openBookNormal(path, options, ticket);
			} catch (err) {
				if (!this.isOpenBookRequestCurrent(ticket)) return;

				console.error('❌ Error opening book:', err);
				this.state.error = String(err);
				this.state.currentBook = null;
				this.syncAppStateBookSlice();
				this.lastEmmMetadataForCurrentBook = null;
				infoPanelStore.resetBookInfo();
			} finally {
				if (this.isOpenBookRequestCurrent(ticket)) {
					this.state.loading = false;
				}
			}
		});
	}

	private async openBookNormal(
		path: string,
		options: OpenBookOptions,
		ticket: { key: string; version: number }
	) {
		const book = await bookApi.openBook(path);
		if (!this.isOpenBookRequestCurrent(ticket)) return;

		debugBookCore('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

		// 应用锁定的排序模式
		const settings = settingsManager.getSettings();
		const lockedSortMode = settings.book?.lockedSortMode;
		const lockedMediaPriority = settings.book?.lockedMediaPriority;

		if (lockedSortMode && book.sortMode !== lockedSortMode) {
			try {
				const updatedBook = await bookApi.setBookSortMode(lockedSortMode as PageSortMode);
				if (!this.isOpenBookRequestCurrent(ticket)) return;

				Object.assign(book, updatedBook);
				debugBookCore('🔒 已应用锁定的排序模式:', lockedSortMode);
			} catch (err) {
				if (!this.isOpenBookRequestCurrent(ticket)) return;

				console.warn('⚠️ 应用锁定排序模式失败:', err);
			}
		}

		// 应用锁定的媒体优先模式
		if (lockedMediaPriority && book.mediaPriorityMode !== lockedMediaPriority) {
			try {
				const { setMediaPriorityMode } = await import('$lib/api/book');
				if (!this.isOpenBookRequestCurrent(ticket)) return;

				const updatedBook = await setMediaPriorityMode(
					lockedMediaPriority as 'none' | 'videoFirst' | 'imageFirst'
				);
				if (!this.isOpenBookRequestCurrent(ticket)) return;

				Object.assign(book, updatedBook);
				debugBookCore('🔒 已应用锁定的媒体优先模式:', lockedMediaPriority);
			} catch (err) {
				if (!this.isOpenBookRequestCurrent(ticket)) return;

				console.warn('⚠️ 应用锁定媒体优先模式失败:', err);
			}
		}
		// 计算目标页面：优先使用 initialFilePath 查找，找不到时回退到 initialPage
		let targetPage = clampInitialPage(book.totalPages, options.initialPage);

		// 如果提供了 initialFilePath，尝试按路径查找页面索引
		if (options.initialFilePath && Array.isArray(book.pages)) {
			const normalizedTargetPath = options.initialFilePath.replace(/\\/g, '/').toLowerCase();
			const foundIndex = book.pages.findIndex((page) => {
				if (!page?.path) return false;
				const normalizedPagePath = page.path.replace(/\\/g, '/').toLowerCase();
				return normalizedPagePath === normalizedTargetPath;
			});

			if (foundIndex >= 0) {
				targetPage = foundIndex;
				debugBookCore(
					'📍 [History] Found page by path:',
					options.initialFilePath,
					'-> index',
					foundIndex
				);
			} else {
				debugBookCore(
					'⚠️ [History] Page not found by path, falling back to index:',
					options.initialPage
				);
			}
		}

		if (!this.isOpenBookRequestCurrent(ticket)) return;

		book.currentPage = targetPage;

		this.state.currentBook = book;
		this.syncAppStateBookSlice();
		this.state.viewerOpen = true;

		// 后端 frame builder 负责布局计算，前端不再需要本地初始化
		debugBookCore('📐 [Reader] 书籍已打开，共', book.pages?.length ?? 0, '页，后端负责帧布局');

		if (targetPage > 0 && book.totalPages > 0 && this.isOpenBookRequestCurrent(ticket)) {
			bookApi.navigateToPage(targetPage).catch((navErr) => {
				console.error('❌ Error navigating to initial page after open:', navErr);
			});
		}

		if (!this.isOpenBookRequestCurrent(ticket)) return;

		this.syncInfoPanelBookInfo().catch(() => {});
		this.syncFileBrowserSelection(path);

		if (!options.skipHistory) {
			import('$lib/stores/unifiedHistory.svelte')
				.then(({ unifiedHistoryStore }) => {
					if (!this.isOpenBookRequestCurrent(ticket)) return;

					const pathStack = this.buildPathStack();
					const currentPage = book.pages?.[targetPage];
					const currentFilePath = currentPage?.path;
					unifiedHistoryStore.add(pathStack, targetPage, book.totalPages, {
						displayName: book.name,
						currentFilePath
					});
				})
				.catch(() => {});
		}

		this.showBookSwitchToastIfEnabled();
		window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));

		// 📐 【性能优化 #6】启动后台尺寸预扫描
		if (book.pages?.length > 0) {
			// 延迟 500ms 启动，将书籍打开初期的 IO 优先级完全让给首张图片的显示
			setTimeout(() => {
				if (this.state.currentBook?.path !== book.path) return;
				debugBookCore(
					'📐 [DimensionScan] Starting background scan for',
					book.pages.length,
					'pages'
				);
				dimensionApi.startDimensionScan(book.path, book.type, book.pages).catch((err) => {
					console.warn('⚠️ [DimensionScan] Failed to start scan:', err);
				});
			}, 500);
		}
	}

	async openDirectoryAsBook(path: string, options: OpenBookOptions = {}) {
		await this.openBook(path, options);
	}

	closeViewer() {
		// 【内存泄漏修复】清理所有缓存资源
		cleanupBookResources();

		this.state.viewerOpen = false;
		this.state.currentBook = null;
		this.syncAppStateBookSlice();
		this.lastEmmMetadataForCurrentBook = null;
		this.state.upscaledImageData = null;
		infoPanelStore.resetAll();
		window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));

		// 重置 readerStore
		readerStore.reset();
	}

	async cancelCurrentLoad() {
		try {
			await bookApi.cancelCurrentLoad();
			debugBookCore('🚫 已取消当前加载');
		} catch (err) {
			console.error('❌ 取消加载失败:', err);
		}
	}

	async reloadCurrentBook(options: { keepPage?: boolean } = {}) {
		const current = this.state.currentBook;
		if (!current) return;

		const targetPage = options.keepPage === false ? 0 : current.currentPage;

		try {
			const latest = await bookApi.getCurrentBook();
			if (!latest || latest.totalPages === 0) {
				this.closeViewer();
				return;
			}

			const nextPage = Math.min(targetPage, Math.max(latest.totalPages - 1, 0));
			latest.currentPage = nextPage;
			this.state.currentBook = latest;
			this.syncAppStateBookSlice();
			await bookApi.navigateToPage(nextPage);
			await this.syncInfoPanelBookInfo();
		} catch (err) {
			console.error('❌ Error reloading current book:', err);
			this.state.error = String(err);
		}
	}

	// ==================== 页面导航 ====================

	async navigateToPage(index: number) {
		if (!this.state.currentBook) return;
		const maxIndex = this.state.currentBook.totalPages - 1;
		if (index < 0 || index > maxIndex) return;

		// 【性能优化】快速翻页去重，防止短时间内重复导航到同一页面
		const dedupKey = `nav-${this.state.currentBook.path}-${index}`;
		try {
			await pageNavigationDedup.run(dedupKey, async () => {
				const activeBook = this.state.currentBook;
				if (!activeBook) return;

				// 【IPC优化】先更新本地状态以获得即时 UI 响应
				activeBook.currentPage = index;
				this.syncAppStateBookSlice('user');

				// 等待后端同步 PageManager，确保后续 frame snapshot 读取到正确页码
				await bookApi.navigateToPage(index);

				// 异步更新面板信息
				this.syncInfoPanelBookInfo();

				if (this.state.singleFileMode) {
					const currentPage = activeBook.pages?.[index];
					if (currentPage) {
						this.state.originalFilePath = currentPage.path;
						const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
						const name =
							currentPage.name || currentPage.path.split(/[\\/]/).pop() || currentPage.path;
						const pathStack = this.buildPathStack();
						unifiedHistoryStore.add(pathStack, index, activeBook.totalPages, {
							displayName: name,
							currentFilePath: currentPage.path
						});
					}
				} else {
					const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
					const pathStack = this.buildPathStack();
					const currentPage = activeBook.pages?.[index];
					const currentFilePath = currentPage?.path;
					unifiedHistoryStore.updateIndex(pathStack, index, activeBook.totalPages, currentFilePath);
				}

				this.showPageSwitchToastIfEnabled();
			});
		} catch (err) {
			console.error('❌ Error navigating to page:', err);
			this.state.error = String(err);
		}
	}

	async navigateToImage(imagePath: string, options: { skipHistoryUpdate?: boolean } = {}) {
		if (!this.state.currentBook) return;
		try {
			const index = await bookApi.navigateToImage(imagePath);
			if (!this.state.currentBook) return;
			this.state.currentBook.currentPage = index;
			this.syncAppStateBookSlice('user');
			await this.syncInfoPanelBookInfo();

			if (!options.skipHistoryUpdate) {
				const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
				const pathStack = this.buildPathStack();
				unifiedHistoryStore.updateIndex(pathStack, index, this.state.currentBook.totalPages);
			}
		} catch (err) {
			console.error('❌ Error navigating to image:', err);
			this.state.error = String(err);
		}
	}

	// ── 绝对前/后翻页（nextPage / previousPage）──────────────────────────────────
	// 与 ui.svelte.ts 的方向感知翻页（pageLeft/pageRight）并存，职责不同：
	//   nextPage/previousPage：按书本物理顺序「下一帧/上一帧」，不感知阅读方向。
	//   pageLeft/pageRight   ：感知阅读方向和分割页状态，通过 navigateToPage 跳转。
	//
	// 翻页步长由后端 frame snapshot 提供（readerStore.state.currentFrame.step），
	// 已正确考虑双页模式，前端无需本地布局计算。

	async nextPage() {
		if (!this.canNextPage) {
			// 已在最后一页，检查是否显示边界提示
			const settings = settingsManager.getSettings();
			const enableBoundaryToast = settings.view?.switchToast?.enableBoundaryToast ?? true;
			if (enableBoundaryToast) {
				showToast({ title: '已是最后一页', variant: 'info' });
			}
			return;
		}
		try {
			const book = this.state.currentBook;
			if (!book) return;

			// 从后端 snapshot 获取翻页步长（已正确考虑双页步长）
			const step = readerStore.state.currentFrame?.step ?? 1;
			let newIndex = Math.min(book.currentPage + step, book.totalPages - 1);

			// 通知后端以触发预加载
			await bookApi.navigateToPage(newIndex);

			book.currentPage = newIndex;
			await this.syncInfoPanelBookInfo();
			this.syncAppStateBookSlice('user');
			await this.updateHistoryAfterNavigation(newIndex);

			this.showPageSwitchToastIfEnabled();
			return newIndex;
		} catch (err) {
			console.error('❌ Error going to next page:', err);
			this.state.error = String(err);
		}
	}

	async previousPage() {
		if (!this.canPreviousPage) {
			// 已在第一页，检查是否显示边界提示
			const settings = settingsManager.getSettings();
			const enableBoundaryToast = settings.view?.switchToast?.enableBoundaryToast ?? true;
			if (enableBoundaryToast) {
				showToast({ title: '已是第一页', variant: 'info' });
			}
			return;
		}
		try {
			const book = this.state.currentBook;
			if (!book) return;

			// 从后端 snapshot 获取翻页步长（向后翻也用 step 近似）
			const step = readerStore.state.currentFrame?.step ?? 1;
			let newIndex = Math.max(book.currentPage - step, 0);

			// 通知后端以触发预加载
			await bookApi.navigateToPage(newIndex);

			book.currentPage = newIndex;
			await this.syncInfoPanelBookInfo();
			this.syncAppStateBookSlice('user');
			await this.updateHistoryAfterNavigation(newIndex);

			return newIndex;
		} catch (err) {
			console.error('❌ Error going to previous page:', err);
			this.state.error = String(err);
		}
	}

	async firstPage() {
		await this.navigateToPage(0);
	}
	async lastPage() {
		if (!this.state.currentBook) return;
		await this.navigateToPage(this.state.currentBook.totalPages - 1);
	}
	async goToPage(index: number) {
		await this.navigateToPage(index);
	}

	setCurrentPageIndexLocal(index: number) {
		if (!this.state.currentBook) return;
		const maxIndex = this.state.currentBook.totalPages - 1;
		if (index < 0 || index > maxIndex) return;
		this.state.currentBook.currentPage = index;
	}

	private async updateHistoryAfterNavigation(newIndex: number) {
		const book = this.state.currentBook;
		if (!book) return;

		if (this.state.singleFileMode) {
			const currentPage = book.pages?.[newIndex];
			if (currentPage) {
				this.state.originalFilePath = currentPage.path;
				const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
				const name = currentPage.name || currentPage.path.split(/[\\/]/).pop() || currentPage.path;
				const pathStack = this.buildPathStack();
				unifiedHistoryStore.add(pathStack, newIndex, book.totalPages, {
					displayName: name,
					currentFilePath: currentPage.path
				});
			}
		} else {
			const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
			const pathStack = this.buildPathStack();
			const currentPage = book.pages?.[newIndex];
			const currentFilePath = currentPage?.path;
			unifiedHistoryStore.updateIndex(pathStack, newIndex, book.totalPages, currentFilePath);
		}
	}

	// ==================== 书籍切换 ====================

	private async openAdjacentBook(direction: 'next' | 'previous') {
		const currentPath = this.state.currentBook?.path ?? null;

		const activeTab = folderTabActions.getActiveTab();
		const activeTabPath = activeTab?.currentPath || '';
		const activeSortField = (activeTab?.sortField || 'name') as
			| 'name'
			| 'date'
			| 'size'
			| 'type'
			| 'random'
			| 'rating'
			| 'path'
			| 'collectTagCount';
		const activeSortOrder = (activeTab?.sortOrder || 'asc') as 'asc' | 'desc';

		// 直接读取 UI 已排好序的缓存列表，不做任何二次排序
		const cachedMeta = folderTabActions.getCachedSortedMeta(
			activeTabPath,
			activeSortField,
			activeSortOrder
		);
		const cachedSorted = folderTabActions.getCachedSortedItems(
			activeTabPath,
			activeSortField,
			activeSortOrder
		);
		let targetPath: string | null = null;
		const canUseCache =
			cachedSorted.length > 0 &&
			!!activeTabPath &&
			normalizeFolderPath(cachedMeta.path) === normalizeFolderPath(activeTabPath);

		if (canUseCache) {
			const bookItems = cachedSorted.filter(isBookCandidate);

			if (bookItems.length > 0) {
				const normalizedCurrent = currentPath ? normalizeFolderPath(currentPath) : null;
				let currentIndex = bookItems.findIndex(
					(item) => normalizedCurrent && normalizeFolderPath(item.path) === normalizedCurrent
				);

				if (currentIndex === -1) {
					currentIndex = direction === 'next' ? -1 : bookItems.length;
				}

				const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
				if (targetIndex >= 0 && targetIndex < bookItems.length) {
					targetPath = bookItems[targetIndex].path;
				}
			}
		}

		// 降级：缓存为空或缓存中无 book 候选时，异步加载
		if (!targetPath) {
			const sortOptions = {
				sortField: activeSortField,
				sortOrder: activeSortOrder
			};
			targetPath = await folderPanelActions.findAdjacentBookPathAsync(
				currentPath,
				direction,
				sortOptions
			);
		}

		// 最终回退
		if (!targetPath) {
			targetPath = fileBrowserStore.findAdjacentBookPath(currentPath, direction);
		}

		if (!targetPath) return;

		await this.openBook(targetPath);

		// ★ 先开书，再异步同步侧栏，降低切换路径上的主线程压力
		setTimeout(() => {
			this.syncFolderPanelToBookParent(targetPath, folderTabActions, normalizeFolderPath);
		}, 0);
	}

	/**
	 * 同步文件夹面板到指定书籍的父目录
	 * 确保面板显示的是书籍的兄弟列表，而不是书籍内部的文件
	 */
	private syncFolderPanelToBookParent(
		bookPath: string,
		folderTabActions: {
			getActiveTab: () => any;
			setPath: (path: string, addToHistory?: boolean) => void;
			selectItem: (path: string) => void;
			focusOnPath: (path: string) => void;
		},
		normalizePath: (path: string) => string
	) {
		try {
			const normalized = bookPath.replace(/\\/g, '/');
			const lastSep = normalized.lastIndexOf('/');
			if (lastSep <= 0) return;
			const parentDir = normalized.substring(0, lastSep);

			const activeTab = folderTabActions.getActiveTab();
			const currentTabPath = activeTab?.currentPath || '';

			if (normalizePath(currentTabPath) === normalizePath(parentDir)) {
				folderTabActions.selectItem(bookPath);
				folderTabActions.focusOnPath(bookPath);
			} else {
				folderTabActions.setPath(parentDir, false);
				folderTabActions.focusOnPath(bookPath);
			}
		} catch {}
	}

	async openNextBook() {
		if (this.state.singleFileMode) return;
		await this.openAdjacentBook('next');
	}

	async openPreviousBook() {
		if (this.state.singleFileMode) return;
		await this.openAdjacentBook('previous');
	}

	async setSortMode(sortMode: PageSortMode) {
		if (!this.state.currentBook) return;
		if (this.state.currentBook.sortMode === sortMode) return;

		try {
			const updatedBook = await bookApi.setBookSortMode(sortMode);
			this.state.currentBook = updatedBook;
			this.syncAppStateBookSlice('user');
			await this.syncInfoPanelBookInfo();

			// 排序后后端会重新构建帧布局，前端无需操作

			const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
			const pathStack = this.buildPathStack();
			unifiedHistoryStore.updateIndex(pathStack, updatedBook.currentPage, updatedBook.totalPages);
		} catch (err) {
			console.error('❌ Error setting sort mode:', err);
			this.state.error = String(err);
		}
	}

	async closeBook() {
		window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
		await this.closeViewer();
	}

	async closeFile() {
		await this.closeBook();
	}

	async refreshCurrentBook() {
		try {
			const book = await bookApi.getCurrentBook();
			this.state.currentBook = book;
			this.syncInfoPanelBookInfo();
		} catch (err) {
			console.error('❌ Error refreshing book:', err);
			this.state.error = String(err);
		}
	}

	setError(message: string) {
		this.state.error = message;
	}
	clearError() {
		this.state.error = '';
	}
	setUpscaledImage(data: string | null) {
		this.state.upscaledImageData = data;
	}

	// ==================== 超分状态管理 ====================

	/** 获取指定页面的超分状态 */
	getPageUpscaleStatus(pageIndex: number): UpscaleStatus {
		return this.upscaleStatusByPage.get(pageIndex) ?? 'none';
	}

	/** 设置指定页面的超分状态 */
	setPageUpscaleStatus(pageIndex: number, status: UpscaleStatus): void {
		const nextMap = new SvelteMap(this.upscaleStatusByPage);
		nextMap.set(pageIndex, status);
		this.upscaleStatusByPage = nextMap;
	}

	/** 获取预超分覆盖范围（最远已预超分的页面索引） */
	getFurthestPreUpscaledIndex(): number {
		let furthestIndex = -1;
		for (const [pageIndex, status] of this.upscaleStatusByPage.entries()) {
			if (status === 'preupscaled' || status === 'done') {
				furthestIndex = Math.max(furthestIndex, pageIndex);
			}
		}
		return furthestIndex;
	}

	/** 重置所有页面的超分状态 */
	resetAllUpscaleStatus(): void {
		this.upscaleStatusByPage = new SvelteMap();
	}

	private syncPageDimensionsToBackend(
		pageIndex: number,
		width?: number | null,
		height?: number | null
	): void {
		if (
			typeof width !== 'number' ||
			typeof height !== 'number' ||
			!Number.isFinite(width) ||
			!Number.isFinite(height) ||
			width <= 0 ||
			height <= 0
		) {
			return;
		}

		void pageManagerApi
			.updatePageDimensions(pageIndex, Math.round(width), Math.round(height))
			.catch((err) => {
				console.warn('[BookStore] sync page dimensions failed:', err);
			});
	}

	updatePageDimensions(
		pageIndex: number,
		dimensions: { width?: number | null; height?: number | null }
	) {
		const book = this.state.currentBook;
		if (!book || !Array.isArray(book.pages)) return;
		if (pageIndex < 0 || pageIndex >= book.pages.length) return;

		const page = book.pages[pageIndex];
		if (!page) return;

		let updated = false;
		if (
			typeof dimensions.width === 'number' &&
			dimensions.width > 0 &&
			page.width !== dimensions.width
		) {
			page.width = dimensions.width;
			updated = true;
		}
		if (
			typeof dimensions.height === 'number' &&
			dimensions.height > 0 &&
			page.height !== dimensions.height
		) {
			page.height = dimensions.height;
			updated = true;
		}

		if (updated && pageIndex === book.currentPage) {
			void this.syncInfoPanelBookInfo();
		}
		if (updated) {
			this.syncPageDimensionsToBackend(pageIndex, page.width, page.height);
		}
	}

	updatePageDimensionsBatch(updates: Array<{ pageIndex: number; width: number; height: number }>) {
		const book = this.state.currentBook;
		if (!book || !Array.isArray(book.pages)) return;

		let currentPageUpdated = false;
		const backendUpdates: Array<{ pageIndex: number; width: number; height: number }> = [];
		for (const update of updates) {
			const { pageIndex, width, height } = update;
			if (pageIndex < 0 || pageIndex >= book.pages.length) continue;
			const page = book.pages[pageIndex];
			if (!page) continue;
			let updated = false;
			if (width > 0 && page.width !== width) {
				page.width = width;
				updated = true;
			}
			if (height > 0 && page.height !== height) {
				page.height = height;
				updated = true;
			}
			if (updated) {
				backendUpdates.push({
					pageIndex,
					width: page.width ?? width,
					height: page.height ?? height
				});
				if (pageIndex === book.currentPage) currentPageUpdated = true;
			}
		}

		if (currentPageUpdated) void this.syncInfoPanelBookInfo();
		for (const update of backendUpdates) {
			this.syncPageDimensionsToBackend(update.pageIndex, update.width, update.height);
		}
	}

	// ==================== Hash 和 Toast ====================

	getPageHash(pageIndex: number): string | null {
		const book = this.state.currentBook;
		if (!book) return null;
		const page = book.pages[pageIndex];
		return page?.stableHash ?? null;
	}

	getCurrentPageHash(): string | null {
		return this.getPageHash(this.currentPageIndex);
	}

	getCurrentBookPageContext(): SwitchToastContext {
		return this.buildSwitchToastContext();
	}

	private getSwitchToastConfig() {
		const settings = settingsManager.getSettings();
		const view = settings.view;
		return (
			view.switchToast ?? {
				enableBook: view.showBookSwitchToast ?? false,
				enablePage: false,
				showBookPath: true,
				showBookPageProgress: true,
				showBookType: false,
				showPageIndex: true,
				showPageSize: false,
				showPageDimensions: true,
				bookTitleTemplate:
					'已切换到 {{book.displayName}}（第 {{book.currentPageDisplay}} / {{book.totalPages}} 页）',
				bookDescriptionTemplate: '路径：{{book.path}}',
				pageTitleTemplate: '第 {{page.indexDisplay}} / {{book.totalPages}} 页',
				pageDescriptionTemplate: '{{page.dimensionsFormatted}}  {{page.sizeFormatted}}'
			}
		);
	}

	private buildSwitchToastContext(): SwitchToastContext {
		const book = this.state.currentBook;
		const page = this.currentPage;

		let bookCtx: SwitchToastBookContext | null = null;
		if (book) {
			const emm = this.lastEmmMetadataForCurrentBook;
			const totalPages = book.totalPages ?? 0;
			const currentPageIndex = book.currentPage ?? 0;
			const currentPageDisplay = totalPages === 0 ? 0 : currentPageIndex + 1;
			const safeCurrent = totalPages > 0 ? Math.min(currentPageDisplay, totalPages) : 0;
			const progressPercent = totalPages > 0 ? (safeCurrent / totalPages) * 100 : null;
			const emmRaw = emm ? mapEmmToRaw(emm) : undefined;
			const emmTranslatedTitle = emm?.translated_title;

			bookCtx = {
				name: book.name,
				displayName:
					emmTranslatedTitle && emmTranslatedTitle !== book.name ? emmTranslatedTitle : book.name,
				path: book.path,
				type: book.type,
				totalPages,
				currentPageIndex,
				currentPageDisplay,
				progressPercent: progressPercent !== null ? Number(progressPercent.toFixed(1)) : null,
				emmTranslatedTitle,
				emmRating: emm?.rating ?? null,
				emmTags: emm?.tags,
				emmRaw
			};
		}

		let pageCtx: SwitchToastPageContext | null = null;
		if (page) {
			const dimensionsFormatted =
				page.width && page.height ? `${page.width} × ${page.height}` : undefined;
			const sizeFormatted =
				typeof page.size === 'number' ? (formatBytesShort(page.size) ?? undefined) : undefined;
			const indexDisplay = page.index + 1;

			pageCtx = {
				name: page.name,
				displayName: page.name || `第 ${indexDisplay} 页`,
				path: page.path,
				innerPath: page.innerPath,
				index: page.index,
				indexDisplay,
				width: page.width,
				height: page.height,
				dimensionsFormatted,
				size: page.size,
				sizeFormatted
			};
		}

		return { book: bookCtx, page: pageCtx };
	}

	private showBookSwitchToastIfEnabled() {
		const book = this.state.currentBook;
		if (!book) return;

		const cfg = this.getSwitchToastConfig();
		if (!cfg.enableBook) return;

		const context = this.buildSwitchToastContext();
		const titleFromTemplate = cfg.bookTitleTemplate
			? renderSwitchToastTemplate(cfg.bookTitleTemplate, context).trim()
			: '';
		const descriptionFromTemplate = cfg.bookDescriptionTemplate
			? renderSwitchToastTemplate(cfg.bookDescriptionTemplate, context).trim()
			: '';

		if (titleFromTemplate || descriptionFromTemplate) {
			showToast({
				title: titleFromTemplate || (context.book?.displayName ?? book.name),
				description: descriptionFromTemplate || undefined,
				variant: 'info'
			});
			return;
		}

		const parts: string[] = [];
		if (cfg.showBookPageProgress && book.totalPages > 0) {
			const current = Math.min(book.currentPage + 1, book.totalPages);
			parts.push(`第 ${current} / ${book.totalPages} 页`);
		}
		if (cfg.showBookType && book.type) {
			const label = formatBookTypeLabel(book.type as string);
			if (label) parts.push(label);
		}
		if (cfg.showBookPath && book.path) {
			parts.push(book.path);
		}

		showToast({ title: book.name, description: parts.join(' • ') || undefined, variant: 'info' });
	}

	private showPageSwitchToastIfEnabled() {
		const book = this.state.currentBook;
		const page = this.currentPage;
		if (!book || !page) return;

		const cfg = this.getSwitchToastConfig();
		if (!cfg.enablePage) return;

		const context = this.buildSwitchToastContext();
		const titleFromTemplate = cfg.pageTitleTemplate
			? renderSwitchToastTemplate(cfg.pageTitleTemplate, context).trim()
			: '';
		const descriptionFromTemplate = cfg.pageDescriptionTemplate
			? renderSwitchToastTemplate(cfg.pageDescriptionTemplate, context).trim()
			: '';

		if (titleFromTemplate || descriptionFromTemplate) {
			showToast({
				title:
					titleFromTemplate ||
					context.page?.displayName ||
					page.name ||
					`第 ${book.currentPage + 1} 页`,
				description: descriptionFromTemplate || undefined,
				variant: 'info'
			});
			return;
		}

		const parts: string[] = [];
		if (cfg.showPageIndex && book.totalPages > 0) {
			parts.push(`第 ${Math.min(book.currentPage + 1, book.totalPages)} / ${book.totalPages} 页`);
		}
		if (cfg.showPageDimensions && page.width && page.height) {
			parts.push(`${page.width} × ${page.height}`);
		}
		if (cfg.showPageSize && typeof page.size === 'number') {
			const sizeStr = formatBytesShort(page.size);
			if (sizeStr) parts.push(sizeStr);
		}

		showToast({
			title: page.name || `第 ${book.currentPage + 1} 页`,
			description: parts.join(' • ') || undefined,
			variant: 'info'
		});
	}

	// ==================== 同步方法 ====================

	private syncFileBrowserSelection(path: string) {
		try {
			fileBrowserStore.selectPath(path);
		} catch (error) {
			debugBookCore('syncFileBrowserSelection failed:', error);
		}
	}

	private async syncInfoPanelBookInfo() {
		const book = this.state.currentBook;
		if (!book) {
			infoPanelStore.resetBookInfo();
			infoPanelStore.resetImageInfo();
			return;
		}

		const emmMetadata = await emmMetadataStore.loadMetadataByPath(book.path);
		this.lastEmmMetadataForCurrentBook = emmMetadata;

		const bookInfo = {
			path: book.path,
			name: book.name,
			type: book.type,
			totalPages: book.totalPages,
			currentPage: book.totalPages === 0 ? 0 : book.currentPage + 1,
			emmMetadata: emmMetadata
				? {
						translatedTitle: emmMetadata.translated_title,
						tags: emmMetadata.tags,
						rating: emmMetadata.rating,
						raw: mapEmmToRaw(emmMetadata)
					}
				: undefined
		};

		infoPanelStore.setBookInfo(bookInfo);
		await this.syncCurrentPageImageInfo();
	}

	private async syncCurrentPageImageInfo() {
		const book = this.state.currentBook;
		const page = this.currentPage;

		if (!book || !page) {
			infoPanelStore.resetImageInfo();
			return;
		}

		try {
			const { metadataService } = await import('$lib/services/metadataService');
			metadataService.updateFromPage(page, book.path);
			const isArchive = book.type === 'archive';
			const path = isArchive ? book.path : page.path;
			const innerPath = isArchive ? page.innerPath : undefined;
			await metadataService.syncCurrentPageMetadata(path, innerPath, page.index);
		} catch (error) {
			console.warn('[BookStore] syncCurrentPageImageInfo 失败:', error);
		}
	}

	private computePageWindowState(currentIndex: number, totalPages: number, radius: number) {
		const forward: number[] = [];
		const backward: number[] = [];
		for (let i = 1; i <= radius; i++) {
			const nextIndex = currentIndex + i;
			if (nextIndex < totalPages) forward.push(nextIndex);
			const prevIndex = currentIndex - i;
			if (prevIndex >= 0) backward.push(prevIndex);
		}
		return { center: currentIndex, forward, backward, stale: false };
	}

	private syncAppStateBookSlice(source: ViewerJumpSource = 'system') {
		const currentBook = this.state.currentBook;
		const snapshot = appState.getSnapshot();

		const bookSlice = {
			currentBookPath: currentBook?.path ?? null,
			currentPageIndex: currentBook?.currentPage ?? 0,
			totalPages: currentBook?.totalPages ?? 0
		};

		if (!currentBook) {
			appState.update({
				book: bookSlice,
				viewer: {
					...snapshot.viewer,
					pageWindow: { center: 0, forward: [], backward: [], stale: true },
					jumpHistory: [],
					taskCursor: {
						...snapshot.viewer.taskCursor,
						centerIndex: 0,
						oldestPendingIdx: 0,
						furthestReadyIdx: 0
					}
				}
			});
			return;
		}

		const preloadRadius = snapshot.settings.performance?.preLoadSize ?? PAGE_WINDOW_PADDING;
		const radius = Math.max(1, Math.max(PAGE_WINDOW_PADDING, preloadRadius));
		const pageWindow = this.computePageWindowState(
			bookSlice.currentPageIndex,
			bookSlice.totalPages,
			radius
		);
		const jumpEntry = { index: bookSlice.currentPageIndex, timestamp: Date.now(), source };
		const jumpHistory = [jumpEntry, ...snapshot.viewer.jumpHistory].slice(0, JUMP_HISTORY_LIMIT);

		appState.update({
			book: bookSlice,
			viewer: {
				...snapshot.viewer,
				pageWindow,
				jumpHistory,
				taskCursor: { ...snapshot.viewer.taskCursor, centerIndex: bookSlice.currentPageIndex }
			}
		});
	}
}

// 导出单例
export const bookStore = new BookStore();
