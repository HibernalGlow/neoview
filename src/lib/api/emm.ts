/**
 * EMM Metadata API
 * 读取 exhentai-manga-manager 的元数据
 * 全面使用 Python HTTP API
 */

import { apiGet, apiPost } from './http-bridge';

export interface EMMMetadata {
	hash: string;
	translated_title?: string; // 译名
	tags: Record<string, string[]>; // 分类 -> 标签列表
	title?: string;
	title_jpn?: string;
	// 以下字段对应 mangas 表的主要列，用于在前端完整展示原始记录
	rating?: number; // rating (FLOAT)
	id?: string;
	cover_path?: string; // coverPath
	filepath?: string;
	type?: string;
	page_count?: number; // pageCount
	bundle_size?: number; // bundleSize
	mtime?: string;
	cover_hash?: string; // coverHash
	status?: string;
	date?: number;
	filecount?: number;
	posted?: number;
	filesize?: number;
	category?: string;
	url?: string;
	mark?: number;
	hidden_book?: number; // hiddenBook
	read_count?: number; // readCount
	exist?: number;
	created_at?: string;
	updated_at?: string;
}

export interface EMMCollectTag {
	id: string;
	letter: string; // 分类字母
	tag: string;   // 标签名
	color: string; // 颜色
	display: string; // 显示格式 "分类:标签"
}

/**
 * 通过 hash 加载 EMM 元数据
 */
export async function loadEMMMetadata(
	dbPath: string,
	hash: string,
	translationDbPath?: string
): Promise<EMMMetadata | null> {
	return await apiPost<EMMMetadata | null>('/emm/metadata', {
		db_path: dbPath,
		hash,
		translation_db_path: translationDbPath || null
	});
}

/**
 * 通过文件路径加载 EMM 元数据
 */
export async function loadEMMMetadataByPath(
	dbPath: string,
	filePath: string,
	translationDbPath?: string
): Promise<EMMMetadata | null> {
	return await apiPost<EMMMetadata | null>('/emm/metadata-by-path', {
		db_path: dbPath,
		file_path: filePath,
		translation_db_path: translationDbPath || null
	});
}

/**
 * 加载收藏标签配置
 */
export async function loadEMMCollectTags(settingPath: string): Promise<EMMCollectTag[]> {
	return await apiGet<EMMCollectTag[]>('/emm/collect-tags', { setting_path: settingPath });
}

/**
 * 查找 EMM 主数据库路径（不包括 translations.db）
 */
export async function findEMMDatabases(): Promise<string[]> {
	return await apiGet<string[]>('/emm/databases');
}

/**
 * 查找 EMM 翻译数据库路径
 */
export async function findEMMTranslationDatabase(): Promise<string | null> {
	return await apiGet<string | null>('/emm/translation-database');
}

/**
 * 查找 EMM 设置文件路径
 */
export async function findEMMSettingFile(): Promise<string | null> {
	return await apiGet<string | null>('/emm/setting-file');
}


export interface EMMTranslationRecord {
	name?: string;
	intro?: string;
	description?: string;
}

// namespace -> key -> record
export type EMMTranslationDict = Record<string, Record<string, EMMTranslationRecord>>;

/**
 * 加载 EMM 翻译字典
 */
export async function loadEMMTranslationDict(filePath: string): Promise<EMMTranslationDict> {
	return await apiGet<EMMTranslationDict>('/emm/translation-dict', { file_path: filePath });
}

/**
 * 查找 EMM 翻译字典文件路径
 */
export async function findEMMTranslationFile(): Promise<string | null> {
	return await apiGet<string | null>('/emm/translation-file');
}

// ===== Rating Data API =====

export interface RatingData {
	rating?: number;
	tags?: string[];
	notes?: string;
}

/**
 * 更新评分数据
 */
export async function updateRatingData(path: string, data: RatingData): Promise<void> {
	await apiPost('/emm/rating', { path, ...data });
}

/**
 * 获取评分数据
 */
export async function getRatingData(path: string): Promise<RatingData | null> {
	return await apiGet<RatingData | null>('/emm/rating-data', { path });
}

/**
 * 批量获取评分数据
 */
export async function batchGetRatingData(paths: string[]): Promise<Record<string, RatingData>> {
	return await apiPost<Record<string, RatingData>>('/emm/rating-data/batch', { paths });
}

/**
 * 按前缀获取评分数据
 */
export async function getRatingDataByPrefix(prefix: string): Promise<Record<string, RatingData>> {
	return await apiGet<Record<string, RatingData>>('/emm/rating-data/prefix', { prefix });
}

// ===== Manual Tags API =====

/**
 * 更新手动标签
 */
export async function updateManualTags(path: string, tags: string[]): Promise<void> {
	await apiPost('/emm/manual-tags', { path, tags });
}

// ===== AI Translation API =====

/**
 * 保存 AI 翻译
 */
export async function saveAiTranslation(path: string, translation: string): Promise<void> {
	await apiPost('/emm/ai-translation', { path, translation });
}

/**
 * 获取 AI 翻译数量
 */
export async function getAiTranslationCount(): Promise<number> {
	return await apiGet<number>('/emm/ai-translation-count');
}

// ===== EMM JSON API =====

/**
 * 保存 EMM JSON
 */
export async function saveEmmJson(path: string, data: unknown): Promise<void> {
	await apiPost('/emm/save', { path, data });
}

/**
 * 获取 EMM JSON
 */
export async function getEmmJson(path: string): Promise<unknown | null> {
	return await apiGet<unknown | null>('/emm/json', { path });
}
