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
	// 数据库路径列表（自动检测 + 手动配置）
	databasePaths: string[];
	// 设置文件路径（自动检测 + 手动配置）
	settingPath?: string;
	// 手动配置的数据库路径
	manualDatabasePaths: string[];
	// 手动配置的设置文件路径
	manualSettingPath?: string;
}

const STORAGE_KEY_DB_PATHS = 'neoview-emm-database-paths';
const STORAGE_KEY_SETTING_PATH = 'neoview-emm-setting-path';

// 从 localStorage 加载手动配置的路径
function loadManualPaths(): { databasePaths: string[]; settingPath?: string } {
	try {
		const dbPathsStr = localStorage.getItem(STORAGE_KEY_DB_PATHS);
		const settingPathStr = localStorage.getItem(STORAGE_KEY_SETTING_PATH);
		
		return {
			databasePaths: dbPathsStr ? JSON.parse(dbPathsStr) : [],
			settingPath: settingPathStr || undefined
		};
	} catch (e) {
		console.error('加载 EMM 手动配置路径失败:', e);
		return { databasePaths: [] };
	}
}

// 保存手动配置的路径到 localStorage
function saveManualPaths(databasePaths: string[], settingPath?: string) {
	try {
		localStorage.setItem(STORAGE_KEY_DB_PATHS, JSON.stringify(databasePaths));
		if (settingPath) {
			localStorage.setItem(STORAGE_KEY_SETTING_PATH, settingPath);
		} else {
			localStorage.removeItem(STORAGE_KEY_SETTING_PATH);
		}
	} catch (e) {
		console.error('保存 EMM 手动配置路径失败:', e);
	}
}

const manualPaths = loadManualPaths();

const { subscribe, set, update } = writable<EMMMetadataState>({
	metadataCache: new Map(),
	collectTags: [],
	databasePaths: [],
	settingPath: undefined,
	manualDatabasePaths: manualPaths.databasePaths,
	manualSettingPath: manualPaths.settingPath
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
			// 合并自动检测和手动配置的数据库路径
			const autoDatabases = await EMMAPI.findEMMDatabases();
			let currentState: EMMMetadataState;
			subscribe(state => {
				currentState = state;
			})();
			
			const allDatabases = [...autoDatabases, ...(currentState!.manualDatabasePaths || [])];
			// 去重
			const uniqueDatabases = Array.from(new Set(allDatabases));
			update(s => ({
				...s,
				databasePaths: uniqueDatabases
			}));
			
			// 优先使用手动配置的设置文件，否则尝试自动查找
			let stateForSetting: EMMMetadataState;
			subscribe(s => {
				stateForSetting = s;
			})();
			
			const settingPath = stateForSetting!.manualSettingPath || await EMMAPI.findEMMSettingFile();
			if (settingPath) {
				try {
					const tags = await EMMAPI.loadEMMCollectTags(settingPath);
					update(s => ({
						...s,
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
	 * 设置手动配置的数据库路径
	 */
	setManualDatabasePaths(paths: string[]) {
		update(state => ({
			...state,
			manualDatabasePaths: paths
		}));
		saveManualPaths(paths, undefined);
		// 重新初始化以应用新路径
		this.initialize();
	},
	
	/**
	 * 设置手动配置的设置文件路径
	 */
	async setManualSettingPath(path: string) {
		subscribe(state => {
			saveManualPaths(state.manualDatabasePaths, path);
		})();
		update(state => ({
			...state,
			manualSettingPath: path
		}));
		// 重新加载收藏标签
		try {
			const tags = await EMMAPI.loadEMMCollectTags(path);
			update(state => ({
				...state,
				collectTags: tags,
				settingPath: path
			}));
		} catch (e) {
			console.error('加载收藏标签失败:', e);
		}
	},
	
	/**
	 * 获取当前配置的数据库路径（自动 + 手动）
	 */
	getDatabasePaths(): string[] {
		let paths: string[] = [];
		subscribe(state => {
			paths = state.databasePaths;
		})();
		return paths;
	},
	
	/**
	 * 获取当前配置的设置文件路径
	 */
	getSettingPath(): string | undefined {
		let path: string | undefined;
		subscribe(state => {
			path = state.settingPath;
		})();
		return path;
	},
	
	/**
	 * 加载元数据（通过 hash）
	 */
	async loadMetadataByHash(hash: string): Promise<EMMMetadata | null> {
		let currentState: EMMMetadataState;
		subscribe(state => {
			currentState = state;
		})();
		
		// 检查缓存
		if (currentState!.metadataCache.has(hash)) {
			return currentState!.metadataCache.get(hash)!;
		}
		
		// 从所有数据库尝试加载
		for (const dbPath of currentState!.databasePaths) {
			try {
				const metadata = await EMMAPI.loadEMMMetadata(dbPath, hash);
				if (metadata) {
					update(s => {
						const newCache = new Map(s.metadataCache);
						newCache.set(hash, metadata);
						return { ...s, metadataCache: newCache };
					});
					return metadata;
				}
			} catch (e) {
				console.debug(`从 ${dbPath} 加载元数据失败:`, e);
			}
		}
		
		return null;
	},
	
	/**
	 * 加载元数据（通过文件路径）
	 */
	async loadMetadataByPath(filePath: string): Promise<EMMMetadata | null> {
		// 先检查缓存（通过文件路径的 hash）
		// 这里简化处理，直接查询数据库
		
		let currentState: EMMMetadataState;
		subscribe(state => {
			currentState = state;
		})();
		
		// 从所有数据库尝试加载
		for (const dbPath of currentState!.databasePaths) {
			try {
				const metadata = await EMMAPI.loadEMMMetadataByPath(dbPath, filePath);
				if (metadata) {
					update(s => {
						const newCache = new Map(s.metadataCache);
						newCache.set(metadata.hash, metadata);
						return { ...s, metadataCache: newCache };
					});
					return metadata;
				}
			} catch (e) {
				console.debug(`从 ${dbPath} 加载元数据失败:`, e);
			}
		}
		
		return null;
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

