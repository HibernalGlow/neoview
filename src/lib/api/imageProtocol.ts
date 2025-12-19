/**
 * NeoView - Image Protocol API
 * 通过 Custom Protocol (neoview://) 加载图片
 * 绕过 invoke 序列化开销，直接传输二进制数据
 */

import { invoke } from '@tauri-apps/api/core';

/** 协议名称 */
const PROTOCOL_NAME = 'neoview';

/** 路径注册表缓存（前端侧） */
const pathHashCache = new Map<string, string>();

/**
 * 注册书籍路径并获取哈希
 * @param bookPath 书籍路径（压缩包或文件夹）
 * @returns 路径哈希
 */
export async function registerBookPath(bookPath: string): Promise<string> {
	// 检查缓存
	const cached = pathHashCache.get(bookPath);
	if (cached) {
		return cached;
	}

	// 调用后端注册
	const hash = await invoke<string>('register_book_path', { path: bookPath });
	pathHashCache.set(bookPath, hash);
	return hash;
}

/**
 * 获取压缩包内图片的 URL
 * Tauri 2 Custom Protocol 格式: scheme://path (无 host)
 * @param bookHash 书籍路径哈希（通过 registerBookPath 获取）
 * @param entryIndex 图片在压缩包中的索引
 * @returns Custom Protocol URL
 */
export function getArchiveImageUrl(bookHash: string, entryIndex: number): string {
	return `${PROTOCOL_NAME}://image/${bookHash}/${entryIndex}`;
}

/**
 * 获取文件图片的 URL
 * @param pathHash 文件路径哈希
 * @returns Custom Protocol URL
 */
export function getFileImageUrl(pathHash: string): string {
	return `${PROTOCOL_NAME}://file/${pathHash}`;
}

/**
 * 获取缩略图的 URL
 * @param key 缩略图键
 * @returns Custom Protocol URL
 */
export function getThumbUrl(key: string): string {
	return `${PROTOCOL_NAME}://thumb/${encodeURIComponent(key)}`;
}

/**
 * 便捷函数：直接通过书籍路径和索引获取图片 URL
 * 会自动注册路径并返回 URL
 * @param bookPath 书籍路径
 * @param entryIndex 图片索引
 * @returns Custom Protocol URL
 */
export async function getImageUrl(bookPath: string, entryIndex: number): Promise<string> {
	const hash = await registerBookPath(bookPath);
	return getArchiveImageUrl(hash, entryIndex);
}

/**
 * 清除路径哈希缓存
 */
export function clearPathHashCache(): void {
	pathHashCache.clear();
}

/**
 * 预加载图片（利用浏览器缓存）
 * @param urls 图片 URL 列表
 */
export function preloadImages(urls: string[]): void {
	urls.forEach((url) => {
		const img = new Image();
		img.src = url;
	});
}

/**
 * 批量预加载压缩包图片
 * @param bookHash 书籍哈希
 * @param startIndex 起始索引
 * @param count 预加载数量
 */
export function preloadArchiveImages(bookHash: string, startIndex: number, count: number): void {
	const urls: string[] = [];
	for (let i = 0; i < count; i++) {
		urls.push(getArchiveImageUrl(bookHash, startIndex + i));
	}
	preloadImages(urls);
}

/**
 * 检查 Custom Protocol 是否可用
 * @returns 是否可用
 */
export async function isProtocolAvailable(): Promise<boolean> {
	try {
		// 尝试一个简单的请求
		const response = await fetch(`${PROTOCOL_NAME}://health`);
		return response.ok;
	} catch {
		// 协议不可用时会抛出错误
		return false;
	}
}
