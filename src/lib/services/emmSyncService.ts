/**
 * EMM 同步服务
 * 将 EMM 数据库中的元数据同步到缩略图数据库的 emm_json 字段
 * 实现"一次读取，全部获取"的优化目标
 */

import { invoke } from '@tauri-apps/api/core';
import { writable, get } from 'svelte/store';
import * as EMMAPI from '$lib/api/emm';
import type { EMMMetadata, EMMCollectTag } from '$lib/api/emm';

// ==================== 类型定义 ====================

/** EMM 缓存条目（存储在 emm_json 中的数据结构） */
export interface EMMCacheEntry {
	// 基础信息
	hash?: string;
	title?: string;
	title_jpn?: string;
	translated_title?: string;

	// 标签（已处理：包含翻译和收藏信息）
	tags?: Array<{
		namespace: string;
		tag: string;
		translated?: string;
		isCollect?: boolean;
		collectColor?: string;
		collectDisplay?: string;
	}>;

	// 评分
	rating?: number;
	manual_rating?: number;
	folder_avg_rating?: number;

	// 其他元数据
	page_count?: number;
	category?: string;
	url?: string;
	filepath?: string;

	// 同步信息
	source_db?: string;
	synced_at?: string;
}

/** 四个配置文件的验证状态 */
export interface EMMConfigValidation {
	mainDatabase: { path: string; valid: boolean; error?: string };
	translationDatabase: { path: string; valid: boolean; error?: string };
	settingFile: { path: string; valid: boolean; error?: string };
	translationDict: { path: string; valid: boolean; error?: string };
}

/** 同步状态 */
export interface EMMSyncState {
	isValidating: boolean;
	isSyncing: boolean;
	validation: EMMConfigValidation | null;
	lastSyncTime: string | null;
	syncProgress: {
		total: number;
		current: number;
		phase: 'idle' | 'validating' | 'loading' | 'processing' | 'saving' | 'done' | 'error';
		message: string;
	};
	error: string | null;
}

// ==================== Store ====================

const initialState: EMMSyncState = {
	isValidating: false,
	isSyncing: false,
	validation: null,
	lastSyncTime: localStorage.getItem('neoview-emm-last-sync') || null,
	syncProgress: {
		total: 0,
		current: 0,
		phase: 'idle',
		message: ''
	},
	error: null
};

export const emmSyncStore = writable<EMMSyncState>(initialState);

// ==================== 验证函数 ====================

/** 验证四个配置文件 */
export async function validateEMMConfig(): Promise<EMMConfigValidation> {
	emmSyncStore.update(s => ({
		...s,
		isValidating: true,
		syncProgress: { ...s.syncProgress, phase: 'validating', message: '正在验证配置文件...' }
	}));

	try {
		// 获取当前配置路径
		const { emmMetadataStore } = await import('$lib/stores/emmMetadata.svelte');
		const mainDbPaths = emmMetadataStore.getDatabasePaths();
		const translationDbPath = emmMetadataStore.getTranslationDbPath();
		const settingPath = emmMetadataStore.getSettingPath();
		const translationDictPath = emmMetadataStore.getTranslationDictPath();

		const validation: EMMConfigValidation = {
			mainDatabase: {
				path: mainDbPaths[0] || '',
				valid: false,
				error: mainDbPaths.length === 0 ? '未配置主数据库路径' : undefined
			},
			translationDatabase: {
				path: translationDbPath || '',
				valid: false,
				error: !translationDbPath ? '未配置翻译数据库路径' : undefined
			},
			settingFile: {
				path: settingPath || '',
				valid: false,
				error: !settingPath ? '未配置设置文件路径' : undefined
			},
			translationDict: {
				path: translationDictPath || '',
				valid: false,
				error: !translationDictPath ? '未配置翻译字典路径' : undefined
			}
		};

		// 验证主数据库
		if (mainDbPaths.length > 0) {
			try {
				const exists = await invoke<boolean>('path_exists', { path: mainDbPaths[0] });
				validation.mainDatabase.valid = exists;
				if (!exists) validation.mainDatabase.error = '文件不存在';
			} catch (e) {
				validation.mainDatabase.error = `验证失败: ${e}`;
			}
		}

		// 验证翻译数据库
		if (translationDbPath) {
			try {
				const exists = await invoke<boolean>('path_exists', { path: translationDbPath });
				validation.translationDatabase.valid = exists;
				if (!exists) validation.translationDatabase.error = '文件不存在';
			} catch (e) {
				validation.translationDatabase.error = `验证失败: ${e}`;
			}
		}

		// 验证设置文件
		if (settingPath) {
			try {
				const exists = await invoke<boolean>('path_exists', { path: settingPath });
				validation.settingFile.valid = exists;
				if (!exists) validation.settingFile.error = '文件不存在';
			} catch (e) {
				validation.settingFile.error = `验证失败: ${e}`;
			}
		}

		// 验证翻译字典
		if (translationDictPath) {
			try {
				const exists = await invoke<boolean>('path_exists', { path: translationDictPath });
				validation.translationDict.valid = exists;
				if (!exists) validation.translationDict.error = '文件不存在';
			} catch (e) {
				validation.translationDict.error = `验证失败: ${e}`;
			}
		}

		emmSyncStore.update(s => ({
			...s,
			isValidating: false,
			validation,
			syncProgress: { ...s.syncProgress, phase: 'idle', message: '' }
		}));

		return validation;
	} catch (error) {
		emmSyncStore.update(s => ({
			...s,
			isValidating: false,
			error: `验证失败: ${error}`,
			syncProgress: { ...s.syncProgress, phase: 'error', message: `验证失败: ${error}` }
		}));
		throw error;
	}
}

/** 检查是否所有配置都有效 */
export function isAllConfigValid(validation: EMMConfigValidation): boolean {
	return (
		validation.mainDatabase.valid &&
		validation.translationDatabase.valid &&
		validation.settingFile.valid &&
		validation.translationDict.valid
	);
}

// ==================== 同步函数 ====================

/** 将 EMMMetadata 转换为 EMMCacheEntry */
function convertToEMMCacheEntry(
	metadata: EMMMetadata,
	collectTags: EMMCollectTag[],
	translationDict: EMMAPI.EMMTranslationDict | undefined,
	sourceDb: string
): EMMCacheEntry {
	// 创建收藏标签查找 Map
	const collectTagMap = new Map<string, EMMCollectTag>();
	for (const ct of collectTags) {
		const normalize = (s: string) => s.trim().toLowerCase();
		if (ct.id) collectTagMap.set(normalize(ct.id), ct);
		if (ct.display) collectTagMap.set(normalize(ct.display), ct);
		if (ct.tag) collectTagMap.set(normalize(ct.tag), ct);
		if (ct.letter && ct.tag) collectTagMap.set(normalize(`${ct.letter}:${ct.tag}`), ct);
	}

	// 处理标签（tags 是 Record<string, string[]> 格式）
	const processedTags: Array<{
		namespace: string;
		tag: string;
		translated?: string;
		isCollect?: boolean;
		collectColor?: string;
		collectDisplay?: string;
	}> = [];

	if (metadata.tags) {
		for (const [namespace, tagList] of Object.entries(metadata.tags)) {
			for (const tagName of tagList) {
				const fullTag = `${namespace}:${tagName}`.toLowerCase();
				const collectInfo = collectTagMap.get(fullTag) || collectTagMap.get(tagName.toLowerCase());

				// 查找翻译
				let translated: string | undefined;
				if (translationDict) {
					const nsData = translationDict[namespace];
					if (nsData && nsData[tagName]) {
						translated = nsData[tagName].name;
					}
				}

				processedTags.push({
					namespace,
					tag: tagName,
					translated,
					isCollect: !!collectInfo,
					collectColor: collectInfo?.color,
					collectDisplay: collectInfo?.display
				});
			}
		}
	}

	return {
		hash: metadata.hash,
		title: metadata.title,
		title_jpn: metadata.title_jpn,
		translated_title: metadata.translated_title,
		tags: processedTags,
		rating: metadata.rating,
		page_count: metadata.page_count,
		category: metadata.category,
		url: metadata.url,
		filepath: metadata.filepath,
		source_db: sourceDb,
		synced_at: new Date().toISOString()
	};
}

/** 并行处理辅助函数 */
async function processInParallel<T, R>(
	items: T[],
	processor: (item: T) => Promise<R | null>,
	concurrency: number
): Promise<R[]> {
	const results: R[] = [];
	let index = 0;

	async function worker() {
		while (index < items.length) {
			const currentIndex = index++;
			const item = items[currentIndex];
			try {
				const result = await processor(item);
				if (result !== null) {
					results.push(result);
				}
			} catch {
				// 忽略单个错误
			}
		}
	}

	const workers = Array(Math.min(concurrency, items.length))
		.fill(null)
		.map(() => worker());

	await Promise.all(workers);
	return results;
}

/** 执行完整同步（手动触发，优化版：并行 + rating 字段） */
export async function syncEMMToThumbnailDb(): Promise<{ success: boolean; count: number; error?: string }> {
	const state = get(emmSyncStore);

	// 防止重复同步
	if (state.isSyncing) {
		return { success: false, count: 0, error: '同步正在进行中' };
	}

	emmSyncStore.update(s => ({
		...s,
		isSyncing: true,
		error: null,
		syncProgress: { total: 0, current: 0, phase: 'validating', message: '验证配置...' }
	}));

	try {
		// 1. 验证配置
		const validation = await validateEMMConfig();
		if (!isAllConfigValid(validation)) {
			throw new Error('配置验证失败，请确保四个文件都已正确配置');
		}

		// 2. 获取所有缩略图键
		emmSyncStore.update(s => ({
			...s,
			syncProgress: { ...s.syncProgress, phase: 'loading', message: '获取缩略图列表...' }
		}));

		const thumbnailKeys = await invoke<string[]>('get_all_thumbnail_keys');
		const total = thumbnailKeys.length;

		emmSyncStore.update(s => ({
			...s,
			syncProgress: { total, current: 0, phase: 'loading', message: `找到 ${total} 个缩略图记录` }
		}));

		if (total === 0) {
			emmSyncStore.update(s => ({
				...s,
				isSyncing: false,
				syncProgress: { total: 0, current: 0, phase: 'done', message: '没有需要同步的记录' }
			}));
			return { success: true, count: 0 };
		}

		// 3. 加载 EMM 配置
		const { emmMetadataStore } = await import('$lib/stores/emmMetadata.svelte');
		const collectTags = emmMetadataStore.getCollectTags();
		const translationDict = emmMetadataStore.getTranslationDict();
		const mainDbPaths = emmMetadataStore.getDatabasePaths();
		const translationDbPath = emmMetadataStore.getTranslationDbPath();

		// 4. 并行批量处理（优化版）
		const BATCH_SIZE = 50;
		const CONCURRENCY = 8; // 并行数
		// entries: [key, emmJson, rating, manualRating, folderAvgRating]
		const entries: [string, string, number | null, number | null, number | null][] = [];
		let processed = 0;

		// 处理单个路径的函数
		const processPath = async (pathKey: string): Promise<[string, string, number | null, number | null, number | null] | null> => {
			for (const dbPath of mainDbPaths) {
				try {
					const metadata = await EMMAPI.loadEMMMetadataByPath(dbPath, pathKey, translationDbPath);
					if (metadata) {
						const cacheEntry = convertToEMMCacheEntry(metadata, collectTags, translationDict, dbPath);
						return [
							pathKey,
							JSON.stringify(cacheEntry),
							metadata.rating ?? null,
							cacheEntry.manual_rating ?? null,
							cacheEntry.folder_avg_rating ?? null
						];
					}
				} catch {
					// 继续尝试下一个数据库
				}
			}
			return null;
		};

		// 分批并行处理
		for (let i = 0; i < thumbnailKeys.length; i += BATCH_SIZE) {
			const batch = thumbnailKeys.slice(i, i + BATCH_SIZE);

			emmSyncStore.update(s => ({
				...s,
				syncProgress: {
					...s.syncProgress,
					phase: 'processing',
					current: processed,
					message: `并行处理中... ${processed}/${total}`
				}
			}));

			// 并行处理批次
			const batchResults = await processInParallel(batch, processPath, CONCURRENCY);
			entries.push(...batchResults);
			processed += batch.length;
		}

		// 5. 批量保存
		emmSyncStore.update(s => ({
			...s,
			syncProgress: {
				...s.syncProgress,
				phase: 'saving',
				current: total,
				message: `保存 ${entries.length} 条记录...`
			}
		}));

		if (entries.length > 0) {
			// 使用优化版保存（同时保存 emm_json 和独立 rating 字段）
			await invoke<number>('batch_save_emm_with_rating', { entries });
		}

		// 6. 完成
		const syncTime = new Date().toISOString();
		localStorage.setItem('neoview-emm-last-sync', syncTime);

		emmSyncStore.update(s => ({
			...s,
			isSyncing: false,
			lastSyncTime: syncTime,
			syncProgress: {
				total,
				current: total,
				phase: 'done',
				message: `同步完成：${entries.length} 条记录`
			}
		}));

		return { success: true, count: entries.length };
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		emmSyncStore.update(s => ({
			...s,
			isSyncing: false,
			error: errorMsg,
			syncProgress: { ...s.syncProgress, phase: 'error', message: errorMsg }
		}));
		return { success: false, count: 0, error: errorMsg };
	}
}

/** 增量同步（只更新 emm_json 为空的条目） */
export async function syncEMMIncremental(): Promise<{ success: boolean; count: number; error?: string }> {
	const state = get(emmSyncStore);

	if (state.isSyncing) {
		return { success: false, count: 0, error: '同步正在进行中' };
	}

	emmSyncStore.update(s => ({
		...s,
		isSyncing: true,
		error: null,
		syncProgress: { total: 0, current: 0, phase: 'loading', message: '获取未同步条目...' }
	}));

	try {
		// 验证配置
		const validation = await validateEMMConfig();
		if (!isAllConfigValid(validation)) {
			throw new Error('配置验证失败，请确保四个文件都已正确配置');
		}

		// 获取 emm_json 为空的键
		const thumbnailKeys = await invoke<string[]>('get_keys_without_emm_json');
		const total = thumbnailKeys.length;

		emmSyncStore.update(s => ({
			...s,
			syncProgress: { total, current: 0, phase: 'loading', message: `找到 ${total} 个未同步条目` }
		}));

		if (total === 0) {
			emmSyncStore.update(s => ({
				...s,
				isSyncing: false,
				syncProgress: { total: 0, current: 0, phase: 'done', message: '所有条目已同步' }
			}));
			return { success: true, count: 0 };
		}

		// 加载配置
		const { emmMetadataStore } = await import('$lib/stores/emmMetadata.svelte');
		const collectTags = emmMetadataStore.getCollectTags();
		const translationDict = emmMetadataStore.getTranslationDict();
		const mainDbPaths = emmMetadataStore.getDatabasePaths();
		const translationDbPath = emmMetadataStore.getTranslationDbPath();

		// 并行批量处理
		const BATCH_SIZE = 50;
		const CONCURRENCY = 8;
		const entries: [string, string, number | null, number | null, number | null][] = [];
		let processed = 0;

		const processPath = async (pathKey: string): Promise<[string, string, number | null, number | null, number | null] | null> => {
			for (const dbPath of mainDbPaths) {
				try {
					const metadata = await EMMAPI.loadEMMMetadataByPath(dbPath, pathKey, translationDbPath);
					if (metadata) {
						const cacheEntry = convertToEMMCacheEntry(metadata, collectTags, translationDict, dbPath);
						return [
							pathKey,
							JSON.stringify(cacheEntry),
							metadata.rating ?? null,
							cacheEntry.manual_rating ?? null,
							cacheEntry.folder_avg_rating ?? null
						];
					}
				} catch {
					// 继续尝试下一个数据库
				}
			}
			return null;
		};

		for (let i = 0; i < thumbnailKeys.length; i += BATCH_SIZE) {
			const batch = thumbnailKeys.slice(i, i + BATCH_SIZE);

			emmSyncStore.update(s => ({
				...s,
				syncProgress: {
					...s.syncProgress,
					phase: 'processing',
					current: processed,
					message: `增量同步中... ${processed}/${total}`
				}
			}));

			const batchResults = await processInParallel(batch, processPath, CONCURRENCY);
			entries.push(...batchResults);
			processed += batch.length;
		}

		// 保存
		emmSyncStore.update(s => ({
			...s,
			syncProgress: {
				...s.syncProgress,
				phase: 'saving',
				current: total,
				message: `保存 ${entries.length} 条记录...`
			}
		}));

		if (entries.length > 0) {
			await invoke<number>('batch_save_emm_with_rating', { entries });
		}

		emmSyncStore.update(s => ({
			...s,
			isSyncing: false,
			syncProgress: {
				total,
				current: total,
				phase: 'done',
				message: `增量同步完成：${entries.length} 条记录`
			}
		}));

		return { success: true, count: entries.length };
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		emmSyncStore.update(s => ({
			...s,
			isSyncing: false,
			error: errorMsg,
			syncProgress: { ...s.syncProgress, phase: 'error', message: errorMsg }
		}));
		return { success: false, count: 0, error: errorMsg };
	}
}

/** 增量同步（指定目录） */
export async function syncEMMForDirectory(
	dirPath: string
): Promise<{ success: boolean; count: number; error?: string }> {
	const state = get(emmSyncStore);

	if (state.isSyncing) {
		return { success: false, count: 0, error: '同步正在进行中' };
	}

	emmSyncStore.update(s => ({
		...s,
		isSyncing: true,
		error: null,
		syncProgress: { total: 0, current: 0, phase: 'loading', message: `扫描目录: ${dirPath}` }
	}));

	try {
		// 获取目录下的缩略图键
		const thumbnailKeys = await invoke<string[]>('get_thumbnail_keys_by_prefix', { prefix: dirPath });
		const total = thumbnailKeys.length;

		if (total === 0) {
			emmSyncStore.update(s => ({
				...s,
				isSyncing: false,
				syncProgress: { total: 0, current: 0, phase: 'done', message: '没有需要同步的记录' }
			}));
			return { success: true, count: 0 };
		}

		// 复用完整同步的逻辑...
		const { emmMetadataStore } = await import('$lib/stores/emmMetadata.svelte');
		const collectTags = emmMetadataStore.getCollectTags();
		const translationDict = emmMetadataStore.getTranslationDict();
		const mainDbPaths = emmMetadataStore.getDatabasePaths();
		const translationDbPath = emmMetadataStore.getTranslationDbPath();

		const entries: [string, string][] = [];

		for (let i = 0; i < thumbnailKeys.length; i++) {
			const pathKey = thumbnailKeys[i];
			emmSyncStore.update(s => ({
				...s,
				syncProgress: {
					total,
					current: i,
					phase: 'processing',
					message: `处理中... ${i + 1}/${total}`
				}
			}));

			try {
				for (const dbPath of mainDbPaths) {
					const metadata = await EMMAPI.loadEMMMetadataByPath(dbPath, pathKey, translationDbPath);
					if (metadata) {
						const cacheEntry = convertToEMMCacheEntry(metadata, collectTags, translationDict, dbPath);
						entries.push([pathKey, JSON.stringify(cacheEntry)]);
						break;
					}
				}
			} catch (e) {
				console.debug(`[EMMSync] 加载 ${pathKey} 失败:`, e);
			}
		}

		if (entries.length > 0) {
			await invoke<number>('batch_save_emm_json', { entries });
		}

		emmSyncStore.update(s => ({
			...s,
			isSyncing: false,
			syncProgress: {
				total,
				current: total,
				phase: 'done',
				message: `同步完成：${entries.length} 条记录`
			}
		}));

		return { success: true, count: entries.length };
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		emmSyncStore.update(s => ({
			...s,
			isSyncing: false,
			error: errorMsg,
			syncProgress: { ...s.syncProgress, phase: 'error', message: errorMsg }
		}));
		return { success: false, count: 0, error: errorMsg };
	}
}

// ==================== 读取函数 ====================

/** 从缩略图数据库获取 EMM 缓存 */
export async function getEMMCache(pathKey: string): Promise<EMMCacheEntry | null> {
	try {
		const json = await invoke<string | null>('get_emm_json', { path: pathKey });
		if (json) {
			return JSON.parse(json) as EMMCacheEntry;
		}
		return null;
	} catch (e) {
		console.error('[EMMSync] 获取 EMM 缓存失败:', pathKey, e);
		return null;
	}
}

/** 批量获取 EMM 缓存 */
export async function batchGetEMMCache(pathKeys: string[]): Promise<Map<string, EMMCacheEntry>> {
	const result = new Map<string, EMMCacheEntry>();
	try {
		const jsonMap = await invoke<Record<string, string>>('batch_get_emm_json', { paths: pathKeys });
		for (const [key, json] of Object.entries(jsonMap)) {
			try {
				result.set(key, JSON.parse(json) as EMMCacheEntry);
			} catch {
				// 忽略解析错误
			}
		}
	} catch (e) {
		console.error('[EMMSync] 批量获取 EMM 缓存失败:', e);
	}
	return result;
}

/** 保存单条 EMM 缓存（用于手动评分等） */
export async function saveEMMCache(pathKey: string, entry: EMMCacheEntry): Promise<boolean> {
	try {
		entry.synced_at = new Date().toISOString();
		await invoke('save_emm_json', { path: pathKey, emmJson: JSON.stringify(entry) });
		return true;
	} catch (e) {
		console.error('[EMMSync] 保存 EMM 缓存失败:', pathKey, e);
		return false;
	}
}

/** 更新手动评分 */
export async function updateManualRating(pathKey: string, rating: number): Promise<boolean> {
	try {
		// 先获取现有缓存
		let entry = await getEMMCache(pathKey);
		if (!entry) {
			entry = { manual_rating: rating };
		} else {
			entry.manual_rating = rating;
		}
		return await saveEMMCache(pathKey, entry);
	} catch (e) {
		console.error('[EMMSync] 更新手动评分失败:', pathKey, e);
		return false;
	}
}

/** 更新文件夹平均评分 */
export async function updateFolderAvgRating(pathKey: string, avgRating: number): Promise<boolean> {
	try {
		let entry = await getEMMCache(pathKey);
		if (!entry) {
			entry = { folder_avg_rating: avgRating };
		} else {
			entry.folder_avg_rating = avgRating;
		}
		return await saveEMMCache(pathKey, entry);
	} catch (e) {
		console.error('[EMMSync] 更新文件夹评分失败:', pathKey, e);
		return false;
	}
}
