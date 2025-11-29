/**
 * EMM 模块统一导出
 */

// 类型
export type { EMMMetadataState, EMMMetadata, EMMCollectTag, EMMTranslationDict } from './types';

// 存储
export { loadSettings, saveSettings, STORAGE_KEYS } from './storage';
export type { EMMStorageSettings } from './storage';

// 翻译
export { emmTranslationStore } from './translation';

// 辅助函数
export { isCollectTag, isCollectTagHelper } from './helpers';
