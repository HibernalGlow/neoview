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
	// filePath -> metadata (用于路径查询缓存)
	pathCache: Map<string, EMMMetadata | null>;
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
	// 手动配置的设置文件路径
	manualSettingPath?: string;
	// 全局开关：是否启用 EMM 数据读取
	enableEMM: boolean;
	// 文件列表标签显示模式
	fileListTagDisplayMode: 'all' | 'collect' | 'none';
	// 翻译字典文件路径
	translationDictPath?: string;
	// 翻译字典数据
	translationDict?: EMMAPI.EMMTranslationDict;
	// 手动配置的翻译字典路径
	manualTranslationDictPath?: string;
}

const STORAGE_KEY_DB_PATHS = 'neoview-emm-database-paths';
const STORAGE_KEY_TRANSLATION_DB_PATH = 'neoview-emm-translation-db-path';
const STORAGE_KEY_SETTING_PATH = 'neoview-emm-setting-path';
const STORAGE_KEY_TRANSLATION_DICT_PATH = 'neoview-emm-translation-dict-path';
const STORAGE_KEY_ENABLE_EMM = 'neoview-emm-enable';
const STORAGE_KEY_FILE_LIST_TAG_MODE = 'neoview-emm-file-list-tag-mode';

// 从 localStorage 加载手动配置的路径
function loadSettings(): {
	databasePaths: string[];
	translationDbPath?: string;
	settingPath?: string;
	translationDictPath?: string;
	enableEMM: boolean;
	fileListTagDisplayMode: 'all' | 'collect' | 'none';
} {
	try {
		const dbPathsStr = localStorage.getItem(STORAGE_KEY_DB_PATHS);
		const translationDbPathStr = localStorage.getItem(STORAGE_KEY_TRANSLATION_DB_PATH);
		const settingPathStr = localStorage.getItem(STORAGE_KEY_SETTING_PATH);
		const translationDictPathStr = localStorage.getItem(STORAGE_KEY_TRANSLATION_DICT_PATH);
		const enableEMMStr = localStorage.getItem(STORAGE_KEY_ENABLE_EMM);
		const fileListTagModeStr = localStorage.getItem(STORAGE_KEY_FILE_LIST_TAG_MODE);

		return {
			databasePaths: dbPathsStr ? JSON.parse(dbPathsStr) : [],
			translationDbPath: translationDbPathStr || undefined,
			settingPath: settingPathStr || undefined,
			translationDictPath: translationDictPathStr || undefined,
			enableEMM: enableEMMStr !== 'false', // 默认为 true
			fileListTagDisplayMode: (fileListTagModeStr as 'all' | 'collect' | 'none') || 'collect' // 默认为 collect
		};
	} catch (e) {
		console.error('加载 EMM 配置失败:', e);
		return {
			databasePaths: [],
			enableEMM: true,
			fileListTagDisplayMode: 'collect'
		};
	}
}

// 保存配置到 localStorage
function saveSettings(
	databasePaths: string[],
	translationDbPath?: string,
	settingPath?: string,
	translationDictPath?: string,
	enableEMM?: boolean,
	fileListTagDisplayMode?: 'all' | 'collect' | 'none'
) {
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
		if (translationDictPath) {
			localStorage.setItem(STORAGE_KEY_TRANSLATION_DICT_PATH, translationDictPath);
		} else {
			localStorage.removeItem(STORAGE_KEY_TRANSLATION_DICT_PATH);
		}
		if (enableEMM !== undefined) {
			localStorage.setItem(STORAGE_KEY_ENABLE_EMM, String(enableEMM));
		}
		if (fileListTagDisplayMode) {
			localStorage.setItem(STORAGE_KEY_FILE_LIST_TAG_MODE, fileListTagDisplayMode);
		}
	} catch (e) {
		console.error('保存 EMM 配置失败:', e);
	}
}

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
	 */
	async loadMetadataByPath(filePath: string): Promise<EMMMetadata | null> {
		// 规范化路径用于缓存键
		const normalizedPath = filePath.replace(/\\/g, '/');

		let currentState: EMMMetadataState;
		subscribe(state => {
			currentState = state;
		})();

		// 检查路径缓存（包括 null 结果，避免重复查询不存在的元数据）
		if (currentState!.pathCache.has(normalizedPath)) {
			const cached = currentState!.pathCache.get(normalizedPath);
			return cached ?? null;
		}

		const translationDbPath = currentState!.translationDbPath;

		// 从所有主数据库尝试加载（过滤掉 translations.db）
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


// 导出辅助函数
export function isCollectTagHelper(tag: string, collectTags: EMMCollectTag[]): EMMCollectTag | null {
	const normalize = (value?: string | null) => value ? value.trim().toLowerCase() : '';
	const inputNormalized = normalize(tag);
	const hasCategory = tag.includes(':');
	const [inputCategoryRaw, inputTagRaw] = hasCategory ? tag.split(':', 2) : ['', tag];
	const inputCategoryNormalized = normalize(inputCategoryRaw);
	const inputTagOnlyNormalized = normalize(inputTagRaw);

	// console.debug('[EMM] isCollectTagHelper: Checking tag', { tag, hasCategory, inputCategoryNormalized, inputTagOnlyNormalized });

	for (const ct of collectTags) {
		const idNormalized = normalize(ct.id);
		const displayNormalized = normalize(ct.display);
		const tagNormalized = normalize(ct.tag);
		const letterNormalized = normalize(ct.letter);

		// Parse category from display if possible (e.g. "female:stirrup legwear")
		const displayHasCategory = ct.display?.includes(':');
		const [displayCategoryRaw, displayTagRaw] = displayHasCategory ? ct.display.split(':', 2) : ['', ct.display];
		const displayCategoryNormalized = normalize(displayCategoryRaw);
		const displayTagNormalized = normalize(displayTagRaw);

		// 1. Exact Match (ID or Display)
		if (idNormalized && idNormalized === inputNormalized) return ct;
		if (displayNormalized && displayNormalized === inputNormalized) return ct;

		// 2. Tag Name Match (most common case)
		// If the input is just "tag", match against ct.tag
		if (!hasCategory && tagNormalized === inputNormalized) return ct;

		// 3. Category:Tag Match
		if (hasCategory) {
			// Match against Display (category:tag)
			if (displayHasCategory && displayCategoryNormalized === inputCategoryNormalized && displayTagNormalized === inputTagOnlyNormalized) return ct;

			// Match against Letter:Tag (e.g. "f:stirrup legwear")
			if (letterNormalized && letterNormalized === inputCategoryNormalized && tagNormalized === inputTagOnlyNormalized) return ct;

			// Match against Tag only (ignoring category if tag name is unique enough or user wants loose matching)
			// Note: This might cause false positives if same tag exists in multiple categories, but usually desired for "favorites"
			if (tagNormalized === inputTagOnlyNormalized) return ct;
		}
	}

	return null;
}

// 命名空间缩写映射
const NAMESPACE_ABBREVIATIONS: Record<string, string> = {
	'language': 'l',
	'parody': 'p',
	'character': 'c',
	'group': 'g',
	'artist': 'a',
	'male': 'm',
	'female': 'f',
	'mixed': 'x',
	'reclass': 'r',
	'cosplayer': 'cos',
	'other': 'o'
};

// 反向映射：缩写 -> 全称
const ABBREVIATION_TO_NAMESPACE: Record<string, string> = Object.entries(NAMESPACE_ABBREVIATIONS).reduce((acc, [k, v]) => {
	acc[v] = k;
	return acc;
}, {} as Record<string, string>);

export const emmTranslationStore = {
	/**
	 * 获取命名空间缩写
	 */
	getShortNamespace(namespace: string): string {
		const lower = namespace.toLowerCase();
		return NAMESPACE_ABBREVIATIONS[lower] || namespace;
	},

	/**
	 * 获取命名空间全称
	 */
	getFullNamespace(short: string): string {
		const lower = short.toLowerCase();
		return ABBREVIATION_TO_NAMESPACE[lower] || short;
	},

	/**
	 * 翻译标签
	 * @param tag 标签名 (e.g. "full color")
	 * @param namespace 命名空间 (e.g. "language" or "l")
	 * @param dict 翻译字典
	 */
	translateTag(tag: string, namespace: string | undefined, dict: EMMAPI.EMMTranslationDict | undefined): string {
		if (!dict || !namespace) return tag;

		// 尝试获取全称命名空间
		const fullNamespace = this.getFullNamespace(namespace);

		// 查找该命名空间的翻译
		const nsDict = dict[fullNamespace];
		if (!nsDict) return tag;

		// 查找标签翻译
		const record = nsDict[tag];
		if (record && record.name) {
			return record.name;
		}

		return tag;
	}
};

