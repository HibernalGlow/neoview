<script lang="ts">
	import {
		Folder,
		File,
		Image,
		Trash2,
		RefreshCw,
		FileArchive,
		FolderOpen,
		Home,
		ChevronLeft,
		ChevronRight,
		ChevronUp,
		CheckSquare,
		Grid3x3,
		List,
		MoreVertical,
		Settings,
		AlertCircle,
		Bookmark,
		Star,
		ExternalLink,
		CornerDownRight,
		Search,
		FolderTree,
		BookOpen
	} from '@lucide/svelte';
	import VirtualizedFileList from './file/components/VirtualizedFileList.svelte';
	import FileTreeView from './file/components/FileTreeView.svelte';
	import SortPanel from '$lib/components/ui/sort/SortPanel.svelte';
	import BookmarkSortPanel from '$lib/components/ui/sort/BookmarkSortPanel.svelte';
	import { onMount } from 'svelte';
	import { FileSystemAPI } from '$lib/api';
	import type { FsItem } from '$lib/types';
	import { bookStore } from '$lib/stores/book.svelte';
	import * as BookAPI from '$lib/api/book';
	import PathBar from '../ui/PathBar.svelte';
	import {
		fileBrowserStore,
		sortItems,
		type SortField,
		type SortOrder
	} from '$lib/stores/fileBrowser.svelte';
	import { NavigationHistory } from '$lib/utils/navigationHistory';
	import { Button } from '$lib/components/ui/button';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import { homeDir } from '@tauri-apps/api/path';
	import { thumbnailManager, type ThumbnailConfig } from '$lib/utils/thumbnailManager';
	import { buildImagePathKey } from '$lib/utils/pathHash';
	import { isVideoFile as isVideoPath } from '$lib/utils/videoUtils';
	import { readable } from 'svelte/store';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import { taskScheduler } from '$lib/core/tasks/taskScheduler';
	import { loadPanelViewMode, savePanelViewMode } from '$lib/utils/panelViewMode';

	function itemIsDirectory(item: any): boolean {
		return item.isDir || item.is_directory;
	}

	function itemIsImage(item: any): boolean {
		return item.is_image || false;
	}

	function toRelativeKey(path: string): string {
		return path.replace(/\\/g, '/');
	}

	function cancelBySource(source: string): void {
		thumbnailManager.cancelByPath(source);
	}

	function enqueueVisible(path: string, items: any[], options?: any): void {
		const priority = options?.priority || 'normal';
		items.forEach((item) => {
			if (itemIsDirectory(item) || itemIsImage(item)) {
				const isArchive =
					item.name.endsWith('.zip') ||
					item.name.endsWith('.cbz') ||
					item.name.endsWith('.rar') ||
					item.name.endsWith('.cbr');
				thumbnailManager.getThumbnail(item.path, undefined, isArchive, priority);
			}
		});
	}

	function configureThumbnailManager(config: Partial<ThumbnailConfig>): void {
		thumbnailManager.setConfig(config);
		thumbnailManager.setOnThumbnailReady((path, dataUrl) => {
			const key = toRelativeKey(path);
			fileBrowserStore.addThumbnail(key, dataUrl);
			navigationHistory.updateCachedThumbnail(currentPath, key, dataUrl);
		});
	}

	function enqueueDirectoryThumbnails(path: string, items: any[]): void {
		// 当前目录优先
		thumbnailManager.setCurrentDirectory(path);
		thumbnailManager.preloadThumbnails(items, path, 'immediate');
	}

	async function prefillThumbnailsFromCache(items: FsItem[], path: string) {
		const hits = thumbnailManager.matchCachedThumbnails(items);
		if (hits.size === 0) return;
		hits.forEach((dataUrl, originalPath) => {
			const key = toRelativeKey(originalPath);
			fileBrowserStore.addThumbnail(key, dataUrl);
			navigationHistory.updateCachedThumbnail(path, key, dataUrl);
		});
	}

	async function cancelFolderTasks(path: string): Promise<number> {
		thumbnailManager.cancelByPath(path);
		return 0;
	}
	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const bookState = createAppStateStore((state) => state.book);
	const viewerState = createAppStateStore((state) => state.viewer);
	const schedulerSource = 'file-browser';

	function runWithScheduler<TResult>(options: {
		type: string;
		source?: string;
		bucket?: 'current' | 'forward' | 'backward' | 'background';
		priority?: 'low' | 'normal' | 'high';
		executor: () => Promise<TResult>;
	}): Promise<TResult> {
		return new Promise<TResult>((resolve, reject) => {
			taskScheduler.enqueue({
				type: options.type,
				source: options.source ?? schedulerSource,
				bucket: options.bucket ?? 'background',
				priority: options.priority ?? 'normal',
				executor: async () => {
					try {
						const result = await options.executor();
						resolve(result);
						return result;
					} catch (error) {
						reject(error);
						throw error;
					}
				}
			});
		});
	}
	import { runPerformanceOptimizationTests } from '$lib/utils/performanceTests';
	import ThumbnailsPanel from './ThumbnailsPanel.svelte';
	import { getPerformanceSettings } from '$lib/api/performance';

	// 使用全局状态
	let currentPath = $state('');
	let items = $state<FsItem[]>([]);
	let loading = $state(false);
	let error = $state('');
	let thumbnails = $state<Map<string, string>>(new Map());
	// 缩略图由外部 thumbnailManager 管理（队列、并发、archive 支持）
	let isArchiveView = $state(false);
	let currentArchivePath = $state('');
	let selectedIndex = $state(-1);
	let scrollToSelectedToken = $state(0);
	let scrollTargetIndex = $state(-1);
	let fileListContainer = $state<HTMLDivElement | undefined>(undefined);
	let contextMenu = $state<{ x: number; y: number; item: FsItem | null; direction: 'up' | 'down' }>(
		{ x: 0, y: 0, item: null, direction: 'down' }
	);
	let bookmarkContextMenu = $state<{ x: number; y: number; bookmark: any | null }>({
		x: 0,
		y: 0,
		bookmark: null
	});
	let copyToSubmenu = $state<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
	let clipboardItem = $state<{ path: string; operation: 'copy' | 'cut' } | null>(null);
	let sortField = $state<SortField>('name');
	let sortOrder = $state<SortOrder>('asc');

	// 导航历史管理器
	let navigationHistory = new NavigationHistory();

	// 缩略图功能已由 thumbnailManager 管理

	$effect(() => {
		// 缩略图功能已由 thumbnailManager 管理
		// 不需要额外的订阅

		return () => {
			// 清理工作由 thumbnailManager 处理
		};
	});

	// UI 模式状态
	let isCheckMode = $state(false);
	let isDeleteMode = $state(false);
	let isPenetrateMode = $state(false);
	let viewMode = $state<'list' | 'thumbnails'>(
		loadPanelViewMode('file-browser', 'list') as 'list' | 'thumbnails'
	); // 列表 or 缩略图视图
	let selectedItems = $state<Set<string>>(new Set());
	let showSearchBar = $state(false);
	let showFolderTree = $state(false);
	let treeItems = $state<FsItem[]>([]);
	let drivesLoaded = false;
	let loadedDriveRoots = new Set<string>();
	let treeWidth = $state(260);
	const FILE_TREE_WIDTH_KEY = 'neoview-filetree-width';
	let isTreeResizing = false;
	let treeResizeStartX = 0;
	let treeResizeStartWidth = 0;
	let lastTreeSyncPath = '';

	// 缩略图入队管理
	let lastEnqueueTimeout: ReturnType<typeof setTimeout> | null = null; // 用于取消上一个入队任务
	let currentEpoch = 0; // 用于设置检查

	// 搜索功能状态
	type SearchResultItem = FsItem & { source?: 'local' | 'bookmark' | 'history' };
	let searchQuery = $state('');
	let searchHistory = $state<{ query: string; timestamp: number }[]>([]);
	let searchSettings = $state({
		includeSubfolders: true,
		showHistoryOnFocus: true,
		searchInPath: false // 是否在路径中搜索（而不仅仅是文件名）
	});
	let searchResults = $state<SearchResultItem[]>([]);
	let isSearching = $state(false);

	// 书签相关 - 使用 bookmarkStore
	function loadBookmarks() {
		// 空函数，因为书签功能已迁移到独立 tab
	}

	function getDriveRoot(path: string): string | null {
		const match = path.match(/^([A-Za-z]:)/);
		if (!match) return null;
		return `${match[1]}\\`;
	}

	async function ensureDriveRootLoadedForPath(path: string) {
		const root = getDriveRoot(path);
		if (!root) return;
		if (loadedDriveRoots.has(root)) return;

		try {
			const entries = await FileSystemAPI.browseDirectory(root);
			const dirs = entries.filter((item) => item.isDir);
			if (dirs.length === 0) {
				loadedDriveRoots.add(root);
				return;
			}

			const map = new Map(treeItems.map((item) => [item.path, item]));
			for (const dir of dirs) {
				map.set(dir.path, dir);
			}
			treeItems = Array.from(map.values());
			loadedDriveRoots.add(root);
		} catch (e) {
			console.error('自动加载盘符根目录失败:', root, e);
		}
	}

	// 订阅全局状态 - 使用 Svelte 5 的响应式
	$effect(() => {
		const unsubscribe = fileBrowserStore.subscribe((state) => {
			console.log('📊 Store state updated:', {
				currentPath: state.currentPath,
				itemsCount: state.items.length,
				loading: state.loading,
				error: state.error,
				isArchiveView: state.isArchiveView
			});

			currentPath = state.currentPath;
			items = state.items;
			loading = state.loading;
			error = state.error;
			isArchiveView = state.isArchiveView;
			currentArchivePath = state.currentArchivePath;
			selectedIndex = state.selectedIndex;
			thumbnails = state.thumbnails;
			sortField = state.sortField;
			sortOrder = state.sortOrder;
			scrollToSelectedToken = state.scrollToSelectedToken;
			scrollTargetIndex = state.scrollTargetIndex;

			if (showFolderTree && state.currentPath) {
				void ensureDriveRootLoadedForPath(state.currentPath);
				if (state.currentPath !== lastTreeSyncPath) {
					updateTreeWithDirectory(state.currentPath, state.items);
					lastTreeSyncPath = state.currentPath;
				}
			}
		});

		return unsubscribe;
	});

	// 主页路径的本地存储键
	const HOMEPAGE_STORAGE_KEY = 'neoview-homepage-path';

	/**
	 * 设置主页路径
	 */
	function setHomepage(path: string) {
		try {
			localStorage.setItem(HOMEPAGE_STORAGE_KEY, path);
			console.log('✅ 主页路径已设置:', path);
			// TODO: 可以添加 toast 通知
		} catch (err) {
			console.error('❌ 保存主页路径失败:', err);
		}
	}

	/**
	 * 加载主页路径
	 */
	async function loadHomepage() {
		try {
			let homepage = localStorage.getItem(HOMEPAGE_STORAGE_KEY);
			if (!homepage) {
				// 如果本地没有保存主页，尝试使用系统 Home 目录作为默认主页
				try {
					const hd = await homeDir();
					if (hd) {
						homepage = hd;
						console.log('📍 未设置主页，本次使用系统 Home 目录作为主页:', homepage);
						// 将该值保存为主页以便下次启动使用
						setHomepage(homepage);
					}
				} catch (e) {
					console.warn('⚠️ 无法获取系统 Home 目录:', e);
				}
			}

			if (homepage) {
				console.log('📍 加载主页路径:', homepage);
				navigationHistory.setHomepage(homepage);
				// 注意：不在此处 await 阻塞 UI，如果需要可以等待
				await loadDirectory(homepage);
			} else {
				console.warn('⚠️ 没有可用的主页路径，跳过加载主页');
			}
		} catch (err) {
			console.error('❌ 加载主页路径失败:', err);
		}
	}

	/**
	 * 导航到主页
	 */
	function goHome() {
		const homepage = navigationHistory.getHomepage();
		if (homepage) {
			navigateToDirectory(homepage);
		}
	}

	/**
	 * 格式化文件大小
	 */
	function formatFileSize(bytes: number, isDir: boolean): string {
		if (isDir) {
			return `${bytes} 项`;
		}

		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(2)} ${units[unitIndex]}`;
	}

	/**
	 * 后退
	 */
	function goBackInHistory() {
		const path = navigationHistory.back();
		if (path) {
			loadDirectoryWithoutHistory(path);
		}
	}

	/**
	 * 前进
	 */
	function goForwardInHistory() {
		const path = navigationHistory.forward();
		if (path) {
			loadDirectoryWithoutHistory(path);
		}
	}

	/**
	 * 切换勾选模式
	 */
	function toggleCheckMode() {
		isCheckMode = !isCheckMode;
		if (!isCheckMode) {
			selectedItems.clear();
		}
	}

	function toggleDeleteMode() {
		isDeleteMode = !isDeleteMode;
	}

	function toggleViewMode() {
		// 循环切换：list -> grid -> list
		const next = viewMode === 'list' ? 'thumbnails' : 'list';
		viewMode = next; // 使用 'thumbnails' 作为网格视图的标识（兼容现有代码）
		savePanelViewMode('file-browser', next);
	}

	async function toggleFolderTree() {
		showFolderTree = !showFolderTree;
		if (showFolderTree) {
			await ensureDriveRoots();
			if (currentPath && items.length > 0) {
				updateTreeWithDirectory(currentPath, items);
			}
		}
	}

	async function ensureDriveRoots() {
		if (drivesLoaded) return;

		const driveLetters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
		const roots: FsItem[] = [];

		for (const letter of driveLetters) {
			const rootPath = `${letter}:\\`;
			try {
				const exists = await FileSystemAPI.pathExists(rootPath);
				if (exists) {
					roots.push({
						path: rootPath,
						name: `${letter}:`,
						isDir: true,
						isImage: false,
						size: 0,
						modified: 0
					});
				}
			} catch (e) {
				console.debug('检测盘符失败:', rootPath, e);
			}
		}

		const map = new Map(treeItems.map((item) => [item.path, item]));
		for (const item of roots) {
			map.set(item.path, item);
		}
		treeItems = Array.from(map.values());
		drivesLoaded = true;
	}

	function updateTreeWithDirectory(path: string, dirItems: FsItem[]) {
		const dirs = dirItems.filter((item) => item.isDir);
		const map = new Map(treeItems.map((item) => [item.path, item]));
		if (path && !map.has(path)) {
			const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
			const segments = normalized.split('/');
			const name = segments[segments.length - 1] || normalized;
			map.set(path, {
				path,
				name,
				isDir: true,
				isImage: false,
				size: 0,
				modified: 0
			});
		}
		for (const dir of dirs) {
			map.set(dir.path, dir);
		}
		treeItems = Array.from(map.values());
	}

	async function handleTreeToggleNode(
		event: CustomEvent<{ path: string; fsPath: string; isDir: boolean; hasChildren: boolean }>
	) {
		const { fsPath, isDir, hasChildren } = event.detail;

		// 仅在目录第一次展开（尚无子节点）时懒加载子目录
		if (!isDir || hasChildren) {
			return;
		}

		try {
			const entries = await FileSystemAPI.browseDirectory(fsPath);
			const dirs = entries.filter((item) => item.isDir);
			if (dirs.length === 0) return;

			const map = new Map(treeItems.map((item) => [item.path, item]));
			for (const dir of dirs) {
				map.set(dir.path, dir);
			}
			treeItems = Array.from(map.values());
		} catch (err) {
			console.error('加载文件树子目录失败:', fsPath, err);
		}
	}

	function toggleItemSelection(path: string) {
		if (selectedItems.has(path)) {
			selectedItems.delete(path);
		} else {
			selectedItems.add(path);
		}
		selectedItems = selectedItems; // 触发响应式更新
	}

	// 组件挂载时添加全局点击事件和加载主页
	onMount(() => {
		const handleClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.context-menu')) {
				hideContextMenu();
			}
		};

		document.addEventListener('click', handleClick);

		// 读取持久化的文件树宽度
		try {
			const savedWidth = localStorage.getItem(FILE_TREE_WIDTH_KEY);
			if (savedWidth) {
				const w = parseInt(savedWidth, 10);
				if (!Number.isNaN(w) && w >= 180 && w <= 480) {
					treeWidth = w;
				}
			}
		} catch (e) {
			console.debug('读取文件树宽度失败:', e);
		}

		// 加载主页 - 仅在当前没有路径时加载（避免覆盖从其他面板跳转过来的导航）
		if (!fileBrowserStore.getState().currentPath) {
			loadHomepage();
		} else {
			console.log(
				'📍 FileBrowser mounted, preserving current path:',
				fileBrowserStore.getState().currentPath
			);
		}

		// 注册缩略图生成回调 - 从设置读取配置
		const applyThumbnailSettings = async () => {
			try {
				const settings = await getPerformanceSettings();
				const maxLocal = settings.thumbnail_concurrent_local || 6;
				const maxArchive = settings.thumbnail_concurrent_archive || 3;
				console.log(`📊 应用缩略图设置: 本地=${maxLocal}, 压缩包=${maxArchive}`);
				configureThumbnailManager({
					maxConcurrentLocal: maxLocal,
					maxConcurrentArchive: maxArchive,
					thumbnailSize: 256
				});
			} catch (e) {
				console.debug('读取缩略图设置失败，使用默认值:', e);
				configureThumbnailManager({
					maxConcurrentLocal: 6,
					maxConcurrentArchive: 3,
					thumbnailSize: 256
				});
			}
		};

		// 初始化
		applyThumbnailSettings();

		// 每 5 秒检查一次设置是否变化
		let settingsCheckInterval: ReturnType<typeof setInterval> | null = null;

		settingsCheckInterval = setInterval(() => {
			currentEpoch++;
			applyThumbnailSettings();
		}, 5000);

		// 开发模式下运行性能测试
		if (import.meta.env.DEV) {
			console.log('🚀 性能优化已启用，可在控制台运行 runPerformanceTests() 进行测试');
			// 延迟运行测试，避免影响初始加载
			setTimeout(() => {
				// runPerformanceOptimizationTests();
			}, 2000);
		}

		return () => {
			document.removeEventListener('click', handleClick);
			clearInterval(settingsCheckInterval);
		};
	});

	function handleTreeResizeMouseDown(e: MouseEvent) {
		isTreeResizing = true;
		treeResizeStartX = e.clientX;
		treeResizeStartWidth = treeWidth;
		document.addEventListener('mousemove', handleTreeResizeMouseMove);
		document.addEventListener('mouseup', handleTreeResizeMouseUp);
	}

	function handleTreeResizeMouseMove(e: MouseEvent) {
		if (!isTreeResizing) return;
		const delta = e.clientX - treeResizeStartX;
		const next = Math.min(480, Math.max(180, treeResizeStartWidth + delta));
		treeWidth = next;
	}

	function handleTreeResizeMouseUp() {
		if (!isTreeResizing) return;
		isTreeResizing = false;
		try {
			localStorage.setItem(FILE_TREE_WIDTH_KEY, String(treeWidth));
		} catch (e) {
			console.debug('保存文件树宽度失败:', e);
		}
		document.removeEventListener('mousemove', handleTreeResizeMouseMove);
		document.removeEventListener('mouseup', handleTreeResizeMouseUp);
	}

	/**
	 * 选择文件夹
	 */
	async function selectFolder() {
		console.log('📂 selectFolder called');
		try {
			console.log('🔄 Calling FileSystemAPI.selectFolder...');
			const path = await FileSystemAPI.selectFolder();
			console.log('✅ Selected path:', path);

			if (path) {
				console.log('📂 Loading selected directory...');
				await loadDirectory(path);
				console.log('✅ Directory loaded successfully');
			} else {
				console.log('⚠️ No folder selected');
			}
		} catch (err) {
			console.error('❌ Error in selectFolder:', err);
			fileBrowserStore.setError(String(err));
		}
	}

	/**
	 * 加载目录内容（添加到历史记录）
	 */
	async function loadDirectory(path: string) {
		await loadDirectoryWithoutHistory(path);
		navigationHistory.push(path);
	}

	/**
	 * 加载目录内容（不添加历史记录，用于前进/后退）
	 * 优化：立即显示缓存数据，异步验证和加载
	 */
	async function loadDirectoryWithoutHistory(path: string) {
		console.log('📂 loadDirectory called with path:', path);

		// 立即更新 UI（乐观更新）
		const oldPath = currentPath;
		currentPath = path;

		// 立即取消之前的任务
		if (oldPath && oldPath !== path) {
			cancelBySource(oldPath);
		}

		// 立即清空旧数据，提供即时反馈
		fileBrowserStore.setError('');
		fileBrowserStore.setArchiveView(false);
		fileBrowserStore.setSelectedIndex(-1);
		fileBrowserStore.setCurrentPath(path);
		selectedItems.clear();

		// 首先检查缓存（同步操作，立即返回）
		const cachedData = navigationHistory.getCachedDirectory(path);

		if (cachedData) {
			// 有缓存：立即显示，不设置 loading 状态
			console.log('📋 使用缓存数据（立即显示）:', path);
			fileBrowserStore.setItems(cachedData.items);
			fileBrowserStore.setThumbnails(cachedData.thumbnails);
			thumbnails = new Map(cachedData.thumbnails);
			updateTreeWithDirectory(path, cachedData.items);

			// 异步验证缓存并更新缩略图
			runWithScheduler({
				type: 'filebrowser-cache-validate',
				source: `cache:${path}`,
				bucket: 'background',
				priority: 'low',
				executor: async () => {
					const isValid = await navigationHistory.validateCache(path);
					if (!isValid) {
						console.log('🔄 缓存失效，重新加载:', path);
						await reloadDirectoryFromBackend(path);
					} else {
						// 缓存有效，继续加载缺失的缩略图
						await loadThumbnailsForItems(cachedData.items, path, cachedData.thumbnails);
					}
				}
			}).catch((err) => {
				console.debug('缓存验证任务失败:', err);
			});
		} else {
			// 无缓存：显示 loading，异步加载
			fileBrowserStore.setLoading(true);
			fileBrowserStore.clearThumbnails();
			fileBrowserStore.setItems([]);

			// 异步加载，不阻塞 UI
			runWithScheduler({
				type: 'filebrowser-directory-load',
				source: `load:${path}`,
				bucket: 'background',
				priority: 'high', // 提高优先级，因为用户主动导航
				executor: async () => {
					try {
						await reloadDirectoryFromBackend(path);
					} catch (err) {
						console.error('❌ Error loading directory:', err);
						fileBrowserStore.setError(String(err));
						fileBrowserStore.setItems([]);
					} finally {
						fileBrowserStore.setLoading(false);
					}
				}
			}).catch((err) => {
				console.error('❌ Error in load task:', err);
				fileBrowserStore.setError(String(err));
				fileBrowserStore.setLoading(false);
			});
		}
	}

	/**
	 * 从后端重新加载目录数据（完全分离文件浏览和缩略图加载）
	 * 优化：立即设置数据，不等待任何异步操作
	 */
	async function reloadDirectoryFromBackend(path: string) {
		console.log('🔄 Calling FileSystemAPI.loadDirectorySnapshot...');
		const snapshot = await FileSystemAPI.loadDirectorySnapshot(path);
		const loadedItems = snapshot.items;
		const directoryMtime = snapshot.mtime ? snapshot.mtime * 1000 : undefined;
		console.log(
			`✅ Loaded ${loadedItems.length} items${snapshot.cached ? ' (cache hit)' : ''}:`,
			loadedItems.map((i) => i.name)
		);

		// 立即设置数据，不等待缩略图
		const sortedItems = sortItems(
			loadedItems,
			fileBrowserStore.getState().sortField,
			fileBrowserStore.getState().sortOrder
		);
		fileBrowserStore.setItems(sortedItems);
		fileBrowserStore.setThumbnails(new Map());
		fileBrowserStore.setLoading(false); // 立即取消 loading 状态
		updateTreeWithDirectory(path, sortedItems);

		// 异步预填充缓存缩略图（不阻塞）
		prefillThumbnailsFromCache(loadedItems, path).catch((err) => {
			console.debug('预填充缩略图失败:', err);
		});

		// 缓存目录数据（不包含缩略图）
		navigationHistory.cacheDirectory(path, loadedItems, new Map(), directoryMtime);

		// 立即加载缩略图（不阻塞文件浏览，但立即开始处理）
		runWithScheduler({
			type: 'filebrowser-thumbnail-preload',
			source: `thumb:${path}`,
			bucket: 'background',
			priority: 'low',
			executor: () => loadThumbnailsForItemsAsync(loadedItems, path)
		}).catch((err) => console.debug('缩略图预加载任务失败:', err));

		// 预加载相邻目录（低优先级）
		runWithScheduler({
			type: 'filebrowser-prefetch-adjacent',
			source: `prefetch:${path}`,
			bucket: 'background',
			priority: 'low',
			executor: async () => {
				navigationHistory.prefetchAdjacentPaths(path);
			}
		}).catch((err) => console.debug('相邻目录预取失败:', err));
	}

	/**
	 * 异步加载缩略图（立即开始，不阻塞文件浏览）
	 */
	async function loadThumbnailsForItemsAsync(items: FsItem[], path: string) {
		console.log('🖼️ 异步缩略图扫描：项目总数', items.length);
		const SMALL_DIR_THRESHOLD = 50;
		const isSmallDirectory = items.length > 0 && items.length <= SMALL_DIR_THRESHOLD;

		// 设置当前目录（用于优先级判断）
		thumbnailManager.setCurrentDirectory(path);

		// 检测是否为合集文件夹（子文件夹数量>45）
		const subfolders = items.filter((item) => item.isDir);
		const isCollectionFolder = subfolders.length > 45;

		// 过滤出需要缩略图的项目
		const itemsNeedingThumbnails = items.filter((item) => {
			const name = item.name.toLowerCase();
			const isDir = item.isDir;

			// 支持的图片扩展名
			const imageExts = [
				'.jpg',
				'.jpeg',
				'.png',
				'.gif',
				'.bmp',
				'.webp',
				'.avif',
				'.jxl',
				'.tiff',
				'.tif'
			];
			// 支持的压缩包扩展名
			const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
			// 支持的视频扩展名
			const videoExts = [
				'.mp4',
				'.mkv',
				'.avi',
				'.mov',
				'.flv',
				'.webm',
				'.wmv',
				'.m4v',
				'.mpg',
				'.mpeg'
			];

			const ext = name.substring(name.lastIndexOf('.'));

			// 文件夹或支持的文件类型（包括视频）
			return (
				isDir || imageExts.includes(ext) || archiveExts.includes(ext) || videoExts.includes(ext)
			);
		});

		// 1. 立即预加载数据库索引（异步，不阻塞）
		const paths = itemsNeedingThumbnails.map((item) => item.path);
		thumbnailManager.preloadDbIndex(paths).catch((err) => {
			console.debug('预加载数据库索引失败:', err);
		});

		// 2. 立即加载所有文件的缩略图（getThumbnail 会自动检查数据库并立即显示已缓存的）
		// 对于已缓存的，会立即从数据库加载并显示
		// 对于未缓存的，会入队生成（immediate 优先级）
		itemsNeedingThumbnails.forEach((item) => {
			if (item.isDir) {
				// 文件夹：先尝试从数据库加载，如果没有记录则批量扫描
				thumbnailManager.getThumbnail(item.path, undefined, false, 'immediate');
			} else {
				// 文件：检查是否为压缩包
				const nameLower = item.name.toLowerCase();
				const isArchive =
					nameLower.endsWith('.zip') ||
					nameLower.endsWith('.cbz') ||
					nameLower.endsWith('.rar') ||
					nameLower.endsWith('.cbr') ||
					nameLower.endsWith('.7z') ||
					nameLower.endsWith('.cb7');

				// 如果是压缩包，记录日志
				if (isArchive) {
					console.log(`📦 请求压缩包缩略图: ${item.path}`);
				}

				// getThumbnail 会自动检查数据库，如果存在会立即加载并返回
				// 如果不存在，会入队生成（immediate 优先级）
				thumbnailManager.getThumbnail(item.path, undefined, isArchive, 'immediate');
			}
		});

		// 3. 批量扫描无记录的文件夹，查找第一个图片/压缩包并绑定（异步，不阻塞）
		runWithScheduler({
			type: 'filebrowser-folder-scan',
			source: `scan:${path}`,
			bucket: 'background',
			priority: 'low',
			executor: async () => {
				await new Promise((resolve) => setTimeout(resolve, 500));
				const folderCandidates: FsItem[] = itemsNeedingThumbnails.filter((item) => item.isDir);
				let foldersWithoutThumbnails: FsItem[] = [];
				if (isSmallDirectory) {
					foldersWithoutThumbnails = folderCandidates;
				} else {
					for (const item of folderCandidates) {
						const hasThumbnail = await thumbnailManager.checkThumbnailInDb(item.path);
						if (!hasThumbnail) {
							foldersWithoutThumbnails.push(item);
						}
					}
				}
				if (foldersWithoutThumbnails.length > 0) {
					console.log(`🔍 批量扫描 ${foldersWithoutThumbnails.length} 个文件夹...`);
					await thumbnailManager.batchScanFoldersAndBindThumbnails(foldersWithoutThumbnails, path);
				}
			}
		}).catch((err) => console.debug('批量扫描任务失败:', err));

		// 5. 处理合集文件夹（特殊优化）
		if (isCollectionFolder) {
			console.log('📚 检测到合集文件夹，优先加载最新和未记录的');
			loadCollectionFolderThumbnails(items, path, subfolders);
		} else {
			console.log(`⚡ 已将 ${itemsNeedingThumbnails.length} 个项目入队（立即处理）`);
		}
	}

	/**
	 * 加载合集文件夹缩略图（优先最新和未记录的）
	 */
	function loadCollectionFolderThumbnails(items: FsItem[], path: string, subfolders: FsItem[]) {
		// 设置当前目录
		thumbnailManager.setCurrentDirectory(path);

		// 按修改时间排序（最新的在前）
		const sortedFolders = [...subfolders].sort((a, b) => {
			const aTime = a.modified ? new Date(a.modified).getTime() : 0;
			const bTime = b.modified ? new Date(b.modified).getTime() : 0;
			return bTime - aTime; // 降序
		});

		// 优先加载前 50 个最新的文件夹
		const priorityFolders = sortedFolders.slice(0, 50);

		// 先加载图片和压缩包（优先级最高）
		const imagesAndArchives = items.filter(
			(item) =>
				!item.isDir &&
				(item.isImage ||
					item.name.endsWith('.zip') ||
					item.name.endsWith('.cbz') ||
					item.name.endsWith('.rar') ||
					item.name.endsWith('.cbr'))
		);

		// 入队图片和压缩包（immediate 优先级）
		imagesAndArchives.forEach((item) => {
			const isArchive =
				item.name.endsWith('.zip') ||
				item.name.endsWith('.cbz') ||
				item.name.endsWith('.rar') ||
				item.name.endsWith('.cbr');
			thumbnailManager.getThumbnail(item.path, undefined, isArchive, 'immediate');
		});

		// 入队优先文件夹（high 优先级）
		priorityFolders.forEach((folder) => {
			thumbnailManager.getThumbnail(folder.path, undefined, false, 'high');
		});

		// 其余文件夹延迟加载（normal 优先级）
		const remainingFolders = sortedFolders.slice(50);
		remainingFolders.forEach((folder) => {
			thumbnailManager.getThumbnail(folder.path, undefined, false, 'normal');
		});

		console.log(
			`📚 合集文件夹：优先加载 ${priorityFolders.length} 个最新文件夹，${imagesAndArchives.length} 个图片/压缩包`
		);
	}

	/**
	 * 为项目加载缩略图 - 优化版本，当前文件夹优先加载（已弃用，改用异步版本）
	 * @deprecated 使用 loadThumbnailsForItemsAsync 代替
	 */
	async function loadThumbnailsForItems(
		items: FsItem[],
		path: string,
		existingThumbnails: Map<string, string> = new Map()
	) {
		// 直接调用异步版本，不阻塞
		loadThumbnailsForItemsAsync(items, path);
	}

	/**
	 * 加载压缩包内容
	 */
	async function loadArchive(path: string) {
		console.log('📦 loadArchive called with path:', path);

		fileBrowserStore.setLoading(true);
		fileBrowserStore.setError('');
		fileBrowserStore.clearThumbnails();
		fileBrowserStore.setArchiveView(true, path);
		fileBrowserStore.setSelectedIndex(-1);

		try {
			const loadedItems = await FileSystemAPI.listArchiveContents(path);
			console.log('✅ Loaded', loadedItems.length, 'archive items');

			fileBrowserStore.setItems(loadedItems);

			// 异步加载压缩包内图片的缩略图
			for (const item of loadedItems) {
				if (itemIsImage(item)) {
					loadArchiveThumbnail(item.path);
				}
			}
		} catch (err) {
			console.error('❌ Error loading archive:', err);
			fileBrowserStore.setError(String(err));
			fileBrowserStore.setItems([]);
		} finally {
			fileBrowserStore.setLoading(false);
		}
	}

	/**
	 * 加载单个缩略图
	 */

	/**
	 * 加载文件夹缩略图
	 */

	/**
	 * 加载压缩包内图片的缩略图 - 完全使用单张图片逻辑
	 */
	async function loadArchiveThumbnail(filePath: string) {
		try {
			// 从压缩包中提取图片数据
			const imageData = await FileSystemAPI.loadImageFromArchive(currentArchivePath, filePath);
			// TODO: 缩略图功能已移除，待重新实现
			// 使用新的API从图片数据生成缩略图
			// const thumbnail = await FileSystemAPI.generateThumbnailFromData(imageData);
			// fileBrowserStore.addThumbnail(filePath, thumbnail);
		} catch (err) {
			// 不支持的图片格式或其他错误，静默失败
			console.debug('Failed to load archive thumbnail:', err);
		}
	}

	/**
	 * 显示右键菜单
	 */
	function showContextMenu(e: MouseEvent, item: FsItem) {
		e.preventDefault();
		console.log('[FileBrowser] showContextMenu input', {
			clientX: e.clientX,
			clientY: e.clientY,
			targetTag: (e.target as HTMLElement | null)?.tagName,
			path: item.path
		});

		let menuX = e.clientX;
		let menuY = e.clientY;

		if (menuX === 0 && menuY === 0 && e.target instanceof HTMLElement) {
			const rect = e.target.getBoundingClientRect();
			menuX = rect.left + rect.width / 2;
			menuY = rect.top + rect.height / 2;
		}

		// 获取视口尺寸
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const viewportMiddle = viewportHeight / 2;

		let menuDirection = 'down'; // 默认向下展开

		// 确保菜单不超出视口右侧
		const menuWidth = 180; // 预估菜单宽度
		if (e.clientX + menuWidth > viewportWidth) {
			menuX = viewportWidth - menuWidth - 10; // 留10px边距
		}

		// 确保菜单不超出视口左侧
		if (menuX < 10) {
			menuX = 10;
		}

		// 如果点击位置在视口中线以下，则向上翻转菜单
		if (e.clientY > viewportMiddle) {
			menuDirection = 'up';
			// 向上翻转时，需要调整Y坐标，让菜单底部对齐点击位置
			// 使用70vh的最大高度来计算位置
			const maxMenuHeight = viewportHeight * 0.7;
			menuY = e.clientY - Math.min(250, maxMenuHeight); // 预估菜单高度或最大高度
		}

		// 确保菜单不超出视口顶部或底部
		const maxMenuHeight = viewportHeight * 0.7;
		if (menuDirection === 'down' && menuY + maxMenuHeight > viewportHeight) {
			menuY = viewportHeight - maxMenuHeight - 10;
		}
		if (menuDirection === 'up' && menuY < 10) {
			menuY = 10;
		}
		console.log('[FileBrowser] showContextMenu computed', {
			menuX,
			menuY,
			menuDirection,
			viewportWidth,
			viewportHeight
		});

		contextMenu = {
			x: menuX,
			y: menuY,
			item,
			direction: menuDirection as 'up' | 'down'
		};
	}

	/**
	 * 显示书签右键菜单
	 */
	function showBookmarkContextMenu(e: MouseEvent, bookmark: any) {
		e.preventDefault();
		e.stopPropagation();

		// 获取视口尺寸
		const viewportWidth = window.innerWidth;

		let menuX = e.clientX;
		let menuY = e.clientY;

		// 确保菜单不超出视口右侧
		const menuWidth = 180;
		if (e.clientX + menuWidth > viewportWidth) {
			menuX = viewportWidth - menuWidth - 10;
		}

		// 确保菜单不超出视口左侧
		if (menuX < 10) {
			menuX = 10;
		}

		// 确保菜单不超出视口底部
		const viewportHeight = window.innerHeight;
		const maxMenuHeight = viewportHeight * 0.7;
		if (menuY + maxMenuHeight > viewportHeight) {
			menuY = viewportHeight - maxMenuHeight - 10;
		}

		bookmarkContextMenu = { x: menuX, y: menuY, bookmark };
	}

	/**
	 * 隐藏右键菜单
	 */
	function hideContextMenu() {
		contextMenu = { x: 0, y: 0, item: null, direction: 'down' };
		bookmarkContextMenu = { x: 0, y: 0, bookmark: null };
		copyToSubmenu.show = false;
	}

	/**
	 * 浏览压缩包内容
	 */
	async function browseArchive(item: FsItem) {
		console.log('📦 Browsing archive:', item.path);
		await loadArchive(item.path);
		hideContextMenu();
	}

	/**
	 * 作为书籍打开文件夹
	 */
	async function openFolderAsBook(item: FsItem) {
		if (!item.isDir) return;
		try {
			console.log('📁 Opening folder as book:', item.path);
			await bookStore.openDirectoryAsBook(item.path);
		} catch (err) {
			console.error('❌ Error opening folder as book:', err);
			fileBrowserStore.setError(String(err));
		} finally {
			hideContextMenu();
		}
	}

	/**
	 * 作为书籍打开压缩包
	 */
	async function openArchiveAsBook(item: FsItem) {
		console.log('📦 Opening archive as book:', item.path);
		await bookStore.openBook(item.path);
		hideContextMenu();
	}

	/**
	 * 检查并打开文件
	 */
	async function openFile(item: FsItem) {
		console.log('=== openFile called ===');
		console.log('Item:', {
			name: item.name,
			isDir: item.isDir,
			isImage: item.isImage,
			path: item.path,
			size: item.size
		});

		try {
			if (item.isDir) {
				// 📁 文件夹：浏览或作为 book 打开
				console.log('📁 Folder clicked:', item.path);

				if (isPenetrateMode) {
					const penetrated = await tryPenetrateFolder(item.path);
					if (penetrated) {
						await openFile(penetrated);
						return;
					}
				}

				// 右键 = 浏览,左键 = 作为 book 打开 (先实现浏览,后续添加上下文菜单)
				// 目前默认行为: 浏览
				await navigateToDirectory(item.path);
				console.log('✅ Directory navigation completed');
			} else {
				// 检查是否为压缩包
				const isArchive = await FileSystemAPI.isSupportedArchive(item.path);
				console.log('Is archive:', isArchive);

				if (isArchive) {
					// 📦 压缩包：作为 book 打开
					console.log('📦 Archive clicked as book:', item.path);

					// 打开压缩包作为书籍
					await bookStore.openBook(item.path);
					console.log('✅ Archive opened as book');
				} else {
					// 非压缩包：检查是否为视频或普通图片（前端通过扩展名判断）
					const isVideo = isVideoPath(item.path);
					console.log('Is video:', isVideo);

					if (isVideo) {
						// 🎬 视频文件：作为 media book 打开
						console.log('🎬 Video clicked as media book:', item.path);
						await bookStore.openBook(item.path);
						console.log('✅ Video opened as media book');
					} else if (item.isImage) {
						// 🖼️ 图片：打开查看
						console.log('🖼️ Image clicked:', item.path);

						if (isArchiveView) {
							// 从压缩包中打开图片
							await openImageFromArchive(item.path);
						} else {
							// 从文件系统打开图片
							await openImage(item.path);
						}
					} else {
						console.log('⚠️ Unknown file type, ignoring');
					}
				}
			}
		} catch (err) {
			console.error('❌ Error in openFile:', err);
			fileBrowserStore.setError(String(err));
		}
	}

	async function tryPenetrateFolder(folderPath: string): Promise<FsItem | null> {
		try {
			const children = await FileSystemAPI.browseDirectory(folderPath);
			if (children.length === 1 && !children[0].isDir) {
				console.log('📂 Penetrate mode: opening single child file:', children[0].path);
				return children[0];
			}
		} catch (error) {
			console.debug('穿透模式读取目录失败:', folderPath, error);
		}

		return null;
	}

	/**
	 * 从压缩包打开图片
	 */
	async function openImageFromArchive(filePath: string) {
		try {
			console.log('📦 Opening image from archive:', filePath);
			// 打开整个压缩包作为 book
			await bookStore.openArchiveAsBook(currentArchivePath);
			// 跳转到指定图片
			await bookStore.navigateToImage(filePath);
			console.log('✅ Image opened from archive');
		} catch (err) {
			console.error('❌ Error opening image from archive:', err);
			fileBrowserStore.setError(String(err));
		}
	}

	/**
	 * 返回上一级（优化响应性 - 立即显示缓存）
	 */
	async function goBack() {
		try {
			let parentDir: string | null = null;

			if (isArchiveView) {
				// 从压缩包视图返回到文件系统
				isArchiveView = false;
				const lastBackslash = currentArchivePath.lastIndexOf('\\');
				const lastSlash = currentArchivePath.lastIndexOf('/');
				const lastSeparator = Math.max(lastBackslash, lastSlash);
				parentDir =
					lastSeparator > 0 ? currentArchivePath.substring(0, lastSeparator) : currentPath;
			} else if (currentPath) {
				// 文件系统中返回上一级
				const lastBackslash = currentPath.lastIndexOf('\\');
				const lastSlash = currentPath.lastIndexOf('/');
				const lastSeparator = Math.max(lastBackslash, lastSlash);

				if (lastSeparator > 0) {
					parentDir = currentPath.substring(0, lastSeparator);
					// 确保不是驱动器根目录后面的路径
					if (parentDir && parentDir.endsWith(':')) {
						parentDir = null;
					}
				}
			}

			if (parentDir) {
				// 立即加载（会立即显示缓存数据）
				await loadDirectory(parentDir);
			}
		} catch (error) {
			console.error('❌ 返回上一级失败:', error);
			fileBrowserStore.setError(String(error));
		}
	}

	/**
	 * 导航到目录（优化：立即显示缓存，异步取消旧任务）
	 */
	async function navigateToDirectory(path: string) {
		console.log('🚀 navigateToDirectory called with path:', path);
		if (!path) {
			console.warn('⚠️ Empty path provided to navigateToDirectory');
			return;
		}

		// 立即开始加载新目录（会立即显示缓存数据）
		const loadPromise = loadDirectory(path);

		// 异步取消旧目录的任务（不阻塞新目录加载）
		if (currentPath && currentPath !== path) {
			runWithScheduler({
				type: 'filebrowser-cancel-old',
				source: `cancel:${currentPath}`,
				bucket: 'background',
				priority: 'low',
				executor: async () => {
					try {
						const cancelled = await cancelFolderTasks(currentPath);
						if (cancelled > 0) {
							console.log(`🚫 已取消旧目录 ${currentPath} 的 ${cancelled} 个缩略图任务`);
						}
						cancelBySource(currentPath);
					} catch (e) {
						console.debug('取消任务失败:', e);
					}
				}
			}).catch(() => {});
		}

		await loadPromise;
	}

	/**
	 * 打开图片文件
	 */
	async function openImage(path: string) {
		try {
			console.log('🖼️ Opening image:', path);
			// 获取图片所在的目录
			const lastBackslash = path.lastIndexOf('\\');
			const lastSlash = path.lastIndexOf('/');
			const lastSeparator = Math.max(lastBackslash, lastSlash);
			const parentDir = lastSeparator > 0 ? path.substring(0, lastSeparator) : path;

			console.log('📁 Parent directory:', parentDir);
			// 打开整个文件夹作为 book
			await bookStore.openDirectoryAsBook(parentDir);
			// 跳转到指定图片
			await bookStore.navigateToImage(path);
			console.log('✅ Image opened');
		} catch (err) {
			console.error('❌ Error opening image:', err);
			fileBrowserStore.setError(String(err));
		}
	}

	/**
	 * 删除文件
	 */
	async function deleteItem(path: string) {
		if (!confirm('确定要删除此项吗？')) return;

		try {
			await FileSystemAPI.moveToTrash(path);
			await loadDirectory(currentPath);
		} catch (err) {
			fileBrowserStore.setError(String(err));
		}
	}

	/**
	 * 刷新
	 */
	async function refresh() {
		if (currentPath) {
			await loadDirectory(currentPath);
		}
	}

	/**
	 * 清理缩略图缓存
	 */
	async function clearThumbnailCache() {
		if (!confirm('确定要清理所有缩略图缓存吗？这将重新生成所有缩略图。')) return;

		try {
			// TODO: 缩略图功能已移除，待重新实现
			// const count = await FileSystemAPI.clearThumbnailCache();
			// console.log(`✅ 已清理 ${count} 个缓存文件`);
			console.warn('缩略图缓存清理功能已移除，待重新实现');
			// 刷新当前目录以重新生成缩略图
			if (currentPath) {
				await loadDirectory(currentPath);
			}
		} catch (err) {
			console.error('❌ 清理缓存失败:', err);
			fileBrowserStore.setError(String(err));
		}
	}

	/**
	 * 处理排序
	 */
	function handleSort(sortedItems: FsItem[]) {
		if (searchQuery && searchResults.length > 0) {
			// 如果正在显示搜索结果，则排序搜索结果
			searchResults = sortedItems;
		} else {
			// 否则排序普通文件列表
			fileBrowserStore.setItems(sortedItems);
		}
	}

	/**
	 * 格式化文件大小
	 */
	function formatSize(bytes: number, isDir: boolean): string {
		if (isDir) {
			// 对于目录，显示子项数量
			return bytes === 0 ? '空文件夹' : `${bytes} 项`;
		}
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
	}

	/**
	 * 格式化日期
	 */
	function formatDate(timestamp?: number): string {
		if (!timestamp) return '-';
		const date = new Date(timestamp * 1000);
		return date.toLocaleString();
	}

	/**
	 * 键盘导航处理
	 */
	function handleKeydown(e: KeyboardEvent) {
		if (items.length === 0) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				fileBrowserStore.setSelectedIndex(Math.min(selectedIndex + 1, items.length - 1));
				break;
			case 'ArrowUp':
				e.preventDefault();
				fileBrowserStore.setSelectedIndex(Math.max(selectedIndex - 1, 0));
				break;
			case 'Enter':
				e.preventDefault();
				if (selectedIndex >= 0 && selectedIndex < items.length) {
					openFile(items[selectedIndex]);
				}
				break;
			case 'Home':
				e.preventDefault();
				fileBrowserStore.setSelectedIndex(0);
				break;
			case 'End':
				e.preventDefault();
				fileBrowserStore.setSelectedIndex(items.length - 1);
				break;
			case 'Backspace':
				e.preventDefault();
				goBack();
				break;
			case 'F5':
				e.preventDefault();
				refresh();
				break;
		}
	}

	/**
	 * 处理路径栏导航
	 */
	async function handlePathNavigate(path: string) {
		if (path) {
			// 检查是否是文件（通过扩展名判断）
			const isFile =
				/\.(zip|cbz|rar|cbr|7z|pdf|mp4|mkv|avi|mov|flv|webm|wmv|m4v|mpg|mpeg|jpg|jpeg|png|gif|webp|avif|jxl|bmp|tiff)$/i.test(
					path
				);

			if (isFile) {
				console.log('📂 导航到文件:', path);

				// 同时也导航到该文件所在的文件夹（静默同步）
				const lastSeparator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
				if (lastSeparator > 0) {
					const parentDir = path.substring(0, lastSeparator);
					// 不等待目录加载完成，直接打开文件，让目录在后台加载
					navigateToDirectory(parentDir).catch((err) => console.error('同步目录失败:', err));
				}

				const name = path.split(/[\\/]/).pop() || path;
				const item: FsItem = {
					name,
					path,
					isDir: false,
					isImage: /\.(jpg|jpeg|png|gif|webp|avif|jxl|bmp|tiff)$/i.test(path),
					size: 0,
					modified: Date.now() // Dummy timestamp
				};
				await openFile(item);
			} else {
				await navigateToDirectory(path);
			}
		} else {
			// 返回根目录/主页
			currentPath = '';
			items = [];
			isArchiveView = false;
		}
	}

	// ===== 右键菜单功能 =====

	/**
	 * 添加到书签
	 */
	function addToBookmark(item: FsItem) {
		bookmarkStore.add(item);
		loadBookmarks(); // 立即刷新书签列表
		hideContextMenu();
	}

	/**
	 * 在资源管理器中打开
	 */
	async function openInExplorer(item: FsItem) {
		try {
			await FileSystemAPI.showInFileManager(item.path);
		} catch (err) {
			fileBrowserStore.setError(String(err));
		}
		hideContextMenu();
	}

	/**
	 * 在外部应用中打开
	 */
	async function openWithExternalApp(item: FsItem) {
		try {
			await FileSystemAPI.openWithSystem(item.path);
		} catch (err) {
			fileBrowserStore.setError(String(err));
		}
		hideContextMenu();
	}

	/**
	 * 剪切文件
	 */
	function cutItem(item: FsItem) {
		clipboardItem = { path: item.path, operation: 'cut' };
		hideContextMenu();
	}

	/**
	 * 复制文件
	 */
	function copyItem(item: FsItem) {
		clipboardItem = { path: item.path, operation: 'copy' };
		hideContextMenu();
	}

	/**
	 * 粘贴文件
	 */
	async function pasteItem() {
		if (!clipboardItem || !currentPath) return;

		try {
			const targetPath = `${currentPath}/${clipboardItem.path.split(/[\\/]/).pop()}`;

			if (clipboardItem.operation === 'cut') {
				await FileSystemAPI.movePath(clipboardItem.path, targetPath);
			} else {
				await FileSystemAPI.copyPath(clipboardItem.path, targetPath);
			}

			clipboardItem = null;
			await refresh();
		} catch (err) {
			fileBrowserStore.setError(String(err));
		}
	}

	/**
	 * 显示复制到子菜单
	 */
	function showCopyToSubmenu(e: MouseEvent) {
		e.stopPropagation();

		// 获取视口尺寸
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let submenuX = contextMenu.x + 150; // 子菜单在主菜单右侧
		let submenuY = contextMenu.y;

		// 确保子菜单不超出视口右侧
		const submenuWidth = 150;
		if (submenuX + submenuWidth > viewportWidth) {
			// 如果右侧放不下，放在左侧
			submenuX = contextMenu.x - submenuWidth - 10;
		}

		// 确保子菜单不超出视口左侧
		if (submenuX < 10) {
			submenuX = 10;
		}

		// 如果主菜单是向上展开的，子菜单也需要相应调整位置
		if (contextMenu.direction === 'up') {
			submenuY = contextMenu.y + 200; // 调整子菜单位置，使其与主菜单项对齐
		}

		// 确保子菜单不超出视口底部
		const maxSubmenuHeight = viewportHeight * 0.5;
		if (submenuY + maxSubmenuHeight > viewportHeight) {
			submenuY = viewportHeight - maxSubmenuHeight - 10;
		}

		// 确保子菜单不超出视口顶部
		if (submenuY < 10) {
			submenuY = 10;
		}

		copyToSubmenu = { show: true, x: submenuX, y: submenuY };
	}

	/**
	 * 复制到指定文件夹
	 */
	async function copyToFolder(targetPath: string) {
		if (!contextMenu.item) return;

		try {
			const fileName = contextMenu.item.path.split(/[\\/]/).pop();
			const targetFilePath = `${targetPath}/${fileName}`;
			await FileSystemAPI.copyPath(contextMenu.item.path, targetFilePath);
			await refresh();
		} catch (err) {
			fileBrowserStore.setError(String(err));
		}
		hideContextMenu();
		copyToSubmenu.show = false;
	}

	/**
	 * 删除文件
	 */
	async function deleteItemFromMenu(item: FsItem) {
		if (!confirm(`确定要删除 "${item.name}" 吗？`)) return;

		try {
			await FileSystemAPI.moveToTrash(item.path);
			await refresh();
		} catch (err) {
			fileBrowserStore.setError(String(err));
		}
		hideContextMenu();
	}

	/**
	 * 移动到文件夹
	 */
	async function moveToFolder() {
		if (!contextMenu.item) return;

		try {
			const targetPath = await FileSystemAPI.selectFolder();
			if (targetPath) {
				const fileName = contextMenu.item.path.split(/[\\/]/).pop();
				const targetFilePath = `${targetPath}/${fileName}`;
				await FileSystemAPI.movePath(contextMenu.item.path, targetFilePath);
				await refresh();
			}
		} catch (err) {
			fileBrowserStore.setError(String(err));
		}
		hideContextMenu();
	}

	/**
	 * 重命名
	 */
	async function renameItem(item: FsItem) {
		const newName = prompt('请输入新名称:', item.name);
		if (!newName || newName === item.name) return;

		try {
			const newPath = item.path.replace(item.name, newName);
			await FileSystemAPI.renamePath(item.path, newPath);
			await refresh();
		} catch (err) {
			fileBrowserStore.setError(String(err));
		}
		hideContextMenu();
		await openFile(item);
	}

	// ===== 搜索功能 =====

	// 搜索处理函数
	async function handleFileSearch(query: string) {
		console.log('🔍 [Search] handleFileSearch called with query:', query);
		searchQuery = query; // 更新搜索查询状态，确保 UI 正确切换显示

		if (!query.trim()) {
			console.log('🔍 [Search] Empty query, clearing results');
			searchResults = [];
			return;
		}

		isSearching = true;
		console.log('🔍 [Search] Starting search, currentPath:', currentPath);
		console.log('🔍 [Search] searchSettings:', searchSettings);

		try {
			const queryLower = query.toLowerCase();

			// 1. 搜索书签
			console.log('🔍 [Search] Step 1: Searching bookmarks...');
			const bookmarks = bookmarkStore.getAll();
			console.log('🔍 [Search] Total bookmarks:', bookmarks.length);

			const bookmarkResults: SearchResultItem[] = bookmarks
				.filter((b) => b.name.toLowerCase().includes(queryLower))
				.map((b) => ({
					name: b.name,
					path: b.path,
					isDir: b.type === 'folder',
					isImage: false, // 简化处理
					size: 0,
					modified: b.createdAt.getTime() / 1000,
					source: 'bookmark'
				}));
			console.log('🔍 [Search] Bookmark results:', bookmarkResults.length);

			// 2. 搜索历史
			console.log('🔍 [Search] Step 2: Searching history...');
			const history = navigationHistory.getHistory();
			console.log('🔍 [Search] Total history entries:', history.length);

			// 去重：移除已在书签中出现或重复的路径
			const historySet = new Set(history);
			bookmarkResults.forEach((b) => historySet.delete(b.path));

			const historyResults: SearchResultItem[] = Array.from(historySet)
				.filter((p) => p.toLowerCase().includes(queryLower))
				.map((p) => {
					const name = p.split(/[\\/]/).pop() || p;
					return {
						name,
						path: p,
						isDir: true, // 历史记录通常是文件夹
						isImage: false,
						size: 0,
						source: 'history'
					};
				});
			console.log('🔍 [Search] History results:', historyResults.length);

			// 3. 本地文件搜索
			console.log('🔍 [Search] Step 3: Searching local files...');
			const options = {
				includeSubfolders: searchSettings.includeSubfolders,
				maxResults: 1000,
				searchInPath: searchSettings.searchInPath
			};
			console.log('🔍 [Search] Calling FileSystemAPI.searchFiles with:', {
				currentPath,
				query,
				options
			});

			const localFiles = await FileSystemAPI.searchFiles(currentPath, query, options);
			console.log('🔍 [Search] Local files returned:', localFiles.length);

			const localResults: SearchResultItem[] = localFiles.map((item) => ({
				...item,
				source: 'local'
			}));

			// 合并结果
			searchResults = [...bookmarkResults, ...historyResults, ...localResults];

			console.log(
				`✅ [Search] 搜索完成，找到 ${searchResults.length} 个结果 (书签: ${bookmarkResults.length}, 历史: ${historyResults.length}, 本地: ${localResults.length})`
			);
			console.log('🔍 [Search] Search results:', searchResults);

			// 搜索完成后自动应用默认排序（路径升序）
			if (searchResults.length > 0) {
				console.log('🔍 [Search] Sorting results...');
				// 保持分类排序：书签 > 历史 > 本地
				// 内部按名称排序
				searchResults.sort((a, b) => {
					// 1. Sort by Source Priority: Bookmark > History > Local
					const sourcePriority = { bookmark: 0, history: 1, local: 2 };
					const priorityA = sourcePriority[a.source || 'local'];
					const priorityB = sourcePriority[b.source || 'local'];

					if (priorityA !== priorityB) {
						return priorityA - priorityB;
					}

					// 2. Sort by Name
					return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
				});
				console.log('🔍 [Search] Results sorted');
			}
		} catch (err) {
			console.error('❌ [Search] 搜索失败:', err);
			console.error(
				'❌ [Search] Error stack:',
				err instanceof Error ? err.stack : 'No stack trace'
			);
			fileBrowserStore.setError(String(err));
			searchResults = [];
		} finally {
			isSearching = false;
			console.log('🔍 [Search] Search completed, isSearching set to false');
		}
	}

	/**
	 * 打开搜索结果
	 */
	async function openSearchResult(item: FsItem) {
		await openFile(item);
	}

	function handleSearchResultKeydown(event: KeyboardEvent, item: FsItem) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			void openSearchResult(item);
		}
	}

	function handleSortChange(field: SortField, order: SortOrder) {
		fileBrowserStore.setSort(field, order);
		if (searchQuery && searchResults.length > 0) {
			searchResults = sortItems(searchResults, field, order);
		} else {
			const sorted = sortItems(items, field, order);
			fileBrowserStore.setItems(sorted);
		}
	}
</script>

<div class="bg-background flex h-full flex-col">
	<div
		class="border-border bg-background/95 supports-backdrop-filter:bg-background/70 sticky top-0 z-20 flex flex-col gap-0 border-b backdrop-blur"
	>
		<!-- 路径面包屑导航 -->
		<PathBar
			bind:currentPath
			isArchive={isArchiveView}
			onNavigate={handlePathNavigate}
			onSetHomepage={setHomepage}
		/>

		<!-- 工具栏 -->
		<div class="bg-background/50 flex items-center gap-1 border-b px-2 py-1.5">
			<!-- 左侧：导航按钮 -->
			<div class="flex items-center gap-1">
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							onclick={goHome}
							disabled={!navigationHistory.getHomepage()}
						>
							<Home class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>主页</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							onclick={goBackInHistory}
							disabled={!navigationHistory.canGoBack()}
						>
							<ChevronLeft class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>后退</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							onclick={goForwardInHistory}
							disabled={!navigationHistory.canGoForward()}
						>
							<ChevronRight class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>前进</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							onclick={goBack}
							disabled={!currentPath && !isArchiveView}
						>
							<ChevronUp class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>上一级 (Backspace)</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<div class="bg-border mx-1 h-6 w-px"></div>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={showFolderTree ? 'default' : 'ghost'}
							size="icon"
							class="h-8 w-8"
							onclick={toggleFolderTree}
							oncontextmenu={(e) => {
								e.preventDefault();
								selectFolder();
							}}
						>
							<FolderTree class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>
							{showFolderTree
								? '隐藏文件夹列表（右键选择文件夹）'
								: '显示文件夹列表（右键选择文件夹）'}
						</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							onclick={refresh}
							disabled={!currentPath && !isArchiveView}
						>
							<RefreshCw class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>刷新 (F5)</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={isCheckMode ? 'default' : 'ghost'}
							size="icon"
							class="h-8 w-8"
							onclick={toggleCheckMode}
						>
							<CheckSquare class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{isCheckMode ? '退出勾选模式' : '勾选模式'}</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={isDeleteMode ? 'destructive' : 'ghost'}
							size="icon"
							class="h-8 w-8"
							onclick={toggleDeleteMode}
						>
							<Trash2 class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{isDeleteMode ? '退出删除模式' : '删除模式'}</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={isPenetrateMode ? 'default' : 'ghost'}
							size="icon"
							class="h-8 w-8"
							onclick={() => (isPenetrateMode = !isPenetrateMode)}
						>
							<CornerDownRight class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>
							{isPenetrateMode ? '穿透模式：当文件夹只有一个子文件时直接打开子文件' : '穿透模式'}
						</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<div class="bg-border mx-1 h-6 w-px"></div>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={viewMode === 'list' ? 'default' : 'ghost'}
							size="icon"
							class="h-8 w-8"
							onclick={toggleViewMode}
						>
							{#if viewMode === 'list'}
								<List class="h-4 w-4" />
							{:else}
								<Grid3x3 class="h-4 w-4" />
							{/if}
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{viewMode === 'list' ? '切换到缩略图视图' : '切换到列表视图'}</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={showSearchBar ? 'default' : 'ghost'}
							size="icon"
							class="h-8 w-8"
							onclick={() => (showSearchBar = !showSearchBar)}
						>
							<Search class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{showSearchBar ? '隐藏搜索栏' : '显示搜索栏'}</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<SortPanel {sortField} {sortOrder} onSortChange={handleSortChange} />
			</div>
		</div>
		{#if showSearchBar}
			<!-- 搜索栏 -->
			<div class="border-border bg-background/95 border-b px-2 py-2">
				<SearchBar
					placeholder="搜索当前目录下的文件..."
					disabled={!currentPath || isArchiveView}
					onSearch={handleFileSearch}
					bind:searchHistory
					bind:searchSettings
					storageKey="neoview-file-search-history"
				/>
			</div>
		{/if}
	</div>

	<!-- 右键菜单：文件列表 -->
	{#if contextMenu.item}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="context-menu z-10000 bg-popover text-popover-foreground fixed min-w-[180px] rounded-md border py-1 shadow-lg"
			style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
			role="menu"
			tabindex="-1"
			onmousedown={(e: MouseEvent) => e.stopPropagation()}
		>
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center px-3 py-1.5 text-sm"
				onclick={() => openFile(contextMenu.item!)}
			>
				<Folder class="mr-2 h-4 w-4" />
				<span>打开</span>
			</button>
			{#if contextMenu.item.isDir}
				<button
					type="button"
					class="hover:bg-accent flex w-full items-center px-3 py-1.5 text-sm"
					onclick={() => openFolderAsBook(contextMenu.item!)}
				>
					<BookOpen class="mr-2 h-4 w-4" />
					<span>作为书籍打开</span>
				</button>
			{/if}
			<hr class="border-border/60 my-1" />
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center px-3 py-1.5 text-sm"
				onclick={() => addToBookmark(contextMenu.item!)}
			>
				<Bookmark class="mr-2 h-4 w-4" />
				<span>添加到书签</span>
			</button>
			<hr class="border-border/60 my-1" />
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center px-3 py-1.5 text-sm"
				onclick={() => cutItem(contextMenu.item!)}
			>
				<span class="mr-2 text-xs">✂</span>
				<span>剪切</span>
			</button>
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center px-3 py-1.5 text-sm"
				onclick={() => copyItem(contextMenu.item!)}
			>
				<span class="mr-2 text-xs">📄</span>
				<span>复制</span>
			</button>
			<button
				type="button"
				class="hover:bg-accent disabled:text-muted-foreground/70 flex w-full items-center px-3 py-1.5 text-sm"
				disabled={!clipboardItem}
				onclick={pasteItem}
			>
				<span class="mr-2 text-xs">📥</span>
				<span>粘贴</span>
			</button>
			<hr class="border-border/60 my-1" />
			<button
				type="button"
				class="flex w-full items-center px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
				onclick={() => deleteItemFromMenu(contextMenu.item!)}
			>
				<Trash2 class="mr-2 h-4 w-4" />
				<span>删除</span>
			</button>
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center px-3 py-1.5 text-sm"
				onclick={() => renameItem(contextMenu.item!)}
			>
				<span class="mr-2 text-xs">✏</span>
				<span>重命名</span>
			</button>
			<hr class="border-border/60 my-1" />
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center px-3 py-1.5 text-sm"
				onclick={() => openInExplorer(contextMenu.item!)}
			>
				<ExternalLink class="mr-2 h-4 w-4" />
				<span>在资源管理器中打开</span>
			</button>
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center px-3 py-1.5 text-sm"
				onclick={() => openWithExternalApp(contextMenu.item!)}
			>
				<ExternalLink class="mr-2 h-4 w-4" />
				<span>在外部应用中打开</span>
			</button>
		</div>
	{/if}

	<div class="flex min-h-0 flex-1 overflow-hidden">
		{#if showFolderTree}
			<div
				class="bg-background/80 relative flex shrink-0 flex-col border-r"
				style={`width: ${treeWidth}px; min-width: 180px; max-width: 480px;`}
			>
				<FileTreeView
					items={treeItems}
					{currentPath}
					{thumbnails}
					{selectedIndex}
					{isCheckMode}
					{isDeleteMode}
					{selectedItems}
					on:itemClick={(e: CustomEvent<{ item: FsItem; index: number }>) => {
						const { item } = e.detail;
						if (item?.isDir) {
							navigateToDirectory(item.path);
						} else {
							openFile(item);
						}
					}}
					on:itemDoubleClick={(e: CustomEvent<{ item: FsItem; index: number }>) => {
						const { item } = e.detail;
						if (item?.isDir) {
							navigateToDirectory(item.path);
						} else {
							openFile(item);
						}
					}}
					on:itemContextMenu={(e: CustomEvent<{ event: MouseEvent; item: FsItem }>) => {
						const { event, item } = e.detail;
						showContextMenu(event, item);
					}}
					on:selectionChange={(e: CustomEvent<{ selectedItems: Set<string> }>) => {
						selectedItems = new Set(e.detail.selectedItems);
					}}
					on:toggleNode={handleTreeToggleNode}
				/>
				<!-- 文件树宽度调整分隔条 -->
				<div
					class="hover:bg-border/70 absolute right-0 top-0 h-full w-1 cursor-col-resize"
					role="separator"
					aria-orientation="vertical"
					onmousedown={handleTreeResizeMouseDown}
				></div>
			</div>
		{/if}

		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<!-- 加载状态 -->
			{#if loading}
				<div class="flex flex-1 items-center justify-center">
					<div class="flex flex-col items-center gap-3">
						<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
						<div class="text-sm text-gray-500">加载中...</div>
					</div>
				</div>
			{:else if isSearching}
				<div class="flex flex-1 items-center justify-center">
					<div class="flex flex-col items-center gap-3">
						<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
						<div class="text-sm text-gray-500">搜索中...</div>
					</div>
				</div>
			{:else if searchQuery && searchResults.length === 0}
				<div class="flex flex-1 items-center justify-center">
					<div class="text-center text-gray-400">
						<svg
							class="mx-auto mb-2 h-16 w-16 opacity-50"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							></path>
						</svg>
						<p class="text-sm">未找到匹配的文件</p>
						<p class="text-sm">此目录为空</p>
					</div>
				</div>
			{:else if searchQuery && searchResults.length > 0}
				<!-- 搜索结果列表 -->
				<div class="flex min-h-0 flex-1 flex-col">
					<div class="border-b px-3 py-1 text-xs text-gray-500">
						找到 {searchResults.length} 个结果 (搜索: "{searchQuery}")
					</div>
					<div class="min-h-0 flex-1">
						<VirtualizedFileList
							items={searchResults}
							{currentPath}
							{thumbnails}
							{selectedIndex}
							scrollToSelectedToken={$fileBrowserStore.scrollToSelectedToken}
							{isCheckMode}
							{isDeleteMode}
							{selectedItems}
							{viewMode}
							on:itemClick={(e) => {
								const { item, index } = e.detail;
								if (!isCheckMode && !isDeleteMode) {
									openSearchResult(item);
								}
							}}
							on:itemDoubleClick={(e) => {
								const { item } = e.detail;
								openSearchResult(item);
							}}
							on:itemSelect={(e) => {
								const { item, multiSelect } = e.detail;
								if (isCheckMode) {
									toggleItemSelection(item.path);
								}
							}}
							on:itemContextMenu={(e) => {
								const { event, item } = e.detail;
								showContextMenu(event, item);
							}}
							on:deleteItem={(e) => {
								deleteItem(e.detail.item.path);
							}}
							on:selectionChange={(e) => {
								selectedItems = new Set(e.detail.selectedItems);
							}}
							on:openFolderAsBook={(e) => {
								openFolderAsBook(e.detail.item);
							}}
						/>
					</div>
				</div>
			{:else if items.length === 0}
				<div class="flex flex-1 items-center justify-center">
					<div class="text-center">
						<FolderOpen class="mx-auto mb-4 h-20 w-20 text-gray-300" />
						<p class="mb-2 text-lg font-medium text-gray-600">选择文件夹开始浏览</p>
						<p class="mb-6 text-sm text-gray-400">点击上方的"选择文件夹"按钮</p>
						<button
							onclick={selectFolder}
							class="rounded-lg bg-blue-500 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-600"
						>
							选择文件夹
						</button>
					</div>
				</div>
			{:else}
				<!-- 文件列表 -->
				<div class="min-h-0 flex-1 overflow-auto">
					<VirtualizedFileList
						{items}
						{currentPath}
						{thumbnails}
						{selectedIndex}
						{scrollToSelectedToken}
						}}
						on:itemContextMenu={(e) => {
							const { event, item } = e.detail;
							showContextMenu(event, item);
						}}
						on:deleteItem={(e) => {
							deleteItem(e.detail.item.path);
						}}
						on:selectionChange={(e) => {
							selectedItems = new Set(e.detail.selectedItems);
						}}
						on:selectedIndexChange={(e) => {
							fileBrowserStore.setSelectedIndex(e.detail.index);
						}}
						on:openFolderAsBook={(e) => {
							openFolderAsBook(e.detail.item);
						}}
					/>
				</div>
			{/if}
		</div>
	</div>
</div>
