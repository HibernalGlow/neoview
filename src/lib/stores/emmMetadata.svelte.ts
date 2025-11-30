/**
 * EMM Metadata Store
 * 管理 exhentai-manga-manager 的元数据缓存
 */

import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import * as EMMAPI from '$lib/api/emm';
import type { EMMMetadata, EMMCollectTag } from '$lib/api/emm';
import type { EMMCacheEntry } from '$lib/services/emmSyncService';

// 导入模块化组件
import type { EMMMetadataState } from './emm/types';
import { loadSettings, saveSettings } from './emm/storage';
import { isCollectTag } from './emm/helpers';
import { normalizePathKey } from '$lib/utils/pathHash';

const initialSettings = loadSettings();

const { subscribe, set, update } = writable<EMMMetadataState>({
	metadataCache: new Map(),
	pathCache: new Map(),
	collectTags: [],
	databasePaths: [],
	translationDbPath: undefined,
	settingPath: undefined,
	translationDictPath: undefined,
	translationDict: undefined,
	manualDatabasePaths: initialSettings.databasePaths,
	manualTranslationDbPath: initialSettings.translationDbPath,
	manualSettingPath: initialSettings.settingPath,
	manualTranslationDictPath: initialSettings.translationDictPath,
	enableEMM: initialSettings.enableEMM,
	fileListTagDisplayMode: initialSettings.fileListTagDisplayMode
});

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

			// 加载翻译字典
			const translationDictPath = stateForSetting!.manualTranslationDictPath || await EMMAPI.findEMMTranslationFile();
			console.debug('[EMMStore] initialize: 翻译字典路径:', translationDictPath);

			if (translationDictPath) {
				try {
					console.debug('[EMMStore] initialize: 开始加载翻译字典，路径:', translationDictPath);
					const dict = await EMMAPI.loadEMMTranslationDict(translationDictPath);
					console.debug('[EMMStore] initialize: 成功加载翻译字典');
					update(s => ({
						...s,
						translationDict: dict,
						translationDictPath
					}));
				} catch (e) {
					console.error('[EMMStore] initialize: 加载翻译字典失败:', e);
				}
			} else {
				console.warn('[EMMStore] initialize: 未找到翻译字典文件 (db.text.json)');
			}

			console.debug('[EMMStore] initialize: 初始化完成');
			isInitialized = true;

			// 计算文件夹平均评分（异步，不阻塞初始化）
			this.calculateFolderRatings();
		} catch (err) {
			console.error('[EMMStore] initialize: 初始化 EMM 元数据失败:', err);
		} finally {
			isInitializing = false;
		}
	},

	/**
	 * 计算所有文件夹的平均评分（使用 Rust 后端）
	 */
	async calculateFolderRatings(): Promise<number> {
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			const count = await invoke<number>('calculate_folder_ratings');
			console.debug('[EMMStore] 计算文件夹评分完成:', count, '个文件夹');
			return count;
		} catch (e) {
			console.error('[EMMStore] 计算文件夹评分失败:', e);
			return 0;
		}
	},

	/**
	 * 设置手动配置的主数据库路径
	 */
	setManualDatabasePaths(paths: string[]) {
		subscribe(state => {
			saveSettings(paths, state.manualTranslationDbPath, state.manualSettingPath, state.manualTranslationDictPath, state.enableEMM, state.fileListTagDisplayMode);
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
			saveSettings(state.manualDatabasePaths, path, state.manualSettingPath, state.manualTranslationDictPath, state.enableEMM, state.fileListTagDisplayMode);
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
			saveSettings(state.manualDatabasePaths, state.manualTranslationDbPath, path, state.manualTranslationDictPath, state.enableEMM, state.fileListTagDisplayMode);
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
	 * 设置手动配置的翻译字典路径
	 */
	async setManualTranslationDictPath(path: string) {
		subscribe(state => {
			saveSettings(state.manualDatabasePaths, state.manualTranslationDbPath, state.manualSettingPath, path, state.enableEMM, state.fileListTagDisplayMode);
		})();
		update(state => ({
			...state,
			manualTranslationDictPath: path
		}));
		// 重新加载翻译字典
		try {
			const dict = await EMMAPI.loadEMMTranslationDict(path);
			update(state => ({
				...state,
				translationDict: dict,
				translationDictPath: path
			}));
		} catch (e) {
			console.error('加载翻译字典失败:', e);
		}
	},

	/**
	 * 设置是否启用 EMM
	 */
	setEnableEMM(enable: boolean) {
		subscribe(state => {
			saveSettings(state.manualDatabasePaths, state.manualTranslationDbPath, state.manualSettingPath, state.manualTranslationDictPath, enable, state.fileListTagDisplayMode);
		})();
		update(state => ({
			...state,
			enableEMM: enable
		}));
	},

	/**
	 * 设置文件列表标签显示模式
	 */
	setFileListTagDisplayMode(mode: 'all' | 'collect' | 'none') {
		subscribe(state => {
			saveSettings(state.manualDatabasePaths, state.manualTranslationDbPath, state.manualSettingPath, state.manualTranslationDictPath, state.enableEMM, mode);
		})();
		update(state => ({
			...state,
			fileListTagDisplayMode: mode
		}));
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
	 * 获取手动配置的数据库路径
	 */
	getManualDatabasePaths(): string[] {
		let paths: string[] = [];
		subscribe(state => {
			paths = state.manualDatabasePaths;
		})();
		return paths;
	},

	/**
	 * 获取手动配置的翻译数据库路径
	 */
	getManualTranslationDbPath(): string | undefined {
		let path: string | undefined;
		subscribe(state => {
			path = state.manualTranslationDbPath;
		})();
		return path;
	},

	/**
	 * 获取手动配置的设置文件路径
	 */
	getManualSettingPath(): string | undefined {
		let path: string | undefined;
		subscribe(state => {
			path = state.manualSettingPath;
		})();
		return path;
	},

	/**
	 * 获取手动配置的翻译字典路径
	 */
	getManualTranslationDictPath(): string | undefined {
		let path: string | undefined;
		subscribe(state => {
			path = state.manualTranslationDictPath;
		})();
		return path;
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
	 * 获取当前配置的翻译字典路径
	 */
	getTranslationDictPath(): string | undefined {
		let path: string | undefined;
		subscribe(state => {
			path = state.translationDictPath;
		})();
		return path;
	},

	/**
	 * 获取翻译字典
	 */
	getTranslationDict(): EMMAPI.EMMTranslationDict | undefined {
		let dict: EMMAPI.EMMTranslationDict | undefined;
		subscribe(state => {
			dict = state.translationDict;
		})();
		return dict;
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
	 * 优先从嵌入的 emm_json 获取，失败后回退到外部数据库
	 */
	async loadMetadataByPath(filePath: string): Promise<EMMMetadata | null> {
		// 规范化路径用于缓存键和查询
		const normalizedPath = normalizePathKey(filePath);

		let currentState: EMMMetadataState;
		subscribe(state => {
			currentState = state;
		})();

		// 检查路径缓存（包括 null 结果，避免重复查询不存在的元数据）
		if (currentState!.pathCache.has(normalizedPath)) {
			const cached = currentState!.pathCache.get(normalizedPath);
			return cached ?? null;
		}

		// 1. 优先从嵌入的 emm_json 获取
		try {
			console.log('[EMMStore] 尝试从嵌入的 emm_json 获取:', normalizedPath);
			const emmJsonStr = await invoke<string | null>('get_emm_json', { path: normalizedPath });
			console.log('[EMMStore] get_emm_json 返回:', emmJsonStr ? `有数据(${emmJsonStr.length}字符)` : 'null');
			if (emmJsonStr) {
				const cacheEntry = JSON.parse(emmJsonStr) as EMMCacheEntry;
				console.log('[EMMStore] 解析 emm_json:', {
					hash: cacheEntry.hash,
					translated_title: cacheEntry.translated_title,
					rating: cacheEntry.rating,
					tags: cacheEntry.tags?.length ?? 0
				});
				// 将 tags 数组转换为 Record<string, string[]> 格式
				const tagsRecord: Record<string, string[]> = {};
				if (Array.isArray(cacheEntry.tags)) {
					for (const tag of cacheEntry.tags) {
						if (!tagsRecord[tag.namespace]) {
							tagsRecord[tag.namespace] = [];
						}
						tagsRecord[tag.namespace].push(tag.tag);
					}
				}
				// 从 cacheEntry 构造 EMMMetadata
				const metadata: EMMMetadata = {
					hash: cacheEntry.hash ?? '',
					translated_title: cacheEntry.translated_title,
					tags: tagsRecord,
					title: cacheEntry.title,
					title_jpn: cacheEntry.title_jpn,
					rating: cacheEntry.rating,
					page_count: cacheEntry.page_count,
					category: cacheEntry.category,
					url: cacheEntry.url,
					filepath: cacheEntry.filepath
				};
				update(s => {
					const newCache = new Map(s.metadataCache);
					newCache.set(metadata.hash, metadata);
					const newPathCache = new Map(s.pathCache);
					newPathCache.set(normalizedPath, metadata);
					return { ...s, metadataCache: newCache, pathCache: newPathCache };
				});
				console.log('[EMMStore] 从 emm_json 加载成功:', metadata.translated_title);
				return metadata;
			}
		} catch (e) {
			// 嵌入数据不可用，继续尝试外部数据库
			console.log('[EMMStore] 从 emm_json 加载失败:', e);
		}

		// 2. 回退到外部数据库
		const translationDbPath = currentState!.translationDbPath;
		const mainDatabases = currentState!.databasePaths.filter(db =>
			!db.toLowerCase().includes('translations.db')
		);

		for (const dbPath of mainDatabases) {
			try {
				const metadata = await EMMAPI.loadEMMMetadataByPath(dbPath, filePath, translationDbPath);
				if (metadata) {
					update(s => {
						const newCache = new Map(s.metadataCache);
						newCache.set(metadata.hash, metadata);
						const newPathCache = new Map(s.pathCache);
						newPathCache.set(normalizedPath, metadata);
						return { ...s, metadataCache: newCache, pathCache: newPathCache };
					});
					return metadata;
				}
			} catch (e) {
				console.error(`[EMMStore] loadMetadataByPath: 从 ${dbPath} 加载元数据失败:`, e);
			}
		}

		// 缓存 null 结果，避免重复查询
		update(s => {
			const newPathCache = new Map(s.pathCache);
			newPathCache.set(normalizedPath, null);
			return { ...s, pathCache: newPathCache };
		});
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
	 * 存储从缩略图数据库获取的 emm_json 缓存
	 */
	storeEmmJsonCache(filePath: string, emmJsonStr: string) {
		const normalizedPath = filePath.replace(/\\/g, '/');
		try {
			const cacheEntry = JSON.parse(emmJsonStr) as EMMCacheEntry;
			// 将 tags 数组转换为 Record<string, string[]> 格式
			const tagsRecord: Record<string, string[]> = {};
			if (Array.isArray(cacheEntry.tags)) {
				for (const tag of cacheEntry.tags) {
					if (!tagsRecord[tag.namespace]) {
						tagsRecord[tag.namespace] = [];
					}
					tagsRecord[tag.namespace].push(tag.tag);
				}
			}
			// 构造 EMMMetadata
			const metadata: EMMMetadata = {
				hash: cacheEntry.hash ?? '',
				translated_title: cacheEntry.translated_title,
				tags: tagsRecord,
				title: cacheEntry.title,
				title_jpn: cacheEntry.title_jpn,
				rating: cacheEntry.rating,
				page_count: cacheEntry.page_count,
				category: cacheEntry.category,
				url: cacheEntry.url,
				filepath: cacheEntry.filepath
			};
			// 存入缓存
			update(s => {
				const newCache = new Map(s.metadataCache);
				newCache.set(metadata.hash, metadata);
				const newPathCache = new Map(s.pathCache);
				newPathCache.set(normalizedPath, metadata);
				return { ...s, metadataCache: newCache, pathCache: newPathCache };
			});
		} catch {
			// 解析失败，忽略
		}
	},

	/**
	 * 清空缓存
	 */
	clearCache() {
		update(state => ({
			...state,
			metadataCache: new Map(),
			pathCache: new Map()
		}));
	},

	/**
	 * 清空指定目录的路径缓存
	 */
	clearPathCacheForDirectory(dirPath: string) {
		const normalizedDir = dirPath.replace(/\\/g, '/');
		update(state => {
			const newPathCache = new Map(state.pathCache);
			for (const key of newPathCache.keys()) {
				if (key.startsWith(normalizedDir)) {
					newPathCache.delete(key);
				}
			}
			return { ...state, pathCache: newPathCache };
		});
	}
};

// 导出收藏标签 Map (Derived Store)
export const collectTagMap = derived(emmMetadataStore, ($state) => {
	const map = new Map<string, EMMCollectTag>();
	const normalize = (s: string) => s.trim().toLowerCase();

	for (const ct of $state.collectTags) {
		// 1. Map by ID (usually "category:tag")
		if (ct.id) map.set(normalize(ct.id), ct);

		// 2. Map by Display (usually "category:tag")
		if (ct.display) map.set(normalize(ct.display), ct);

		// 3. Map by Tag only (if unique enough)
		if (ct.tag) map.set(normalize(ct.tag), ct);

		// 4. Map by "Letter:Tag"
		if (ct.letter && ct.tag) map.set(normalize(`${ct.letter}:${ct.tag}`), ct);
	}

	// console.debug('[EMMStore] collectTagMap updated, size:', map.size);
	return map;
});


// 从模块重新导出
export { isCollectTagHelper } from './emm/helpers';
export { emmTranslationStore } from './emm/translation';

