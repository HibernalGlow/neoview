/**
 * EMM Metadata Store
 * 管理 exhentai-manga-manager 的元数据缓存
 */

import { writable, derived } from 'svelte/store';
import * as EMMAPI from '$lib/api/emm';
import type { EMMMetadata, EMMCollectTag } from '$lib/api/emm';

interface EMMMetadataState {
	// hash -> metadata
	metadataCache: Map<string, EMMMetadata>;
	// 收藏标签列表
	collectTags: EMMCollectTag[];
	// 数据库路径列表
	databasePaths: string[];
	// 设置文件路径
	settingPath?: string;
}

const { subscribe, set, update } = writable<EMMMetadataState>({
	metadataCache: new Map(),
	collectTags: [],
	databasePaths: [],
	settingPath: undefined
});

// 检查标签是否为收藏标签
function isCollectTag(tag: string, collectTags: EMMCollectTag[]): EMMCollectTag | null {
	for (const ct of collectTags) {
		if (ct.tag === tag || ct.display === tag) {
			return ct;
		}
	}
	return null;
}

export const emmMetadataStore = {
	subscribe,
	
	/**
	 * 初始化：查找数据库和加载收藏标签
	 */
	async initialize() {
		try {
			const databases = await EMMAPI.findEMMDatabases();
			update(state => ({
				...state,
				databasePaths: databases
			}));
			
			// 尝试查找设置文件
			const settingPath = await EMMAPI.findEMMSettingFile();
			if (settingPath) {
				try {
					const tags = await EMMAPI.loadEMMCollectTags(settingPath);
					update(state => ({
						...state,
						collectTags: tags,
						settingPath
					}));
				} catch (e) {
					console.debug('加载收藏标签失败:', e);
				}
			}
		} catch (err) {
			console.error('初始化 EMM 元数据失败:', err);
		}
	},
	
	/**
	 * 加载元数据（通过 hash）
	 */
	async loadMetadataByHash(hash: string): Promise<EMMMetadata | null> {
		return new Promise((resolve) => {
			subscribe(async (state) => {
				// 检查缓存
				if (state.metadataCache.has(hash)) {
					resolve(state.metadataCache.get(hash)!);
					return;
				}
				
				// 从所有数据库尝试加载
				for (const dbPath of state.databasePaths) {
					try {
						const metadata = await EMMAPI.loadEMMMetadata(dbPath, hash);
						if (metadata) {
							update(s => {
								const newCache = new Map(s.metadataCache);
								newCache.set(hash, metadata);
								return { ...s, metadataCache: newCache };
							});
							resolve(metadata);
							return;
						}
					} catch (e) {
						console.debug(`从 ${dbPath} 加载元数据失败:`, e);
					}
				}
				
				resolve(null);
			})();
		});
	},
	
	/**
	 * 加载元数据（通过文件路径）
	 */
	async loadMetadataByPath(filePath: string): Promise<EMMMetadata | null> {
		return new Promise((resolve) => {
			subscribe(async (state) => {
				// 从所有数据库尝试加载
				for (const dbPath of state.databasePaths) {
					try {
						const metadata = await EMMAPI.loadEMMMetadataByPath(dbPath, filePath);
						if (metadata) {
							update(s => {
								const newCache = new Map(s.metadataCache);
								newCache.set(metadata.hash, metadata);
								return { ...s, metadataCache: newCache };
							});
							resolve(metadata);
							return;
						}
					} catch (e) {
						console.debug(`从 ${dbPath} 加载元数据失败:`, e);
					}
				}
				
				resolve(null);
			})();
		});
	},
	
	/**
	 * 获取收藏标签
	 */
	getCollectTags(): EMMCollectTag[] {
		let tags: EMMCollectTag[] = [];
		subscribe(state => {
			tags = state.collectTags;
		})();
		return tags;
	},
	
	/**
	 * 检查标签是否为收藏标签
	 */
	isCollectTag(tag: string): EMMCollectTag | null {
		let result: EMMCollectTag | null = null;
		subscribe(state => {
			result = isCollectTag(tag, state.collectTags);
		})();
		return result;
	},
	
	/**
	 * 清空缓存
	 */
	clearCache() {
		update(state => ({
			...state,
			metadataCache: new Map()
		}));
	}
};

// 导出辅助函数
export function isCollectTagHelper(tag: string, collectTags: EMMCollectTag[]): EMMCollectTag | null {
	return isCollectTag(tag, collectTags);
}

