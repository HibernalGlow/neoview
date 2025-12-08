/**
 * AI 翻译服务 Store
 * 管理标题翻译功能的状态和缓存
 */

import { writable, get } from 'svelte/store';

// 翻译服务类型
export type TranslationServiceType = 'libretranslate' | 'ollama' | 'disabled';

// 翻译服务配置
export interface TranslationServiceConfig {
	type: TranslationServiceType;
	// LibreTranslate 配置
	libreTranslateUrl: string;
	libreTranslateApiKey: string;
	// Ollama 配置
	ollamaUrl: string;
	ollamaModel: string;
	// Ollama prompt 模板（支持变量：{text}, {source_lang}, {target_lang}）
	ollamaPromptTemplate: string;
	// 通用配置
	sourceLanguage: string; // 'auto' | 'ja' | 'en' | ...
	targetLanguage: string; // 'zh' | 'en' | ...
	enabled: boolean;
	autoTranslate: boolean; // 自动翻译无 EMM 翻译的标题
	// 标题裁剪正则（去除不需要翻译的部分）- 旧版兼容
	titleCleanupPatterns: string[]; // 例如: ["\\[.*?\\]", "\\(.*?\\)"]
	// 按文件类型区分的裁剪规则 - 旧版兼容
	titleCleanupByType: Record<string, string[]>;
	// 新版裁剪规则（每个规则单独配置）
	cleanupRules: CleanupRule[];
	// 当前使用的预设名称
	activePreset: string;
}

// 文件类型分类
export const FILE_TYPE_GROUPS = {
	folder: { label: '文件夹', extensions: ['folder'], icon: '📁' },
	archive: { label: '压缩包', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'cbz', 'cbr', 'cb7'], icon: '📦' },
	image: { label: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'jxl', 'avif'], icon: '🖼️' },
	video: { label: '视频', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'], icon: '🎬' },
} as const;

export type FileTypeKey = keyof typeof FILE_TYPE_GROUPS | 'all';

// 单个裁剪规则配置
export interface CleanupRule {
	id: string;
	pattern: string; // 正则表达式
	enabled: boolean;
	applyTo: FileTypeKey[]; // 生效的文件类型，'all' 表示全部
	description?: string; // 可选描述
}

// 翻译预设
export interface TranslationPreset {
	id: string;
	name: string;
	description?: string;
	type: TranslationServiceType;
	// Ollama 配置
	ollamaUrl?: string;
	ollamaModel?: string;
	ollamaPromptTemplate?: string;
	// LibreTranslate 配置
	libreTranslateUrl?: string;
	// 语言配置
	sourceLanguage?: string;
	targetLanguage?: string;
	titleCleanupPatterns?: string[];
}

// 内置预设
export const BUILTIN_PRESETS: TranslationPreset[] = [
	{
		id: 'default-ollama',
		name: 'Ollama 默认',
		description: '使用 Ollama 本地模型翻译',
		type: 'ollama',
		ollamaUrl: 'http://localhost:11434',
		ollamaModel: 'qwen2.5:7b',
		ollamaPromptTemplate: '请将以下{source_lang}文本翻译成{target_lang}，只返回翻译结果，不要解释：\n{text}',
		sourceLanguage: 'auto',
		targetLanguage: 'zh',
		titleCleanupPatterns: ['\\[.*?\\]', '\\(.*?\\)'],
	},
	{
		id: 'ollama-concise',
		name: 'Ollama 简洁',
		description: '简洁翻译模式',
		type: 'ollama',
		ollamaPromptTemplate: '翻译成{target_lang}：{text}',
	},
	{
		id: 'default-libretranslate',
		name: 'LibreTranslate 默认',
		description: '使用 LibreTranslate 本地服务',
		type: 'libretranslate',
		libreTranslateUrl: 'http://localhost:5000',
		sourceLanguage: 'auto',
		targetLanguage: 'zh',
	},
];

// 翻译缓存条目
export interface TranslationCacheEntry {
	original: string;
	translated: string;
	timestamp: number;
	service: TranslationServiceType;
}

// Store 状态
export interface AITranslationState {
	config: TranslationServiceConfig;
	cache: Map<string, TranslationCacheEntry>;
	isTranslating: boolean;
	lastError: string | null;
	stats: {
		totalTranslations: number;
		cacheHits: number;
		apiCalls: number;
	};
}

const STORAGE_KEY = 'neoview-ai-translation';
const CACHE_STORAGE_KEY = 'neoview-ai-translation-cache';

// 默认配置
const defaultConfig: TranslationServiceConfig = {
	type: 'disabled',
	libreTranslateUrl: 'http://localhost:5000',
	libreTranslateApiKey: '',
	ollamaUrl: 'http://localhost:11434',
	ollamaModel: 'qwen2.5:7b',
	ollamaPromptTemplate: '请将以下{source_lang}文本翻译成{target_lang}，只返回翻译结果，不要解释：\n{text}',
	sourceLanguage: 'auto',
	targetLanguage: 'zh',
	enabled: false,
	autoTranslate: true,
	// 默认裁剪方括号和圆括号内的内容
	titleCleanupPatterns: ['\\[.*?\\]', '\\(.*?\\)'],
	// 按类型区分的裁剪规则（旧版兼容）
	titleCleanupByType: {},
	// 新版裁剪规则
	cleanupRules: [
		{
			id: 'default-all-brackets',
			pattern: '\\s*(\\[[^\\]]*\\]|\\([^\\)]*\\)|【[^】]*】|（[^）]*）)\\s*',
			enabled: true,
			applyTo: ['archive'], // 只对压缩包生效（文件夹保留画师名）
			description: '去除各类括号内容（中英文）',
		},
	],
	activePreset: 'custom',
};

// 从 localStorage 加载配置
function loadConfig(): TranslationServiceConfig {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return { ...defaultConfig, ...parsed };
		}
	} catch (e) {
		console.error('[AITranslation] 加载配置失败:', e);
	}
	return defaultConfig;
}

// 保存配置到 localStorage
function saveConfig(config: TranslationServiceConfig) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	} catch (e) {
		console.error('[AITranslation] 保存配置失败:', e);
	}
}

// 从 localStorage 加载缓存
function loadCache(): Map<string, TranslationCacheEntry> {
	try {
		const stored = localStorage.getItem(CACHE_STORAGE_KEY);
		if (stored) {
			const entries = JSON.parse(stored) as [string, TranslationCacheEntry][];
			return new Map(entries);
		}
	} catch (e) {
		console.error('[AITranslation] 加载缓存失败:', e);
	}
	return new Map();
}

// 保存缓存到 localStorage
function saveCache(cache: Map<string, TranslationCacheEntry>) {
	try {
		const entries = Array.from(cache.entries());
		// 限制缓存大小（最多 1000 条）
		const limited = entries.slice(-1000);
		localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(limited));
	} catch (e) {
		console.error('[AITranslation] 保存缓存失败:', e);
	}
}

// 创建 store
function createAITranslationStore() {
	const initialState: AITranslationState = {
		config: loadConfig(),
		cache: loadCache(),
		isTranslating: false,
		lastError: null,
		stats: {
			totalTranslations: 0,
			cacheHits: 0,
			apiCalls: 0,
		},
	};

	const { subscribe, update } = writable<AITranslationState>(initialState);

	return {
		subscribe,

		// 更新配置
		updateConfig(partial: Partial<TranslationServiceConfig>) {
			update((state) => {
				const newConfig = { ...state.config, ...partial };
				saveConfig(newConfig);
				return { ...state, config: newConfig };
			});
		},

		// 设置服务类型
		setServiceType(type: TranslationServiceType) {
			update((state) => {
				const newConfig = { ...state.config, type, enabled: type !== 'disabled' };
				saveConfig(newConfig);
				return { ...state, config: newConfig };
			});
		},

		// 启用/禁用
		setEnabled(enabled: boolean) {
			update((state) => {
				const newConfig = { ...state.config, enabled };
				if (!enabled) {
					newConfig.type = 'disabled';
				}
				saveConfig(newConfig);
				return { ...state, config: newConfig };
			});
		},

		// 获取缓存的翻译
		getCachedTranslation(text: string): string | null {
			const state = get({ subscribe });
			const entry = state.cache.get(text);
			if (entry) {
				update((s) => ({
					...s,
					stats: { ...s.stats, cacheHits: s.stats.cacheHits + 1 },
				}));
				return entry.translated;
			}
			return null;
		},

		// 添加翻译到缓存
		addToCache(original: string, translated: string, service: TranslationServiceType) {
			update((state) => {
				const newCache = new Map(state.cache);
				newCache.set(original, {
					original,
					translated,
					timestamp: Date.now(),
					service,
				});
				saveCache(newCache);
				return {
					...state,
					cache: newCache,
					stats: { ...state.stats, totalTranslations: state.stats.totalTranslations + 1 },
				};
			});
		},

		// 清空缓存
		clearCache() {
			update((state) => {
				const newCache = new Map();
				saveCache(newCache);
				return { ...state, cache: newCache };
			});
		},

		// 设置翻译中状态
		setTranslating(isTranslating: boolean) {
			update((state) => ({ ...state, isTranslating }));
		},

		// 设置错误
		setError(error: string | null) {
			update((state) => ({ ...state, lastError: error }));
		},

		// 增加 API 调用计数
		incrementApiCalls() {
			update((state) => ({
				...state,
				stats: { ...state.stats, apiCalls: state.stats.apiCalls + 1 },
			}));
		},

		// 获取当前配置
		getConfig(): TranslationServiceConfig {
			return get({ subscribe }).config;
		},

		// 获取缓存统计
		getCacheStats() {
			const state = get({ subscribe });
			return {
				size: state.cache.size,
				...state.stats,
			};
		},

		// 导出缓存
		exportCache(): TranslationCacheEntry[] {
			const state = get({ subscribe });
			return Array.from(state.cache.values());
		},

		// 导入缓存
		importCache(entries: TranslationCacheEntry[]) {
			update((state) => {
				const newCache = new Map(state.cache);
				for (const entry of entries) {
					newCache.set(entry.original, entry);
				}
				saveCache(newCache);
				return { ...state, cache: newCache };
			});
		},
	};
}

export const aiTranslationStore = createAITranslationStore();
