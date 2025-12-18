/**
 * manualTagStore - 手动标签存储
 * 管理用户手动添加的标签，与 EMM 标签分开保存
 * 使用 localStorage 存储，支持快速查询和搜索
 */

import { writable, get } from 'svelte/store';
import { apiPost, apiGet } from '$lib/api/http-bridge';
import { SvelteMap } from 'svelte/reactivity';

const STORAGE_KEY = 'neoview-manual-tags';

/** 手动标签条目 */
export interface ManualTag {
	namespace: string;
	tag: string;
	timestamp: number;
}

/** 手动标签数据结构：路径 -> 标签列表 */
type ManualTagData = Record<string, ManualTag[]>;

/** 手动标签存储 */
const manualTagStore = writable<ManualTagData>({});

/** 是否已从 localStorage 加载 */
let isLoaded = false;

/**
 * 规范化路径
 */
function normalizePath(path: string): string {
	return path.replace(/\//g, '\\');
}

/**
 * 从 localStorage 加载数据
 */
function loadFromStorage(): ManualTagData {
	if (isLoaded) return get(manualTagStore);
	
	try {
		const json = localStorage.getItem(STORAGE_KEY);
		const data: ManualTagData = json ? JSON.parse(json) : {};
		manualTagStore.set(data);
		isLoaded = true;
		console.log('[ManualTagStore] 从 localStorage 加载数据, 条目数:', Object.keys(data).length);
		return data;
	} catch (e) {
		console.error('[ManualTagStore] 加载失败:', e);
		return {};
	}
}

/**
 * 保存到 localStorage
 */
function saveToStorage(data: ManualTagData): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch (e) {
		console.error('[ManualTagStore] 保存失败:', e);
	}
}

/**
 * 同时保存到后端数据库（异步，不阻塞）
 */
async function syncToBackend(path: string, tags: ManualTag[]): Promise<void> {
	try {
		const key = normalizePath(path);
		const json = tags.length > 0 ? JSON.stringify(tags) : null;
		await invoke('update_manual_tags', { key, manualTagsJson: json });
	} catch (e) {
		console.debug('[ManualTagStore] 后端同步失败:', e);
	}
}

/**
 * 获取单个路径的手动标签
 */
export async function getManualTags(path: string): Promise<ManualTag[]> {
	const key = normalizePath(path);
	const data = loadFromStorage();
	return data[key] || [];
}

/**
 * 同步获取手动标签（仅从 localStorage）
 */
export function getManualTagsSync(path: string): ManualTag[] {
	const key = normalizePath(path);
	const data = loadFromStorage();
	return data[key] || [];
}

/**
 * 更新单个路径的手动标签
 */
export async function updateManualTags(path: string, tags: ManualTag[]): Promise<boolean> {
	const key = normalizePath(path);
	
	manualTagStore.update(data => {
		if (tags.length > 0) {
			data[key] = tags;
		} else {
			delete data[key];
		}
		saveToStorage(data);
		return data;
	});
	
	// 异步同步到后端
	syncToBackend(path, tags);
	
	return true;
}

/**
 * 添加手动标签
 */
export async function addManualTag(path: string, namespace: string, tag: string): Promise<boolean> {
	const existingTags = await getManualTags(path);
	
	// 检查是否已存在
	const exists = existingTags.some(t => t.namespace === namespace && t.tag === tag);
	if (exists) {
		return true;
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
		return true;
	}
	
	return updateManualTags(path, filteredTags);
}

/**
 * 获取所有手动标签数据
 */
export function getAllManualTags(): ManualTagData {
	return loadFromStorage();
}

/**
 * 按标签搜索路径
 * @param namespace 命名空间（可选，不指定则搜索所有）
 * @param tag 标签名
 * @returns 匹配的路径列表
 */
export function searchByManualTag(namespace: string | null, tag: string): string[] {
	const data = loadFromStorage();
	const results: string[] = [];
	const tagLower = tag.toLowerCase();
	
	for (const [path, tags] of Object.entries(data)) {
		const matched = tags.some(t => {
			const tagMatch = t.tag.toLowerCase().includes(tagLower);
			const nsMatch = namespace ? t.namespace === namespace : true;
			return tagMatch && nsMatch;
		});
		if (matched) {
			results.push(path);
		}
	}
	
	return results;
}

/**
 * 获取所有唯一的手动标签（用于自动完成）
 */
export function getAllUniqueManualTags(): Array<{ namespace: string; tag: string; count: number }> {
	const data = loadFromStorage();
	const tagMap = new SvelteMap<string, { namespace: string; tag: string; count: number }>();
	
	for (const tags of Object.values(data)) {
		for (const t of tags) {
			const key = `${t.namespace}:${t.tag}`;
			const existing = tagMap.get(key);
			if (existing) {
				existing.count++;
			} else {
				tagMap.set(key, { namespace: t.namespace, tag: t.tag, count: 1 });
			}
		}
	}
	
	return Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
}

/**
 * 清除所有手动标签
 */
export function clearAllManualTags(): void {
	manualTagStore.set({});
	localStorage.removeItem(STORAGE_KEY);
	isLoaded = false;
}

/**
 * 导出手动标签数据
 */
export function exportManualTags(): string {
	return JSON.stringify(loadFromStorage(), null, 2);
}

/**
 * 导入手动标签数据
 */
export function importManualTags(json: string): boolean {
	try {
		const data: ManualTagData = JSON.parse(json);
		manualTagStore.set(data);
		saveToStorage(data);
		isLoaded = true;
		return true;
	} catch (e) {
		console.error('[ManualTagStore] 导入失败:', e);
		return false;
	}
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

// 导出 store 供订阅
export { manualTagStore };
