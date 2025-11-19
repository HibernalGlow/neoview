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
	// 主数据库路径列表（自动检测 + 手动配置）
	databasePaths: string[];
	// 翻译数据库路径（自动检测 + 手动配置）
	translationDbPath?: string;
	// 设置文件路径（自动检测 + 手动配置）
	settingPath?: string;
	// 手动配置的主数据库路径
	manualDatabasePaths: string[];
	// 手动配置的翻译数据库路径
	manualTranslationDbPath?: string;
	// 手动配置的设置文件路径
	manualSettingPath?: string;
}

const STORAGE_KEY_DB_PATHS = 'neoview-emm-database-paths';
const STORAGE_KEY_TRANSLATION_DB_PATH = 'neoview-emm-translation-db-path';
const STORAGE_KEY_SETTING_PATH = 'neoview-emm-setting-path';

// 从 localStorage 加载手动配置的路径
function loadManualPaths(): { databasePaths: string[]; translationDbPath?: string; settingPath?: string } {
	try {
		const dbPathsStr = localStorage.getItem(STORAGE_KEY_DB_PATHS);
		const translationDbPathStr = localStorage.getItem(STORAGE_KEY_TRANSLATION_DB_PATH);
		const settingPathStr = localStorage.getItem(STORAGE_KEY_SETTING_PATH);
		
		return {
			databasePaths: dbPathsStr ? JSON.parse(dbPathsStr) : [],
			translationDbPath: translationDbPathStr || undefined,
			settingPath: settingPathStr || undefined
		};
	} catch (e) {
		console.error('加载 EMM 手动配置路径失败:', e);
		return { databasePaths: [] };
	}
}

// 保存手动配置的路径到 localStorage
function saveManualPaths(databasePaths: string[], translationDbPath?: string, settingPath?: string) {
	try {
		localStorage.setItem(STORAGE_KEY_DB_PATHS, JSON.stringify(databasePaths));
		if (translationDbPath) {
			localStorage.setItem(STORAGE_KEY_TRANSLATION_DB_PATH, translationDbPath);
		} else {
			localStorage.removeItem(STORAGE_KEY_TRANSLATION_DB_PATH);
		}
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
	translationDbPath: undefined,
	settingPath: undefined,
	manualDatabasePaths: manualPaths.databasePaths,
	manualTranslationDbPath: manualPaths.translationDbPath,
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

// 初始化状态标志
let isInitializing = false;
let isInitialized = false;

export const emmMetadataStore = {
	subscribe,
	
	/**
	 * 初始化：查找数据库和加载收藏标签
	 */
	async initialize(force = false) {
		// 如果正在初始化，直接返回
		if (isInitializing) {
			console.debug('[EMMStore] initialize: 正在初始化中，跳过');
			return;
		}
		// 如果已经初始化且未强制刷新，直接返回
		if (!force && isInitialized) {
			console.debug('[EMMStore] initialize: 已经初始化，跳过');
			return;
		}
		
		isInitializing = true;
		try {
			console.debug('[EMMStore] initialize: 开始初始化 EMM 元数据，force =', force);
			
			// 合并自动检测和手动配置的主数据库路径
			const autoDatabases = await EMMAPI.findEMMDatabases();
			console.debug('[EMMStore] initialize: 自动检测到的主数据库:', autoDatabases);
			
			let currentState: EMMMetadataState;
			subscribe(state => {
				currentState = state;
			})();
			
			const manualDbPaths = currentState!.manualDatabasePaths || [];
			console.debug('[EMMStore] initialize: 手动配置的主数据库:', manualDbPaths);
			
			const useManualOnly = manualDbPaths.length > 0;
			const baseDatabases = useManualOnly ? manualDbPaths : autoDatabases;
			// 去重，并过滤掉 translations.db（它应该只用于翻译数据库路径）
			const uniqueDatabases = Array.from(new Set(baseDatabases))
				.filter(db => !db.toLowerCase().includes('translations.db'));
			
			if (useManualOnly) {
				console.debug('[EMMStore] initialize: 使用手动配置的主数据库列表（忽略自动检测结果）:', uniqueDatabases);
			} else {
				console.debug('[EMMStore] initialize: 使用自动检测的主数据库列表:', uniqueDatabases);
			}
			
			// 确定翻译数据库路径（优先手动配置，否则自动检测）
			let translationDbPath = currentState!.manualTranslationDbPath;
			if (!translationDbPath) {
				translationDbPath = await EMMAPI.findEMMTranslationDatabase() || undefined;
			}
			console.debug('[EMMStore] initialize: 翻译数据库路径:', translationDbPath);
			
			update(s => ({
				...s,
				databasePaths: uniqueDatabases,
				translationDbPath
			}));
			
			// 优先使用手动配置的设置文件，否则尝试自动查找
			let stateForSetting: EMMMetadataState;
			subscribe(s => {
				stateForSetting = s;
			})();
			
			const settingPath = stateForSetting!.manualSettingPath || await EMMAPI.findEMMSettingFile();
			console.debug('[EMMStore] initialize: 设置文件路径:', settingPath);
			
			if (settingPath) {
				try {
					console.debug('[EMMStore] initialize: 开始加载收藏标签，路径:', settingPath);
					const tags = await EMMAPI.loadEMMCollectTags(settingPath);
					console.debug('[EMMStore] initialize: 成功加载收藏标签，数量:', tags.length);
					if (tags.length > 0) {
						console.debug('[EMMStore] initialize: 前3个标签:', tags.slice(0, 3).map(t => ({ id: t.id, display: t.display, tag: t.tag })));
					} else {
						console.warn('[EMMStore] initialize: 警告：从设置文件加载的收藏标签为空，请检查 setting.json 中的 collectTag 字段');
					}
					update(s => ({
						...s,
						collectTags: tags,
						settingPath
					}));
					console.debug('[EMMStore] initialize: 收藏标签已更新到 store');
				} catch (e) {
					console.error('[EMMStore] initialize: 加载收藏标签失败:', e);
					console.error('[EMMStore] initialize: 错误详情:', e instanceof Error ? e.message : String(e));
					if (e instanceof Error && e.stack) {
						console.error('[EMMStore] initialize: 错误堆栈:', e.stack);
					}
				}
			} else {
				console.warn('[EMMStore] initialize: 未找到设置文件，请手动配置 setting.json 路径');
			}
			
			console.debug('[EMMStore] initialize: 初始化完成');
			isInitialized = true;
		} catch (err) {
			console.error('[EMMStore] initialize: 初始化 EMM 元数据失败:', err);
		} finally {
			isInitializing = false;
		}
	},
	
	/**
	 * 设置手动配置的主数据库路径
	 */
	setManualDatabasePaths(paths: string[]) {
		subscribe(state => {
			saveManualPaths(paths, state.manualTranslationDbPath, state.manualSettingPath);
		})();
		update(state => ({
			...state,
			manualDatabasePaths: paths
		}));
		// 重新初始化以应用新路径
		this.initialize(true);
	},
	
	/**
	 * 设置手动配置的翻译数据库路径
	 */
	setManualTranslationDbPath(path: string) {
		subscribe(state => {
			saveManualPaths(state.manualDatabasePaths, path, state.manualSettingPath);
		})();
		update(state => ({
			...state,
			manualTranslationDbPath: path,
			translationDbPath: path
		}));
		// 重新初始化以应用新路径
		this.initialize(true);
	},
	
	/**
	 * 设置手动配置的设置文件路径
	 */
	async setManualSettingPath(path: string) {
		subscribe(state => {
			saveManualPaths(state.manualDatabasePaths, state.manualTranslationDbPath, path);
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
	 * 获取当前配置的翻译数据库路径
	 */
	getTranslationDbPath(): string | undefined {
		let path: string | undefined;
		subscribe(state => {
			path = state.translationDbPath;
		})();
		return path;
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
		
		const translationDbPath = currentState!.translationDbPath;
		
		// 从所有主数据库尝试加载（过滤掉 translations.db）
		const mainDatabases = currentState!.databasePaths.filter(db => 
			!db.toLowerCase().includes('translations.db')
		);
		
		for (const dbPath of mainDatabases) {
			try {
				const metadata = await EMMAPI.loadEMMMetadata(dbPath, hash, translationDbPath);
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
		console.debug('[EMMStore] loadMetadataByPath: 开始加载，filePath:', filePath);
		
		let currentState: EMMMetadataState;
		subscribe(state => {
			currentState = state;
		})();
		
		const translationDbPath = currentState!.translationDbPath;
		console.debug('[EMMStore] loadMetadataByPath: 数据库路径列表:', currentState!.databasePaths);
		console.debug('[EMMStore] loadMetadataByPath: 翻译数据库路径:', translationDbPath);
		
		// 从所有主数据库尝试加载（过滤掉 translations.db）
		const mainDatabases = currentState!.databasePaths.filter(db => 
			!db.toLowerCase().includes('translations.db')
		);
		console.debug('[EMMStore] loadMetadataByPath: 过滤后的主数据库列表:', mainDatabases);
		
		for (const dbPath of mainDatabases) {
			try {
				console.debug('[EMMStore] loadMetadataByPath: 尝试从数据库加载，dbPath:', dbPath);
				const metadata = await EMMAPI.loadEMMMetadataByPath(dbPath, filePath, translationDbPath);
				if (metadata) {
					console.debug('[EMMStore] loadMetadataByPath: 成功加载元数据，metadata:', metadata);
					update(s => {
						const newCache = new Map(s.metadataCache);
						newCache.set(metadata.hash, metadata);
						return { ...s, metadataCache: newCache };
					});
					return metadata;
				} else {
					console.debug('[EMMStore] loadMetadataByPath: 数据库中没有找到元数据，dbPath:', dbPath);
				}
			} catch (e) {
				console.error(`[EMMStore] loadMetadataByPath: 从 ${dbPath} 加载元数据失败:`, e);
			}
		}
		
		console.debug('[EMMStore] loadMetadataByPath: 所有数据库都未找到元数据，filePath:', filePath);
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
		console.debug('[EMMStore] getCollectTags: 返回收藏标签数量:', tags.length);
		if (tags.length > 0) {
			console.debug('[EMMStore] getCollectTags: 前3个标签:', tags.slice(0, 3).map(t => ({ id: t.id, display: t.display, tag: t.tag })));
		}
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
	console.debug('[EMM] isCollectTagHelper: 开始匹配标签，tag:', tag, '收藏标签数量:', collectTags.length);
	
	// 尝试多种匹配方式
	for (const ct of collectTags) {
		// 1. 完全匹配 id (格式: "category:tag")
		if (ct.id === tag) {
			console.debug('[EMM] 标签匹配 (id):', tag, '->', ct);
			return ct;
		}
		// 2. 完全匹配 display (格式: "category:tag" 或 "letter:tag")
		if (ct.display === tag) {
			console.debug('[EMM] 标签匹配 (display):', tag, '->', ct);
			return ct;
		}
		// 3. 完全匹配 tag (仅标签名，不含分类)
		if (ct.tag === tag) {
			console.debug('[EMM] 标签匹配 (tag):', tag, '->', ct);
			return ct;
		}
		
		// 4. 如果输入的 tag 是 "category:tag" 格式，尝试多种匹配方式
		if (tag.includes(':')) {
			const [tagCategory, tagName] = tag.split(':', 2);
			
			// 4.1 检查 display 是否匹配 "category:tagName"
			if (ct.display === `${tagCategory}:${tagName}`) {
				console.debug('[EMM] 标签匹配 (display category:tag):', tag, '->', ct);
				return ct;
			}
			
			// 4.2 检查 display 是否匹配 "letter:tagName" (使用收藏标签的 letter)
			if (ct.display === `${ct.letter}:${tagName}`) {
				console.debug('[EMM] 标签匹配 (display letter:tag):', tag, '->', ct);
				return ct;
			}
			
			// 4.3 检查 tag 字段是否匹配 tagName
			if (ct.tag === tagName) {
				console.debug('[EMM] 标签匹配 (tag name):', tag, '->', ct);
				return ct;
			}
		} else {
			// 5. 如果输入的 tag 不包含冒号，只匹配 tag 字段
			if (ct.tag === tag) {
				console.debug('[EMM] 标签匹配 (tag only):', tag, '->', ct);
				return ct;
			}
		}
	}
	
	console.debug('[EMM] 标签未匹配:', tag);
	console.debug('[EMM] 收藏标签列表:', collectTags.map(ct => ({ 
		id: ct.id, 
		display: ct.display, 
		tag: ct.tag, 
		letter: ct.letter 
	})));
	return null;
}

