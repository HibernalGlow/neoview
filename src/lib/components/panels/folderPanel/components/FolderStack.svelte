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
		isVirtualPath,
		getVirtualPathType
	} from '../stores/folderTabStore.svelte';
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
	import { folderRatingStore } from '$lib/stores/emm/folderRating';
	import { getDefaultRating } from '$lib/stores/emm/storage';
	import { invoke } from '@tauri-apps/api/core';
	import { favoriteTagStore, mixedGenderStore } from '$lib/stores/emm/favoriteTagStore.svelte';
	import { collectTagCountStore } from '$lib/stores/emm/collectTagCountStore';

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

	// 将路径转换为相对 key（用于缩略图存储）- 与老面板保持一致
	function toRelativeKey(path: string): string {
		return path.replace(/\\/g, '/');
	}

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

	// 排序函数 - skipFolderFirst 用于虚拟路径，让文件夹和文件平等排序
	function sortItems(items: FsItem[], field: string, order: string, skipFolderFirst = false): FsItem[] {
		// 随机排序特殊处理
		if (field === 'random') {
			const shuffled = [...items];
			for (let i = shuffled.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
			}
			return shuffled;
		}

		// rating 排序特殊处理
		// 规则：文件夹在前（除非 skipFolderFirst），无 rating 使用默认评分，用户自定义 rating 优先
		if (field === 'rating') {
			const defaultRating = getDefaultRating();
			const sorted = [...items].sort((a, b) => {
				// 文件夹优先（虚拟路径下跳过）
				if (!skipFolderFirst && a.isDir !== b.isDir) {
					return a.isDir ? -1 : 1;
				}

				// 获取有效评分（用户自定义优先，否则使用平均评分，无评分使用默认值）
				const ratingA = folderRatingStore.getEffectiveRating(a.path) ?? defaultRating;
				const ratingB = folderRatingStore.getEffectiveRating(b.path) ?? defaultRating;

				// 评分相同则按名称排序
				if (ratingA === ratingB) {
					return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
				}

				const comparison = ratingA - ratingB;
				return order === 'asc' ? comparison : -comparison;
			});
			return sorted;
		}

		// collectTagCount 排序特殊处理
		// 类似 rating 排序，从缓存中同步获取数据
		if (field === 'collectTagCount') {
			const sorted = [...items].sort((a, b) => {
				// 文件夹优先（虚拟路径下跳过）
				if (!skipFolderFirst && a.isDir !== b.isDir) {
					return a.isDir ? -1 : 1;
				}

				// 从缓存获取收藏标签匹配数
				const countA = collectTagCountStore.getCount(a.path);
				const countB = collectTagCountStore.getCount(b.path);

				// 计数相同则按名称排序
				if (countA === countB) {
					return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
				}

				const comparison = countA - countB;
				return order === 'asc' ? comparison : -comparison;
			});
			return sorted;
		}

		const sorted = [...items].sort((a, b) => {
			// 文件夹始终在前（虚拟路径下跳过）
			if (!skipFolderFirst && a.isDir !== b.isDir) {
				return a.isDir ? -1 : 1;
			}

			let comparison = 0;
			switch (field) {
				case 'name':
					comparison = a.name.localeCompare(b.name, undefined, {
						numeric: true,
						sensitivity: 'base'
					});
					break;
				case 'date':
					comparison = (a.modified || 0) - (b.modified || 0);
					break;
				case 'size':
					comparison = (a.size || 0) - (b.size || 0);
					break;
				case 'type': {
					const extA = a.name.split('.').pop()?.toLowerCase() || '';
					const extB = b.name.split('.').pop()?.toLowerCase() || '';
					comparison = extA.localeCompare(extB);
					break;
				}
			}

			return order === 'desc' ? -comparison : comparison;
		});
		return sorted;
	}

	// 过滤函数
	function filterItems(items: FsItem[], keyword: string): FsItem[] {
		if (!keyword.trim()) return items;
		const lowerKeyword = keyword.toLowerCase();
		return items.filter((item) => item.name.toLowerCase().includes(lowerKeyword));
	}

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
		result = sortItems(result, config.field, config.order, skipFolderFirst);
		return result;
	}

	// 初始化根层
	async function initRoot(path: string) {
		const layer = await createLayer(path);
		layers = [layer];
		activeIndex = 0;
		globalStore.setPath(path);
		globalStore.setItems(layer.items);
	}

	// 初始化根层（不添加历史记录，用于历史导航）
	async function initRootWithoutHistory(path: string) {
		console.log('[FolderStack] initRootWithoutHistory 开始, path:', path);
		const layer = await createLayer(path);
		console.log('[FolderStack] createLayer 完成, layer.path:', layer.path, 'items.length:', layer.items.length);
		layers = [layer];
		activeIndex = 0;
		// 使用 setPath 的第二个参数禁止添加历史记录
		globalStore.setPath(path, false);
		globalStore.setItems(layer.items);
		console.log('[FolderStack] initRootWithoutHistory 完成');
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

		// 过滤出需要缩略图的项目
		const itemsNeedingThumbnails = preloadItems.filter((item) => {
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
				'.nov',
				'.flv',
				'.webm',
				'.wmv',
				'.m4v',
				'.mpg',
				'.mpeg'
			];

			const ext = name.substring(name.lastIndexOf('.'));

			// 文件夹或支持的文件类型
			return (
				isDir || imageExts.includes(ext) || archiveExts.includes(ext) || videoExts.includes(ext)
			);
		});

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
			if (!item.isDir) {
				const nameLower = item.name.toLowerCase();
				const isArchive =
					nameLower.endsWith('.zip') ||
					nameLower.endsWith('.cbz') ||
					nameLower.endsWith('.rar') ||
					nameLower.endsWith('.cbr') ||
					nameLower.endsWith('.7z') ||
					nameLower.endsWith('.cb7');
					
				if (isArchive) {
					FileSystemAPI.preheatArchiveList(item.path);
				}
			}
		});
	}

	// 检查路径是否是另一个路径的子目录
	function isChildPath(childPath: string, parentPath: string): boolean {
		const normalizedChild = childPath.replace(/\\/g, '/').toLowerCase();
		const normalizedParent = parentPath.replace(/\\/g, '/').toLowerCase();
		return normalizedChild.startsWith(normalizedParent + '/');
	}

	// 推入新层（进入子目录）或跳转到新路径
	async function pushLayer(path: string) {
		if (isAnimating) return;

		isAnimating = true;

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

	// 获取父目录路径 - 统一使用 Windows 反斜杠格式
	function getParentPath(path: string): string | null {
		const normalized = path.replace(/\//g, '\\');
		const parts = normalized.split('\\').filter(Boolean);
		if (parts.length <= 1) return null; // 已经是根目录
		parts.pop();
		// Windows 盘符格式
		let parentPath = parts.join('\\');
		// 确保盘符后有反斜杠
		if (/^[a-zA-Z]:$/.test(parentPath)) {
			parentPath += '\\';
		}
		return parentPath;
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
				globalStore.setPath(prevLayer.path);
				// 同步 items 到 store（用于工具栏显示计数）
				globalStore.setItems(prevLayer.items);
			}

			setTimeout(() => {
				isAnimating = false;
			}, 300);

			return true;
		}

		// 如果没有上一层，尝试导航到父目录
		const currentLayer = layers[activeIndex];
		if (currentLayer) {
			const parentPath = getParentPath(currentLayer.path);
			if (parentPath) {
				isAnimating = true;

				// 创建父目录层并插入到栈的开头
				const parentLayer = await createLayer(parentPath);
				layers = [parentLayer, ...layers];
				// activeIndex 保持不变，因为新层插入到了开头
				// 但我们要切换到新插入的层
				activeIndex = 0;

				globalStore.setPath(parentPath);

				setTimeout(() => {
					isAnimating = false;
				}, 300);

				return true;
			}
		}

		return false;
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

		switch (cmd.type) {
			case 'init':
				if (cmd.path) initRoot(cmd.path);
				break;
			case 'push':
				if (cmd.path) pushLayer(cmd.path);
				break;
			case 'pop':
				popLayer();
				break;
			case 'goto':
				if (cmd.index !== undefined) goToLayer(cmd.index);
				break;
			case 'history':
				// 历史导航：优先在现有层中查找，找到则切换，否则重建
				if (cmd.path) {
					// 检查是否能在现有层中找到目标路径
					const targetIndex = layers.findIndex((l) => l.path === cmd.path);
					if (targetIndex !== -1 && targetIndex !== activeIndex) {
						// 找到了，直接切换到该层
						isAnimating = true;
						activeIndex = targetIndex;
						const layer = layers[targetIndex];
						globalStore.setPath(layer.path, false);
						globalStore.setItems(layer.items);
						setTimeout(() => {
							isAnimating = false;
						}, 300);
					} else if (targetIndex === -1) {
						// 没找到，需要重建
						initRootWithoutHistory(cmd.path);
					}
					// 如果 targetIndex === activeIndex，说明已经在目标层，不做任何操作
				}
				break;
		}

		// 清除命令
		navigationCommand.set(null);
	});

	// 每个页签有独立的 FolderStack 实例
	// 初始化时从 initialPath 加载
	// 使用 tabId 作为初始化标记的 key，确保每个标签页独立初始化
	let initializedTabId = '';
	let initializedPath = '';
	$effect(() => {
		console.log('[FolderStack] 初始化 $effect 触发, tabId:', tabId, 'initialPath:', initialPath, 'initializedTabId:', initializedTabId, 'initializedPath:', initializedPath, 'layers.length:', layers.length);
		
		// 如果 initialPath 为空，跳过初始化
		if (!initialPath) {
			console.log('[FolderStack] initialPath 为空，跳过初始化');
			return;
		}
		
		// 当 tabId 变化或 initialPath 变化时，重新加载
		const needsInit = initializedTabId !== tabId || initializedPath !== initialPath || layers.length === 0;
		if (!needsInit) {
			console.log('[FolderStack] 无需初始化，tabId 和 initialPath 未变化');
			return;
		}
		
		// 检查当前层是否已经是目标路径（避免重复加载）
		const currentLayerPath = layers[0]?.path;
		if (currentLayerPath === initialPath) {
			console.log('[FolderStack] 路径已匹配，跳过初始化:', initialPath);
			initializedTabId = tabId;
			initializedPath = initialPath;
			return;
		}
		
		initializedTabId = tabId;
		initializedPath = initialPath;
		console.log('[FolderStack] 开始初始化, 调用 initRootWithoutHistory:', initialPath);
		initRootWithoutHistory(initialPath);
	});

	// 尝试穿透文件夹（只有一个子文件时才穿透）
	async function tryPenetrateFolder(folderPath: string): Promise<FsItem | null> {
		try {
			const children = await FileSystemAPI.browseDirectory(folderPath);
			// 只有当文件夹只有一个子文件时才穿透
			if (children.length === 1 && !children[0].isDir) {
				console.log('[FolderStack] Penetrate mode: found single child file:', children[0].path);
				return children[0];
			}
		} catch (error) {
			console.debug('[FolderStack] 穿透模式读取目录失败:', folderPath, error);
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
						isCheckMode={effectiveMultiSelectMode}
						isDeleteMode={effectiveDeleteMode}
						selectedItems={$selectedItems}
						{viewMode}
						thumbnailWidthPercent={$thumbnailWidthPercent}
						bannerWidthPercent={$bannerWidthPercent}
						showFullPath={getVirtualPathType(layer.path) === 'search'}
						onItemSelect={(payload) => handleItemSelect(index, payload)}
						onItemDoubleClick={(payload) => handleItemDoubleClick(index, payload)}
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
