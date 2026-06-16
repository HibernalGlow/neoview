/**
 * FolderStack 数据加载模块
 * 处理目录加载、虚拟路径、缩略图预加载
 */

import type { FsItem } from '$lib/types';
import type { FolderLayer } from './FolderStackState.svelte';
import * as FileSystemAPI from '$lib/api/filesystem';
import { unifiedThumbnailStore, generateThumbKey, type ThumbnailSource, type ThumbnailRequest } from '$lib/stores/unifiedThumbnailStore.svelte';
import { isVirtualPath } from '../../stores/folderTabStore';
import { isArchiveFile } from './folderStackUtils';
import {
	loadVirtualPathData,
	subscribeVirtualPathData
} from '../../utils/virtualPathLoader';
import { directoryTreeCache } from '../../utils/directoryTreeCache';

const BACKGROUND_THUMBNAIL_WARMUP_LIMIT = 48;
const BACKGROUND_THUMBNAIL_WARMUP_DELAY_MS = 700;

/**
 * 加载目录缩略图 (V3 优化版)
 * 1. 触发后端小批量预热（低优先级车道）
 * 2. 预热压缩包列表
 */
export function loadThumbnailsForLayer(items: FsItem[], path: string): void {
	// 虚拟路径跳过预加载
	if (isVirtualPath(path)) {
		return;
	}

	// 1. 只预热靠前的小批量项目。整目录请求会把大量 key 标记为 inFlight，
	// 导致可见区无法提权，体感反而更慢。
	const thumbRequests: ThumbnailRequest[] = items.slice(0, BACKGROUND_THUMBNAIL_WARMUP_LIMIT).map((item) => {
		const source: ThumbnailSource = { kind: 'file', path: item.path, fileSize: 0, modified: 0 };
		return { key: generateThumbKey(source, 256), source, maxSize: 256 };
	});
	if (thumbRequests.length > 0) {
		setTimeout(() => {
			void unifiedThumbnailStore.requestThumbnails(thumbRequests, path, 'background');
		}, BACKGROUND_THUMBNAIL_WARMUP_DELAY_MS);
	}

	// 2. 预热压缩包（如果是压缩包内的列表，前端已处理；这里处理文件列表中的压缩包）
	const topItems = items.slice(0, 20);
	topItems.forEach((item) => {
		if (!item.isDir && isArchiveFile(item.name)) {
			void FileSystemAPI.preheatArchiveList(item.path);
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
