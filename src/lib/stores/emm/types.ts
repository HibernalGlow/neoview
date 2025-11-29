/**
 * EMM 元数据类型定义
 */

import type { EMMMetadata, EMMCollectTag, EMMTranslationDict } from '$lib/api/emm';

export interface EMMMetadataState {
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
	manualSettingPath?: string;
	// 全局开关：是否启用 EMM 数据读取
	enableEMM: boolean;
	// 文件列表标签显示模式
	fileListTagDisplayMode: 'all' | 'collect' | 'none';
	// 翻译字典文件路径
	translationDictPath?: string;
	// 翻译字典数据
	translationDict?: EMMTranslationDict;
	// 手动配置的翻译字典路径
	manualTranslationDictPath?: string;
}

export type { EMMMetadata, EMMCollectTag, EMMTranslationDict };
