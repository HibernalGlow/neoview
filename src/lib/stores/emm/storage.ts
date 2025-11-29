/**
 * EMM 配置存储管理
 * 负责从 localStorage 加载/保存配置
 */

export const STORAGE_KEYS = {
	DB_PATHS: 'neoview-emm-database-paths',
	TRANSLATION_DB_PATH: 'neoview-emm-translation-db-path',
	SETTING_PATH: 'neoview-emm-setting-path',
	TRANSLATION_DICT_PATH: 'neoview-emm-translation-dict-path',
	ENABLE_EMM: 'neoview-emm-enable',
	FILE_LIST_TAG_MODE: 'neoview-emm-file-list-tag-mode',
	DEFAULT_RATING: 'neoview-emm-default-rating'
} as const;

/** 默认评分值（用于无评分时的排序） */
export const DEFAULT_RATING_VALUE = 4.6;

export interface EMMStorageSettings {
	databasePaths: string[];
	translationDbPath?: string;
	settingPath?: string;
	translationDictPath?: string;
	enableEMM: boolean;
	fileListTagDisplayMode: 'all' | 'collect' | 'none';
	defaultRating: number;
}

/**
 * 从 localStorage 加载配置
 */
export function loadSettings(): EMMStorageSettings {
	try {
		const dbPathsStr = localStorage.getItem(STORAGE_KEYS.DB_PATHS);
		const translationDbPathStr = localStorage.getItem(STORAGE_KEYS.TRANSLATION_DB_PATH);
		const settingPathStr = localStorage.getItem(STORAGE_KEYS.SETTING_PATH);
		const translationDictPathStr = localStorage.getItem(STORAGE_KEYS.TRANSLATION_DICT_PATH);
		const enableEMMStr = localStorage.getItem(STORAGE_KEYS.ENABLE_EMM);
		const fileListTagModeStr = localStorage.getItem(STORAGE_KEYS.FILE_LIST_TAG_MODE);
		const defaultRatingStr = localStorage.getItem(STORAGE_KEYS.DEFAULT_RATING);

		return {
			databasePaths: dbPathsStr ? JSON.parse(dbPathsStr) : [],
			translationDbPath: translationDbPathStr || undefined,
			settingPath: settingPathStr || undefined,
			translationDictPath: translationDictPathStr || undefined,
			enableEMM: enableEMMStr !== 'false', // 默认为 true
			fileListTagDisplayMode: (fileListTagModeStr as 'all' | 'collect' | 'none') || 'collect',
			defaultRating: defaultRatingStr ? parseFloat(defaultRatingStr) : DEFAULT_RATING_VALUE
		};
	} catch (e) {
		console.error('加载 EMM 配置失败:', e);
		return {
			databasePaths: [],
			enableEMM: true,
			fileListTagDisplayMode: 'collect',
			defaultRating: DEFAULT_RATING_VALUE
		};
	}
}

/**
 * 保存配置到 localStorage
 */
export function saveSettings(
	databasePaths: string[],
	translationDbPath?: string,
	settingPath?: string,
	translationDictPath?: string,
	enableEMM?: boolean,
	fileListTagDisplayMode?: 'all' | 'collect' | 'none',
	defaultRating?: number
): void {
	try {
		localStorage.setItem(STORAGE_KEYS.DB_PATHS, JSON.stringify(databasePaths));
		
		if (translationDbPath) {
			localStorage.setItem(STORAGE_KEYS.TRANSLATION_DB_PATH, translationDbPath);
		} else {
			localStorage.removeItem(STORAGE_KEYS.TRANSLATION_DB_PATH);
		}
		
		if (settingPath) {
			localStorage.setItem(STORAGE_KEYS.SETTING_PATH, settingPath);
		} else {
			localStorage.removeItem(STORAGE_KEYS.SETTING_PATH);
		}
		
		if (translationDictPath) {
			localStorage.setItem(STORAGE_KEYS.TRANSLATION_DICT_PATH, translationDictPath);
		} else {
			localStorage.removeItem(STORAGE_KEYS.TRANSLATION_DICT_PATH);
		}
		
		if (enableEMM !== undefined) {
			localStorage.setItem(STORAGE_KEYS.ENABLE_EMM, String(enableEMM));
		}
		
		if (fileListTagDisplayMode) {
			localStorage.setItem(STORAGE_KEYS.FILE_LIST_TAG_MODE, fileListTagDisplayMode);
		}
		
		if (defaultRating !== undefined) {
			localStorage.setItem(STORAGE_KEYS.DEFAULT_RATING, String(defaultRating));
		}
	} catch (e) {
		console.error('保存 EMM 配置失败:', e);
	}
}

/**
 * 仅保存默认评分
 */
export function saveDefaultRating(rating: number): void {
	try {
		localStorage.setItem(STORAGE_KEYS.DEFAULT_RATING, String(rating));
	} catch (e) {
		console.error('保存默认评分失败:', e);
	}
}

/**
 * 获取默认评分
 */
export function getDefaultRating(): number {
	try {
		const str = localStorage.getItem(STORAGE_KEYS.DEFAULT_RATING);
		return str ? parseFloat(str) : DEFAULT_RATING_VALUE;
	} catch {
		return DEFAULT_RATING_VALUE;
	}
}
