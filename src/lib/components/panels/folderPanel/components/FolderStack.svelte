<script lang="ts">
	/**
	 * FolderStack - 层叠式文件夹导航
	 * 参考 iOS UINavigationController 的设计
	 * 每个目录是一个独立的层，进入子目录推入新层，返回弹出当前层
	 * 上一层的 DOM 和状态保持不变，实现秒切换
	 */
	import { tick, onMount } from 'svelte';
	import type { FsItem } from '$lib/types';
	import type { Writable } from 'svelte/store';
	import * as FileSystemAPI from '$lib/api/filesystem';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import VirtualizedFileList from '$lib/components/panels/file/components/VirtualizedFileListV2.svelte';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { get } from 'svelte/store';
	import {
		folderTabActions,
		tabViewStyle,
		tabSelectedItems,
		tabMultiSelectMode,
		tabDeleteMode,
		tabSortConfig,
		tabSearchKeyword,
		tabPenetrateMode,
		tabOpenInNewTabMode,
		tabCurrentPath,
		activeTabId,
		tabThumbnailWidthPercent,
		tabBannerWidthPercent,
		tabItems,
		tabPendingFocusPath,
		isVirtualPath,
		getVirtualPathType
	} from '../stores/folderTabStore';
	import {
		loadVirtualPathData,
		subscribeVirtualPathData,
		removeVirtualPathItem,
		getVirtualPathConfig
	} from '../utils/virtualPathLoader';

	// 别名映射
	const viewStyle = tabViewStyle;
	const selectedItems = tabSelectedItems;
	const multiSelectMode = tabMultiSelectMode;
	const deleteMode = tabDeleteMode;
	const sortConfig = tabSortConfig;
	const searchKeyword = tabSearchKeyword;
	const penetrateMode = tabPenetrateMode;
	const openInNewTabMode = tabOpenInNewTabMode;
	const thumbnailWidthPercent = tabThumbnailWidthPercent;
	const bannerWidthPercent = tabBannerWidthPercent;
	import { Loader2, FolderOpen, AlertCircle } from '@lucide/svelte';
	import {
		getChainSelectMode,
		getChainAnchor,
		setChainAnchor
	} from '../stores/chainSelectStore.svelte';
	import { directoryTreeCache } from '../utils/directoryTreeCache';
	import { invoke } from '@tauri-apps/api/core';
	import { favoriteTagStore, mixedGenderStore } from '$lib/stores/emm/favoriteTagStore.svelte';
	import { collectTagCountStore } from '$lib/stores/emm/collectTagCountStore';
	import { sortItems, filterItems } from './FolderStack/sortingUtils';
import {
	normalizePathForCompare,
	isChildPath,
	getParentPath,
	getParentPaths,
	toRelativeKey,
	PRELOAD_PARENT_COUNT,
	IMAGE_EXTENSIONS,
	ARCHIVE_EXTENSIONS,
	VIDEO_EXTENSIONS,
	isArchiveFile,
	needsThumbnail
} from './FolderStack/folderStackUtils';

	export interface NavigationCommand {
		type: 'init' | 'push' | 'pop' | 'goto' | 'history';
		path?: string;
		index?: number;
	}

	interface Props {
		tabId: string;
		initialPath: string;
		navigationCommand: Writable<NavigationCommand | null>;
		onItemOpen?: (item: FsItem) => void;
		onItemDelete?: (item: FsItem) => void;
		onItemContextMenu?: (event: MouseEvent, item: FsItem) => void;
		onOpenFolderAsBook?: (item: FsItem) => void;
		onOpenInNewTab?: (item: FsItem) => void;
		/** 强制激活模式，用于虚拟路径实例，始终响应导航命令 */
		forceActive?: boolean;
		/** 跳过全局 store 更新，用于虚拟路径实例避免污染全局状态 */
		skipGlobalStore?: boolean;
		/** 覆盖全局 store 的状态值（用于虚拟实例独立状态）*/
		overrideMultiSelectMode?: boolean;
		overrideDeleteMode?: boolean;
		overrideViewStyle?: 'list' | 'content' | 'banner' | 'thumbnail';
		overrideSortConfig?: { field: string; order: 'asc' | 'desc' };
	}

	let {
		tabId,
		initialPath,
		navigationCommand,
		onItemOpen,
		onItemDelete,
		onItemContextMenu,
		onOpenFolderAsBook,
		onOpenInNewTab,
		forceActive = false,
		skipGlobalStore = false,
		overrideMultiSelectMode,
		overrideDeleteMode,
		overrideViewStyle,
		overrideSortConfig
	}: Props = $props();
	
	// 计算实际使用的状态值（支持覆盖）
	// 使用 $ 前缀订阅 store，确保响应式更新
	let effectiveMultiSelectMode = $derived(overrideMultiSelectMode !== undefined ? overrideMultiSelectMode : $multiSelectMode);
	let effectiveDeleteMode = $derived(overrideDeleteMode !== undefined ? overrideDeleteMode : $deleteMode);
	let effectiveViewStyle = $derived(overrideViewStyle !== undefined ? overrideViewStyle : $viewStyle);
	let effectiveSortConfig = $derived(overrideSortConfig !== undefined ? overrideSortConfig : $sortConfig);

	// 层叠数据结构
	interface FolderLayer {
		id: string;
		path: string;
		items: FsItem[];
		loading: boolean;
		error: string | null;
		selectedIndex: number;
		scrollTop: number;
	}

	// 层叠栈
	let layers = $state<FolderLayer[]>([]);

	// 当前活跃层索引
	let activeIndex = $state(0);
	
	// 排序配置直接使用全局 store（排序不需要隔离，用户可以在任何模式下更改排序）
	// 虚拟路径初始化时会设置默认排序，之后用户可以通过工具栏更改
	
	// 条件执行全局 store 操作（虚拟实例跳过）
	const globalStore = {
		setPath: (path: string, addToHistory = true) => { if (!skipGlobalStore) folderTabActions.setPath(path, addToHistory); },
		setItems: (items: FsItem[]) => { if (!skipGlobalStore) folderTabActions.setItems(items); },
		selectItem: (...args: Parameters<typeof folderTabActions.selectItem>) => { if (!skipGlobalStore) folderTabActions.selectItem(...args); },
		setSelectedItems: (items: Set<string>) => { if (!skipGlobalStore) folderTabActions.setSelectedItems(items); },
		selectRange: (...args: Parameters<typeof folderTabActions.selectRange>) => { if (!skipGlobalStore) folderTabActions.selectRange(...args); },
		deselectAll: () => { if (!skipGlobalStore) folderTabActions.deselectAll(); }
	};

	// 动画状态
	let isAnimating = $state(false);

	// 缩略图 Map - 使用 $state 并通过订阅更新
	let thumbnails = $state<Map<string, string>>(new Map());

	// 订阅 fileBrowserStore 的缩略图更新
	$effect(() => {
		const unsubscribe = fileBrowserStore.subscribe((state) => {
			thumbnails = state.thumbnails;
		});
		return unsubscribe;
	});

	// 订阅 collectTagCountStore，当缓存更新且当前排序为 collectTagCount 时触发重新渲染
	// 使用防抖机制避免频繁更新
	let collectTagVersion = $state(0);
	let collectTagDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const unsubscribe = collectTagCountStore.subscribe((cache) => {
			// 当缓存更新时，使用防抖触发重新渲染
			if (cache.lastUpdated > 0 && effectiveSortConfig.field === 'collectTagCount') {
				// 清除之前的定时器
				if (collectTagDebounceTimer) {
					clearTimeout(collectTagDebounceTimer);
				}
				// 300ms 防抖
				collectTagDebounceTimer = setTimeout(() => {
					collectTagVersion = cache.lastUpdated;
					collectTagDebounceTimer = null;
				}, 300);
			}
		});
		return () => {
			unsubscribe();
			if (collectTagDebounceTimer) {
				clearTimeout(collectTagDebounceTimer);
			}
		};
	});

	// 视图模式映射 - 支持 list/content/banner/thumbnail 四种模式
	let viewMode = $derived(effectiveViewStyle as 'list' | 'content' | 'banner' | 'thumbnail');

	// toRelativeKey 已从 folderStackUtils 导入

	// 设置缩略图回调
	onMount(() => {
		// 设置缩略图加载完成回调
		/*
	thumbnailManager.setOnThumbnailReady((path, dataUrl) => {
		const key = toRelativeKey(path);
		fileBrowserStore.addThumbnail(key, dataUrl);
	});
	*/
	});

	// 获取层的显示项（应用排序）
	// 注意：collectTagVersion 用于触发 collectTagCount 排序时的重新计算
	function getDisplayItems(layer: FolderLayer): FsItem[] {
		const config = effectiveSortConfig;
		// 依赖 collectTagVersion，当收藏标签缓存更新时触发重新排序
		const _version = collectTagVersion;
		let result = layer.items;
		// 搜索结果现在也通过 FolderStack 显示，不需要额外过滤
		// 虚拟路径下文件夹和文件平等排序
		const skipFolderFirst = isVirtualPath(layer.path);
		// 传入 layer.path 以支持随机排序种子记忆
		result = sortItems(result, config.field, config.order, skipFolderFirst, layer.path);
		return result;
	}

	// 最后导航的路径（用于防止 $effect 重复处理）
	// 使用 $state 确保响应式更新
	let lastNavigatedPath = $state('');
	
	// 是否正在处理导航命令（用于防止 $effect 和 navigationCommand 同时处理）
	let isProcessingNavCommand = $state(false);
	
	// 更新最后导航的路径
	function updateLastNavigatedPath(path: string) {
		lastNavigatedPath = path;
	}

	// 初始化根层
	async function initRoot(path: string) {
		// 更新最后导航路径，防止 $effect 重复处理
		updateLastNavigatedPath(path);
		const layer = await createLayer(path);
		layers = [layer];
		activeIndex = 0;
		globalStore.setPath(path);
		globalStore.setItems(layer.items);
	}

	// 初始化根层（不添加历史记录，用于历史导航）
	async function initRootWithoutHistory(path: string) {
		// 更新最后导航路径，防止 $effect 重复处理
		updateLastNavigatedPath(path);
		const layer = await createLayer(path);
		layers = [layer];
		activeIndex = 0;
		// 使用 setPath 的第二个参数禁止添加历史记录
		globalStore.setPath(path, false);
		globalStore.setItems(layer.items);
	}

	// 虚拟路径订阅清理函数
	let virtualPathUnsubscribe: (() => void) | null = null;

	// 创建新层
	async function createLayer(path: string): Promise<FolderLayer> {
		const layerId = crypto.randomUUID();
		const layer: FolderLayer = {
			id: layerId,
			path,
			items: [],
			loading: true,
			error: null,
			selectedIndex: -1,
			scrollTop: 0
		};

		try {
			// 检查是否为虚拟路径（包括书签、历史、搜索）
			if (isVirtualPath(path)) {
				// 注意：不再强制设置排序配置，让用户可以自由排序
				
				// 虚拟路径：从书签/历史/搜索 store 加载数据
				const items = loadVirtualPathData(path);
				layer.items = items;
				layer.loading = false;

				// 订阅数据变化
				if (virtualPathUnsubscribe) {
					virtualPathUnsubscribe();
				}
				virtualPathUnsubscribe = subscribeVirtualPathData(path, (newItems) => {
					// 更新当前层的数据
					const currentLayer = layers.find((l) => l.id === layerId);
					if (currentLayer) {
						currentLayer.items = newItems;
						globalStore.setItems(newItems);
						// 加载缩略图
						loadThumbnailsForLayer(newItems, path);
					}
				});

				// 加载缩略图
				loadThumbnailsForLayer(items, path);

				// 异步加载收藏标签匹配数（用于排序）
				loadCollectTagCountsForLayer(layer);
			} else {
				// 正常文件系统路径
				// 清理虚拟路径订阅
				if (virtualPathUnsubscribe) {
					virtualPathUnsubscribe();
					virtualPathUnsubscribe = null;
				}

				// 使用全局目录树缓存
				const items = await directoryTreeCache.getDirectory(path);
				layer.items = items;
				layer.loading = false;

				// 加载缩略图
				loadThumbnailsForLayer(items, path);

				// 加载收藏标签匹配数（用于排序）
				loadCollectTagCountsForLayer(layer);
			}
		} catch (err) {
			layer.error = err instanceof Error ? err.message : String(err);
			layer.loading = false;
		}

		return layer;
	}

	// 加载收藏标签匹配数（已废弃，保留函数签名以兼容）
	// 收藏标签数现在由 FileItemCard 在渲染时从 EMM 元数据计算，并更新到 collectTagCountStore
	// 排序时从 collectTagCountStore 同步读取
	async function loadCollectTagCountsForLayer(_layer: FolderLayer) {
		// 不再需要从后端加载，FileItemCard 会在渲染时计算并更新缓存
		// collectTagCountStore 的更新会触发重新渲染（通过 collectTagVersion）
	}

	// 加载缩略图 - 【优化】只预加载前10项，其余由 VirtualizedFileList 可见范围加载
	async function loadThumbnailsForLayer(items: FsItem[], path: string) {
		// 虚拟路径不设置当前目录
		if (!isVirtualPath(path)) {
			// 设置当前目录（用于优先级判断）
			thumbnailManager.setCurrentDirectory(path);
		}

		// 【优化】只预加载前10项，避免大量并发请求，减轻大目录压力
		const PRELOAD_COUNT = 10;
		const preloadItems = items.slice(0, PRELOAD_COUNT);

		// 过滤出需要缩略图的项目（使用导入的 needsThumbnail 函数）
		const itemsNeedingThumbnails = preloadItems.filter((item) =>
			needsThumbnail(item.name, item.isDir)
		);

		// 预加载数据库索引（只预加载前30项）
		const paths = itemsNeedingThumbnails.map((item) => item.path);
		thumbnailManager.preloadDbIndex(paths).catch((err) => {
			console.debug('预加载数据库索引失败:', err);
		});

		// 【优化】使用 normal 优先级而非 immediate，减少并发压力
		itemsNeedingThumbnails.forEach((item, index) => {
			// V3: getThumbnail 只需要 path 和 currentPath 参数
			// 优先级和压缩包判断已由后端自动处理
			thumbnailManager.getThumbnail(item.path, path);

			// 【优化】预热压缩包文件列表，加速切书
			if (!item.isDir && isArchiveFile(item.name)) {
				FileSystemAPI.preheatArchiveList(item.path);
			}
		});
	}



	// ============ 历史导航辅助函数 ============

	// 使用从 folderStackUtils 导入的 normalizePathForCompare 作为 normalizePath
	const normalizePath = normalizePathForCompare;

	/**
	 * 查找目标路径在 layers 中的父层索引
	 * 如果目标路径是某个现有层的子目录，返回该层的索引
	 */
	function findParentLayerIndex(targetPath: string): number {
		const normalizedTarget = normalizePath(targetPath);
		
		// 从后往前遍历，找到最近的父层
		for (let i = layers.length - 1; i >= 0; i--) {
			const layerPath = normalizePath(layers[i].path);
			// 检查目标路径是否以该层路径开头（即该层是目标的父目录）
			if (normalizedTarget.startsWith(layerPath + '/')) {
				return i;
			}
		}
		
		return -1;
	}

	/**
	 * 切换到指定层（不重新加载数据）
	 * @param index 目标层索引
	 */
	function switchToLayer(index: number): void {
		if (index < 0 || index >= layers.length) return;
		if (index === activeIndex) return; // 已经在目标层
		
		isAnimating = true;
		activeIndex = index;
		const layer = layers[index];
		// 更新最后导航路径，防止 $effect 重复处理
		updateLastNavigatedPath(layer.path);
		globalStore.setPath(layer.path, false);
		globalStore.setItems(layer.items);
		
		setTimeout(() => {
			isAnimating = false;
		}, 300);
	}

	/**
	 * 处理历史导航命令
	 * 智能地保留或重建层叠栈
	 * @param targetPath 目标路径
	 */
	async function handleHistoryNavigation(targetPath: string): Promise<void> {
		// 更新最后导航路径，防止 $effect 重复处理
		updateLastNavigatedPath(targetPath);
		
		// 1. 在现有 layers 中查找目标路径（精确匹配）
		const targetIndex = layers.findIndex(l => normalizePath(l.path) === normalizePath(targetPath));
		
		if (targetIndex !== -1) {
			// 找到了，直接切换到该层，保留整个 stack
			switchToLayer(targetIndex);
			return;
		}
		
		// 2. 检查目标路径是否是某个现有层的子目录
		// 如果是，说明用户可能是从子目录后退到父目录，但父目录不在 layers 中
		// 这种情况需要重建，但可以保留目标路径之上的层
		const parentLayerIndex = findParentLayerIndex(targetPath);
		if (parentLayerIndex !== -1) {
			// 目标路径是某个层的子目录，截断到该层之后，然后加载目标路径
			layers = layers.slice(0, parentLayerIndex + 1);
			// 在父层之后推入目标路径
			const newLayer = await createLayer(targetPath);
			layers = [...layers, newLayer];
			activeIndex = layers.length - 1;
			globalStore.setPath(targetPath, false);
			globalStore.setItems(newLayer.items);
			return;
		}
		
		// 3. 检查是否有层是目标路径的子目录
		// 如果是，说明用户后退到了更上层的目录
		const normalizedTarget = normalizePath(targetPath);
		let childLayerIndex = -1;
		for (let i = 0; i < layers.length; i++) {
			const layerPath = normalizePath(layers[i].path);
			if (layerPath.startsWith(normalizedTarget + '/')) {
				childLayerIndex = i;
				break; // 找到第一个子层
			}
		}
		
		if (childLayerIndex !== -1) {
			// 目标路径是某个层的父目录，在该层之前插入目标路径
			
			// 获取多层父目录路径（包括目标路径的父目录）
			const parentPaths = getParentPaths(targetPath, PRELOAD_PARENT_COUNT - 1);
			const allPaths = [targetPath, ...parentPaths];
			
			// 并行加载所有层
			const newLayers = await Promise.all(
				allPaths.map(p => createLayer(p))
			);
			
			// 将所有层插入到栈的开头（从远到近的顺序）
			layers = [...newLayers.reverse(), ...layers.slice(childLayerIndex)];
			// 切换到目标路径层（即最后一个新加载的层）
			activeIndex = newLayers.length - 1;
			globalStore.setPath(targetPath, false);
			globalStore.setItems(newLayers[0].items);
			return;
		}
		
		// 4. 目标路径与现有层完全无关，需要完全重建
		await initRootWithoutHistory(targetPath);
	}

	// 推入新层（进入子目录）或跳转到新路径
	async function pushLayer(path: string) {
		if (isAnimating) return;

		isAnimating = true;
		
		// 更新最后导航路径，防止 $effect 重复处理
		updateLastNavigatedPath(path);

		// 获取当前层的路径
		const currentLayer = layers[activeIndex];
		const currentPath = currentLayer?.path || '';

		// 判断目标路径是否是当前路径的子目录
		const isChild = currentPath && isChildPath(path, currentPath);

		if (isChild) {
			// 正常的子目录导航：推入新层
			const newLayer = await createLayer(path);
			layers = [...layers.slice(0, activeIndex + 1), newLayer];
			await tick();
			activeIndex = layers.length - 1;
		} else {
			// 跳转到不相关的路径：重新初始化栈
			const newLayer = await createLayer(path);
			layers = [newLayer];
			activeIndex = 0;
		}

		// 更新 store 中的路径
		globalStore.setPath(path);
		// 同步 items 到 store（用于工具栏显示计数）
		const activeLayer = layers[activeIndex];
		if (activeLayer) {
			globalStore.setItems(activeLayer.items);
		}

		setTimeout(() => {
			isAnimating = false;
		}, 300);
	}





	// 弹出当前层（返回上级）
	async function popLayer(): Promise<boolean> {
		if (isAnimating) return false;

		// 如果有上一层，直接切换
		if (activeIndex > 0) {
			isAnimating = true;
			activeIndex = activeIndex - 1;

			const prevLayer = layers[activeIndex];
			if (prevLayer) {
				// 更新最后导航路径，防止 $effect 重复处理
				updateLastNavigatedPath(prevLayer.path);
				globalStore.setPath(prevLayer.path);
				// 同步 items 到 store（用于工具栏显示计数）
				globalStore.setItems(prevLayer.items);
			}

			setTimeout(() => {
				isAnimating = false;
			}, 300);

			// 异步预加载更多父目录（不阻塞当前操作）
			preloadParentLayers();

			return true;
		}

		// 如果没有上一层，尝试导航到父目录
		const currentLayer = layers[activeIndex];
		if (currentLayer) {
			const parentPath = getParentPath(currentLayer.path);
			if (parentPath) {
				isAnimating = true;
				
				// 更新最后导航路径，防止 $effect 重复处理
				updateLastNavigatedPath(parentPath);

				// 获取多层父目录路径（包括当前要导航的父目录）
				const parentPaths = getParentPaths(currentLayer.path, PRELOAD_PARENT_COUNT);
				
				// 创建所有父目录层（并行加载）
				const parentLayers = await Promise.all(
					parentPaths.map(p => createLayer(p))
				);
				
				// 将所有父目录层插入到栈的开头（从远到近的顺序）
				layers = [...parentLayers.reverse(), ...layers];
				// 切换到最近的父目录（即第一个加载的）
				activeIndex = parentLayers.length - 1;

				globalStore.setPath(parentPath);

				setTimeout(() => {
					isAnimating = false;
				}, 300);

				return true;
			}
		}

		return false;
	}

	/**
	 * 异步预加载父目录层
	 * 在向上导航后调用，确保后续向上操作不需要等待加载
	 */
	async function preloadParentLayers(): Promise<void> {
		// 获取当前最顶层的路径
		const topLayer = layers[0];
		if (!topLayer) return;
		
		// 检查是否需要预加载
		const parentPath = getParentPath(topLayer.path);
		if (!parentPath) return; // 已经是根目录
		
		// 检查父目录是否已经在 layers 中
		const normalizedParent = normalizePath(parentPath);
		const alreadyLoaded = layers.some(l => normalizePath(l.path) === normalizedParent);
		if (alreadyLoaded) return;
		
		// 异步加载父目录（不阻塞 UI）
		try {
			const parentPaths = getParentPaths(topLayer.path, PRELOAD_PARENT_COUNT);
			// 过滤掉已经加载的路径
			const pathsToLoad = parentPaths.filter(p => 
				!layers.some(l => normalizePath(l.path) === normalizePath(p))
			);
			
			if (pathsToLoad.length === 0) return;
			
			// 并行加载
			const newLayers = await Promise.all(
				pathsToLoad.map(p => createLayer(p))
			);
			
			// 插入到栈的开头（从远到近的顺序）
			layers = [...newLayers.reverse(), ...layers];
			// 调整 activeIndex（因为在开头插入了新层）
			activeIndex = activeIndex + newLayers.length;
		} catch (err) {
			// 预加载失败不影响主流程
		}
	}

	// 跳转到指定层
	function goToLayer(index: number) {
		if (isAnimating || index < 0 || index >= layers.length) return;

		isAnimating = true;
		activeIndex = index;

		const layer = layers[index];
		if (layer) {
			globalStore.setPath(layer.path);
			// 同步 items 到 store（用于工具栏显示计数）
			globalStore.setItems(layer.items);
		}

		setTimeout(() => {
			isAnimating = false;
		}, 300);
	}

	// 处理删除项目（先从层叠栈移除，再调用外部删除处理）
	function handleDeleteItem(layerIndex: number, item: FsItem) {
		const currentLayer = layers[layerIndex];

		// 检查是否为虚拟路径
		if (currentLayer && isVirtualPath(currentLayer.path)) {
			// 虚拟路径：从 store 中删除
			removeVirtualPathItem(currentLayer.path, item.path);
			return;
		}

		// 立即从层叠栈中移除（乐观更新）
		layers = layers.map((layer, idx) => {
			if (idx === layerIndex) {
				return {
					...layer,
					items: layer.items.filter((i) => i.path !== item.path)
				};
			}
			return layer;
		});

		// 同步到 store
		if (currentLayer) {
			globalStore.setItems(currentLayer.items);
		}

		// 调用外部删除处理
		onItemDelete?.(item);
	}

	// 监听导航命令（只有当前活动页签才响应，或强制激活模式）
	$effect(() => {
		const cmd = $navigationCommand;
		if (!cmd) return;

		// 强制激活模式始终响应，否则只有活动页签才响应导航命令
		if (!forceActive) {
			const currentActiveTabId = get(activeTabId);
			if (tabId !== currentActiveTabId) return;
		}

		// 设置标志，防止 initialPath 的 $effect 同时处理
		isProcessingNavCommand = true;

		// 异步处理导航命令
		(async () => {
			switch (cmd.type) {
				case 'init':
					if (cmd.path) await initRoot(cmd.path);
					break;
				case 'push':
					if (cmd.path) await pushLayer(cmd.path);
					break;
				case 'pop':
					await popLayer();
					break;
				case 'goto':
					if (cmd.index !== undefined) goToLayer(cmd.index);
					break;
				case 'history':
					// 历史导航：使用智能导航函数，尽可能保留层叠栈
					if (cmd.path) {
						await handleHistoryNavigation(cmd.path);
					}
					break;
			}
			
			// 导航完成后重置标志
			isProcessingNavCommand = false;
		})();

		// 清除命令
		navigationCommand.set(null);
	});

	// 每个页签有独立的 FolderStack 实例
	// 初始化时从 initialPath 加载
	// 注意：导航操作（pushLayer, handleHistoryNavigation 等）会更新 lastNavigatedPath
	// $effect 只处理首次初始化和标签页切换，不处理同标签页内的历史导航
	$effect(() => {
		const targetPath = initialPath;
		
		// 如果 initialPath 为空，跳过
		if (!targetPath) {
			return;
		}
		
		// 如果正在处理导航命令，跳过（让 navigationCommand 的 $effect 处理）
		if (isProcessingNavCommand) {
			return;
		}
		
		// 如果路径已经被导航函数处理过，跳过
		if (normalizePath(lastNavigatedPath) === normalizePath(targetPath)) {
			return;
		}
		
		// 情况1：首次初始化（layers 为空）
		if (layers.length === 0) {
			lastNavigatedPath = targetPath;
			initRootWithoutHistory(targetPath);
			return;
		}
		
		// 情况2：检查当前活动层是否已经是目标路径
		const currentActivePath = layers[activeIndex]?.path;
		if (currentActivePath && normalizePath(currentActivePath) === normalizePath(targetPath)) {
			lastNavigatedPath = targetPath;
			return;
		}
		
		// 情况3：检查 layers 中是否包含目标路径（用于标签页切换时恢复状态）
		const targetLayerIndex = layers.findIndex(l => normalizePath(l.path) === normalizePath(targetPath));
		if (targetLayerIndex !== -1) {
			lastNavigatedPath = targetPath;
			switchToLayer(targetLayerIndex);
			return;
		}
		
		// 情况4：initialPath 变化且不在 layers 中
		// 这通常发生在标签页切换或外部导航请求时
		// 同标签页内的历史导航应该通过 navigationCommand 处理，这里只做兜底
		// 为了避免与 navigationCommand 冲突，延迟执行
		const pathToHandle = targetPath;
		setTimeout(() => {
			// 再次检查是否已被处理
			if (normalizePath(lastNavigatedPath) === normalizePath(pathToHandle)) {
				return;
			}
			// 检查当前活动层是否已经是目标路径
			const currentPath = layers[activeIndex]?.path;
			if (currentPath && normalizePath(currentPath) === normalizePath(pathToHandle)) {
				lastNavigatedPath = pathToHandle;
				return;
			}
			lastNavigatedPath = pathToHandle;
			handleHistoryNavigation(pathToHandle);
		}, 50);
	});

	// 滚动到选中项的 token（用于触发 VirtualizedFileList 滚动）
	let scrollToSelectedToken = $state(0);

	// 监听 pendingFocusPath，找到对应项目后设置 selectedIndex 并滚动
	$effect(() => {
		const focusPath = $tabPendingFocusPath;
		if (!focusPath) return;
		
		// 只有当前活动页签才处理
		const currentActiveTabId = get(activeTabId);
		if (tabId !== currentActiveTabId) return;
		
		// 在当前层的 items 中查找目标路径
		const currentLayer = layers[activeIndex];
		if (!currentLayer || currentLayer.loading) return;
		
		// 获取排序后的显示项目
		const displayItems = getDisplayItems(currentLayer);
		const targetIndex = displayItems.findIndex(item => item.path === focusPath);
		
		if (targetIndex !== -1) {
			// 设置 selectedIndex
			layers[activeIndex].selectedIndex = targetIndex;
			// 同时添加到选中列表（高亮显示）
			globalStore.selectItem(focusPath, false, targetIndex);
			// 延迟触发滚动，确保虚拟列表完全渲染后再滚动居中
			setTimeout(() => {
				scrollToSelectedToken++;
			}, 250);
		}
		
		// 清除 pendingFocusPath
		folderTabActions.clearPendingFocusPath();
	});

	// 尝试穿透文件夹（只有一个子文件时才穿透）
	async function tryPenetrateFolder(folderPath: string): Promise<FsItem | null> {
		try {
			const children = await FileSystemAPI.browseDirectory(folderPath);
			// 只有当文件夹只有一个子文件时才穿透
			if (children.length === 1 && !children[0].isDir) {
				return children[0];
			}
		} catch (error) {
			// 穿透模式读取目录失败，静默处理
		}
		return null;
	}

	// 处理项选中（单击）- 参考老面板的实现
	async function handleItemSelect(
		layerIndex: number,
		payload: { item: FsItem; index: number; multiSelect: boolean; shiftKey?: boolean }
	) {
		console.log(
			'[FolderStack] handleItemSelect 被调用 - layerIndex:',
			layerIndex,
			'activeIndex:',
			activeIndex,
			'item:',
			payload.item.name
		);
		if (layerIndex !== activeIndex) return;

		// 更新层的选中索引
		layers[layerIndex].selectedIndex = payload.index;

		// 获取当前层的显示项目列表（用于范围选择）
		const displayItems = getDisplayItems(layers[layerIndex]);

		// 检查链选模式 - 直接使用函数获取当前页签的链选状态
		const isChainSelectMode = getChainSelectMode(tabId);
		console.log(
			'[FolderStack] handleItemSelect - chainSelectMode:',
			isChainSelectMode,
			'multiSelectMode:',
			$multiSelectMode,
			'payload.multiSelect:',
			payload.multiSelect,
			'tabId:',
			tabId
		);
		if (isChainSelectMode && ($multiSelectMode || payload.multiSelect)) {
			let anchor = getChainAnchor(tabId);
			console.log('[FolderStack] 链选模式激活 - anchor:', anchor, 'currentIndex:', payload.index);
			
			// 如果没有锚点，尝试从已选中项中找到最近的一个作为锚点
			if (anchor === -1) {
				const currentSelected = get(tabSelectedItems);
				if (currentSelected.size > 0) {
					// 找到离当前点击位置最近的已选中项作为锚点
					let nearestIndex = -1;
					let nearestDistance = Infinity;
					for (let i = 0; i < displayItems.length; i++) {
						if (currentSelected.has(displayItems[i].path)) {
							const distance = Math.abs(i - payload.index);
							if (distance < nearestDistance) {
								nearestDistance = distance;
								nearestIndex = i;
							}
						}
					}
					if (nearestIndex !== -1) {
						anchor = nearestIndex;
						console.log('[FolderStack] 从已选中项设置锚点为:', anchor);
					}
				}
			}
			
			if (anchor === -1 || anchor === payload.index) {
				// 没有锚点，或点击的是锚点本身：切换该项的选中状态并设置为新锚点
				console.log('[FolderStack] 切换选中状态并设置锚点为:', payload.index);
				globalStore.selectItem(payload.item.path, true, payload.index);
				setChainAnchor(tabId, payload.index);
			} else {
				// 有锚点且点击不同位置，选中从锚点到当前位置的所有项目
				const startIndex = Math.min(anchor, payload.index);
				const endIndex = Math.max(anchor, payload.index);
				console.log('[FolderStack] 链选范围:', startIndex, '->', endIndex);

				// 批量收集需要选中的路径
				const currentSelected = get(tabSelectedItems);
				const newSelected = new Set(currentSelected);
				for (let i = startIndex; i <= endIndex; i++) {
					if (i >= 0 && i < displayItems.length) {
						newSelected.add(displayItems[i].path);
					}
				}
				// 一次性设置所有选中项
				globalStore.setSelectedItems(newSelected);
				console.log('[FolderStack] 批量选中完成，共选中:', newSelected.size, '项');

				// 更新锚点为当前位置，方便继续链选
				setChainAnchor(tabId, payload.index);
			}
			return;
		}

		// 检查是否需要范围选择（勾选模式 + Shift 键）
		if (($multiSelectMode || payload.multiSelect) && payload.shiftKey) {
			// Shift + 点击：范围选择
			globalStore.selectRange(payload.index, displayItems);
		} else if (payload.multiSelect || $multiSelectMode) {
			// 多选模式：切换选中状态并更新锚点，不导航
			globalStore.selectItem(payload.item.path, true, payload.index);
		} else {
			if (payload.item.isDir) {
				// 文件夹：进入目录，不加入选中列表
				
				// 虚拟实例（历史/书签面板）：文件夹应该在 folder 面板打开，通过 onItemOpen 回调处理
				if (skipGlobalStore) {
					onItemOpen?.(payload.item);
					return;
				}
				
				// 检查穿透模式
				if ($penetrateMode) {
					const penetrated = await tryPenetrateFolder(payload.item.path);
					if (penetrated) {
						// 穿透成功，打开子文件
						onItemOpen?.(penetrated);
						return;
					}
					// 穿透失败，检查是否在新标签页打开
					if ($openInNewTabMode) {
						// 穿透失败时在新标签页打开文件夹
						onOpenInNewTab?.(payload.item);
						return;
					}
				}
				// 进入目录前清除选中状态
				globalStore.deselectAll();
				// 正常进入目录
				pushLayer(payload.item.path);
			} else {
				// 文件：加入选中列表并打开
				globalStore.selectItem(payload.item.path);
				onItemOpen?.(payload.item);
			}
		}
	}

	// 处理项双击
	function handleItemDoubleClick(layerIndex: number, payload: { item: FsItem; index: number }) {
		if (layerIndex !== activeIndex) return;

		// 双击也打开文件（与单击行为一致）
		if (!payload.item.isDir) {
			onItemOpen?.(payload.item);
		}
	}

	// 处理选中索引变化
	function handleSelectedIndexChange(layerIndex: number, payload: { index: number }) {
		if (layerIndex !== activeIndex) return;
		layers[layerIndex].selectedIndex = payload.index;
	}

	// 处理右键菜单
	function handleItemContextMenu(layerIndex: number, payload: { event: MouseEvent; item: FsItem }) {
		if (layerIndex !== activeIndex) return;
		onItemContextMenu?.(payload.event, payload.item);
	}

	// 处理作为书籍打开文件夹
	function handleOpenFolderAsBook(layerIndex: number, item: FsItem) {
		if (layerIndex !== activeIndex) return;
		if (item.isDir) {
			onOpenFolderAsBook?.(item);
		}
	}

	// 处理双击空白处（返回上级/后退）
	async function handleEmptyDoubleClick(layerIndex: number) {
		if (layerIndex !== activeIndex) return;
		
		// 虚拟路径（书签/历史）模式下不响应
		const currentLayer = layers[layerIndex];
		if (currentLayer && isVirtualPath(currentLayer.path)) return;
		
		// 获取用户设置的双击空白处行为
		const state = get(fileBrowserStore);
		const action = state.doubleClickEmptyAction;
		
		if (action === 'none') return;
		
		if (action === 'goUp') {
			// 返回上级目录
			await popLayer();
		} else if (action === 'goBack') {
			// 后退（与工具栏后退按钮行为一致）
			await popLayer();
		}
	}

	// 处理单击空白处（返回上级/后退）
	async function handleEmptySingleClick(layerIndex: number) {
		if (layerIndex !== activeIndex) return;
		
		// 虚拟路径（书签/历史）模式下不响应
		const currentLayer = layers[layerIndex];
		if (currentLayer && isVirtualPath(currentLayer.path)) return;
		
		// 获取用户设置的单击空白处行为
		const state = get(fileBrowserStore);
		const action = state.singleClickEmptyAction;
		
		if (action === 'none') return;
		
		if (action === 'goUp') {
			// 返回上级目录
			await popLayer();
		} else if (action === 'goBack') {
			// 后退
			await popLayer();
		}
	}

	// 处理返回按钮点击
	async function handleBackButtonClick(layerIndex: number) {
		if (layerIndex !== activeIndex) return;
		
		// 虚拟路径（书签/历史）模式下不响应
		const currentLayer = layers[layerIndex];
		if (currentLayer && isVirtualPath(currentLayer.path)) return;
		
		await popLayer();
	}

	// 是否显示空白区域返回按钮（虚拟路径模式下不显示）
	let showBackButtonValue = $state(false);
	$effect(() => {
		const unsubscribe = fileBrowserStore.subscribe((state) => {
			showBackButtonValue = state.showEmptyAreaBackButton;
		});
		return unsubscribe;
	});
	
	// 计算当前层是否应该显示返回按钮
	function shouldShowBackButton(layerPath: string): boolean {
		// 虚拟路径（书签/历史）模式下不显示
		if (isVirtualPath(layerPath)) return false;
		return showBackButtonValue;
	}
</script>

<div class="folder-stack relative h-full w-full overflow-hidden">
	{#each layers as layer, index (layer.id)}
		<div
			class="folder-layer bg-muted/10 absolute inset-0 transition-transform duration-300 ease-out"
			class:pointer-events-none={index !== activeIndex}
			style="transform: translateX({(index - activeIndex) * 100}%); z-index: {index};"
		>
			{#if layer.loading}
				<!-- 加载状态 -->
				<div class="flex h-full items-center justify-center">
					<Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
				</div>
			{:else if layer.error}
				<!-- 错误状态 -->
				<div class="flex h-full flex-col items-center justify-center gap-2 p-4">
					<AlertCircle class="text-destructive h-8 w-8" />
					<p class="text-destructive text-sm">{layer.error}</p>
				</div>
			{:else}
				{@const displayItems = getDisplayItems(layer)}
				{#if displayItems.length === 0}
					<!-- 空状态（过滤后无结果） -->
					<div class="flex h-full flex-col items-center justify-center gap-2 p-4">
						<FolderOpen class="text-muted-foreground h-12 w-12" />
						<p class="text-muted-foreground text-sm">文件夹为空</p>
					</div>
				{:else}
					<!-- 虚拟化列表 -->
					<VirtualizedFileList
						items={displayItems}
						currentPath={layer.path}
						{thumbnails}
						selectedIndex={layer.selectedIndex}
						{scrollToSelectedToken}
						isCheckMode={effectiveMultiSelectMode}
						isDeleteMode={effectiveDeleteMode}
						selectedItems={$selectedItems}
						{viewMode}
						thumbnailWidthPercent={$thumbnailWidthPercent}
						bannerWidthPercent={$bannerWidthPercent}
						showFullPath={getVirtualPathType(layer.path) === 'search'}
						showBackButton={shouldShowBackButton(layer.path)}
						onItemSelect={(payload) => handleItemSelect(index, payload)}
						onItemDoubleClick={(payload) => handleItemDoubleClick(index, payload)}
						onEmptyDoubleClick={() => handleEmptyDoubleClick(index)}
						onEmptySingleClick={() => handleEmptySingleClick(index)}
						onBackButtonClick={() => handleBackButtonClick(index)}
						onSelectedIndexChange={(payload) => handleSelectedIndexChange(index, payload)}
						onSelectionChange={(payload) =>
							globalStore.setSelectedItems(payload.selectedItems)}
						on:itemContextMenu={(e) => handleItemContextMenu(index, e.detail)}
						on:openFolderAsBook={(e) => handleOpenFolderAsBook(index, e.detail.item)}
						on:openInNewTab={(e) => {
							if (index === activeIndex && e.detail.item.isDir) {
								onOpenInNewTab?.(e.detail.item);
							}
						}}
						on:deleteItem={(e) => handleDeleteItem(index, e.detail.item)}
					/>
				{/if}
			{/if}
		</div>
	{/each}
</div>

<style>
	.folder-stack {
		perspective: 1000px;
		/* CSS Containment 优化 */
		contain: layout style;
	}

	.folder-layer {
		will-change: transform;
		backface-visibility: hidden;
		/* CSS Containment 优化 - 每层独立隔离 */
		contain: layout style paint;
	}
</style>
