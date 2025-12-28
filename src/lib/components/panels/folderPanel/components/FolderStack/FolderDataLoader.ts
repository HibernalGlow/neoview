/**
 * FolderStack 数据加载模块
 * 处理目录加载、虚拟路径、缩略图预加载
 */

import type { FsItem } from '$lib/types';
import type { FolderLayer } from './FolderStackState.svelte';
import * as FileSystemAPI from '$lib/api/filesystem';
import { thumbnailManager } from '$lib/utils/thumbnailManager';
import { directoryTreeCache } from '../../utils/directoryTreeCache';
import { isVirtualPath } from '../../stores/folderTabStore';
import {
	loadVirtualPathData,
	subscribeVirtualPathData
} from '../../utils/virtualPathLoader';
import { isArchiveFile, needsThumbnail } from './folderStackUtils';

/** 缩略图预加载配置 */
const THUMBNAIL_PRELOAD_COUNT = 10;

/**
 * 加载目录缩略图
 * 只预加载前10项，其余由 VirtualizedFileList 按需加载
 */
export function loadThumbnailsForLayer(items: FsItem[], path: string): void {
	// 虚拟路径不设置当前目录
	if (!isVirtualPath(path)) {
		thumbnailManager.setCurrentDirectory(path);
	}

	const preloadItems = items.slice(0, THUMBNAIL_PRELOAD_COUNT);
	const itemsNeedingThumbnails = preloadItems.filter(item =>
		needsThumbnail(item.name, item.isDir)
	);

	// 预加载数据库索引
	const paths = itemsNeedingThumbnails.map(item => item.path);
	thumbnailManager.preloadDbIndex(paths).catch(err => {
		console.debug('预加载数据库索引失败:', err);
	});

	// 请求缩略图并预热压缩包
	itemsNeedingThumbnails.forEach(item => {
		thumbnailManager.getThumbnail(item.path, path);
		
		if (!item.isDir && isArchiveFile(item.name)) {
			FileSystemAPI.preheatArchiveList(item.path);
		}
	});
}

/**
 * 目录数据加载器
 * 封装普通目录和虚拟路径的加载逻辑
 */
export class FolderDataLoader {
	private virtualPathUnsubscribe: (() => void) | null = null;
	
	/** 清理虚拟路径订阅 */
	cleanup(): void {
		if (this.virtualPathUnsubscribe) {
			this.virtualPathUnsubscribe();
			this.virtualPathUnsubscribe = null;
		}
	}
	
	/**
	 * 加载目录数据
	 * @param path 目录路径
	 * @param layerId 层 ID（用于虚拟路径订阅回调）
	 * @param onUpdate 虚拟路径数据更新回调
	 */
	async loadDirectory(
		path: string,
		layerId: string,
		onUpdate?: (items: FsItem[]) => void
	): Promise<{ items: FsItem[]; error: string | null }> {
		try {
			if (isVirtualPath(path)) {
				return this.loadVirtualPath(path, layerId, onUpdate);
			} else {
				return await this.loadFileSystemPath(path);
			}
		} catch (err) {
			return {
				items: [],
				error: err instanceof Error ? err.message : String(err)
			};
		}
	}
	
	private loadVirtualPath(
		path: string,
		layerId: string,
		onUpdate?: (items: FsItem[]) => void
	): { items: FsItem[]; error: null } {
		const items = loadVirtualPathData(path);
		
		// 清理之前的订阅
		this.cleanup();
		
		// 订阅数据变化
		if (onUpdate) {
			this.virtualPathUnsubscribe = subscribeVirtualPathData(path, newItems => {
				onUpdate(newItems);
				loadThumbnailsForLayer(newItems, path);
			});
		}
		
		loadThumbnailsForLayer(items, path);
		
		return { items, error: null };
	}
	
	private async loadFileSystemPath(path: string): Promise<{ items: FsItem[]; error: null }> {
		// 清理虚拟路径订阅
		this.cleanup();
		
		const items = await directoryTreeCache.getDirectory(path);
		loadThumbnailsForLayer(items, path);
		
		return { items, error: null };
	}
}

/**
 * 创建层的工厂函数
 */
export function createLayerFactory(
	dataLoader: FolderDataLoader,
	onLayerUpdate?: (layerId: string, items: FsItem[]) => void
) {
	return async function createLayer(path: string): Promise<FolderLayer> {
		const layerId = crypto.randomUUID();
		
		const { items, error } = await dataLoader.loadDirectory(
			path,
			layerId,
			onLayerUpdate ? (newItems) => onLayerUpdate(layerId, newItems) : undefined
		);
		
		return {
			id: layerId,
			path,
			items,
			loading: false,
			error,
			selectedIndex: -1,
			scrollTop: 0
		};
	};
}
