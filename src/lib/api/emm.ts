/**
 * EMM Metadata API
 * 读取 exhentai-manga-manager 的元数据
 */

import { invoke } from '@tauri-apps/api/core';

export interface EMMMetadata {
	hash: string;
	translated_title?: string; // 译名
	tags: Record<string, string[]>; // 分类 -> 标签列表
	title?: string;
	title_jpn?: string;
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
	return await invoke<EMMMetadata | null>('load_emm_metadata', { 
		dbPath, 
		hash,
		translationDbPath: translationDbPath || null
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
	return await invoke<EMMMetadata | null>('load_emm_metadata_by_path', { 
		dbPath, 
		filePath,
		translationDbPath: translationDbPath || null
	});
}

/**
 * 加载收藏标签配置
 */
export async function loadEMMCollectTags(settingPath: string): Promise<EMMCollectTag[]> {
	return await invoke<EMMCollectTag[]>('load_emm_collect_tags', { settingPath });
}

/**
 * 查找 EMM 主数据库路径（不包括 translations.db）
 */
export async function findEMMDatabases(): Promise<string[]> {
	return await invoke<string[]>('find_emm_databases');
}

/**
 * 查找 EMM 翻译数据库路径
 */
export async function findEMMTranslationDatabase(): Promise<string | null> {
	return await invoke<string | null>('find_emm_translation_database');
}

/**
 * 查找 EMM 设置文件路径
 */
export async function findEMMSettingFile(): Promise<string | null> {
	return await invoke<string | null>('find_emm_setting_file');
}

