/**
 * manualTagStore - 手动标签存储
 * 管理用户手动添加的标签，与 EMM 标签分开保存
 */

import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { SvelteMap } from 'svelte/reactivity';

/** 手动标签条目 */
export interface ManualTag {
	namespace: string;
	tag: string;
	timestamp: number;
}

/** 手动标签缓存 */
const manualTagCache = writable<SvelteMap<string, ManualTag[]>>(new SvelteMap());

/**
 * 规范化路径
 */
function normalizePath(path: string): string {
	return path.replace(/\//g, '\\');
}

/**
 * 获取单个路径的手动标签
 */
export async function getManualTags(path: string): Promise<ManualTag[]> {
	const key = normalizePath(path);
	
	// 先检查缓存
	const cache = get(manualTagCache);
	if (cache.has(key)) {
		return cache.get(key) || [];
	}
	
	try {
		const json = await invoke<string | null>('get_manual_tags', { key });
		const tags: ManualTag[] = json ? JSON.parse(json) : [];
		
		// 更新缓存
		manualTagCache.update(c => {
			c.set(key, tags);
			return c;
		});
		
		return tags;
	} catch (e) {
		console.error('[ManualTagStore] 获取手动标签失败:', e);
		return [];
	}
}

/**
 * 更新单个路径的手动标签
 */
export async function updateManualTags(path: string, tags: ManualTag[]): Promise<boolean> {
	const key = normalizePath(path);
	
	try {
		const json = tags.length > 0 ? JSON.stringify(tags) : null;
		await invoke('update_manual_tags', { key, manualTagsJson: json });
		
		// 更新缓存
		manualTagCache.update(c => {
			if (tags.length > 0) {
				c.set(key, tags);
			} else {
				c.delete(key);
			}
			return c;
		});
		
		return true;
	} catch (e) {
		console.error('[ManualTagStore] 更新手动标签失败:', e);
		return false;
	}
}

/**
 * 添加手动标签
 */
export async function addManualTag(path: string, namespace: string, tag: string): Promise<boolean> {
	const existingTags = await getManualTags(path);
	
	// 检查是否已存在
	const exists = existingTags.some(t => t.namespace === namespace && t.tag === tag);
	if (exists) {
		return true; // 已存在，视为成功
	}
	
	const newTag: ManualTag = {
		namespace,
		tag,
		timestamp: Date.now()
	};
	
	return updateManualTags(path, [...existingTags, newTag]);
}

/**
 * 删除手动标签
 */
export async function removeManualTag(path: string, namespace: string, tag: string): Promise<boolean> {
	const existingTags = await getManualTags(path);
	const filteredTags = existingTags.filter(t => !(t.namespace === namespace && t.tag === tag));
	
	if (filteredTags.length === existingTags.length) {
		return true; // 不存在，视为成功
	}
	
	return updateManualTags(path, filteredTags);
}

/**
 * 批量获取手动标签
 */
export async function batchGetManualTags(paths: string[]): Promise<SvelteMap<string, ManualTag[]>> {
	const keys = paths.map(normalizePath);
	const result = new SvelteMap<string, ManualTag[]>();
	
	// 先从缓存获取
	const cache = get(manualTagCache);
	const uncachedKeys: string[] = [];
	
	for (const key of keys) {
		if (cache.has(key)) {
			result.set(key, cache.get(key) || []);
		} else {
			uncachedKeys.push(key);
		}
	}
	
	if (uncachedKeys.length === 0) {
		return result;
	}
	
	try {
		const data = await invoke<Record<string, string | null>>('batch_get_manual_tags', { keys: uncachedKeys });
		
		manualTagCache.update(c => {
			for (const key of uncachedKeys) {
				const json = data[key];
				const tags: ManualTag[] = json ? JSON.parse(json) : [];
				result.set(key, tags);
				c.set(key, tags);
			}
			return c;
		});
	} catch (e) {
		console.error('[ManualTagStore] 批量获取手动标签失败:', e);
	}
	
	return result;
}

/**
 * 清除缓存
 */
export function clearManualTagCache(): void {
	manualTagCache.set(new SvelteMap());
}

/**
 * 同步获取手动标签（仅从缓存）
 */
export function getManualTagsSync(path: string): ManualTag[] | null {
	const key = normalizePath(path);
	const cache = get(manualTagCache);
	return cache.get(key) ?? null;
}

/**
 * 预定义的标签命名空间
 */
export const TAG_NAMESPACES = [
	'artist',
	'group',
	'parody',
	'character',
	'female',
	'male',
	'mixed',
	'other',
	'language',
	'reclass',
	'custom'  // 用户自定义
] as const;

export type TagNamespace = typeof TAG_NAMESPACES[number];

/**
 * 命名空间显示名称
 */
export const NAMESPACE_LABELS: Record<string, string> = {
	artist: '作者',
	group: '社团',
	parody: '原作',
	character: '角色',
	female: '女性',
	male: '男性',
	mixed: '混合',
	other: '其他',
	language: '语言',
	reclass: '重分类',
	custom: '自定义'
};

// 导出缓存 store 供订阅
export { manualTagCache };
