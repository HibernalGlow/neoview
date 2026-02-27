/**
 * NeoView - Image Protocol API
 * 通过 Custom Protocol (neoview://) 加载图片
 * 绕过 invoke 序列化开销，直接传输二进制数据
 */

import { invoke } from '@tauri-apps/api/core';

/** 协议名称 */
const PROTOCOL_NAME = 'neoview';

let resolvedBaseUrl: string | null = null;

function isWindowsRuntime(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /windows/i.test(navigator.userAgent);
}

/** 
 * 获取基础协议 URL
 * 
 * 【性能与平台适配关键】
 * - Windows (WebView2): 自定义协议会映射到 Hostname。由于 tauri.conf.json 设置了 useHttpsScheme: false，
 *   必须使用 http://neoview.localhost 格式，否则会被浏览器拦截 (ERR_UNKNOWN_URL_SCHEME)。
 * - macOS/Linux: 保持传统的 neoview://localhost 格式。
 */
function getBaseUrlCandidates(): string[] {
	const windows = isWindowsRuntime();
	const windowsPreferred = [`http://${PROTOCOL_NAME}.localhost`, `${PROTOCOL_NAME}://localhost`];
	const unixPreferred = [`${PROTOCOL_NAME}://localhost`, `http://${PROTOCOL_NAME}.localhost`];

	if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
		return [`http://${PROTOCOL_NAME}.localhost`];
	}

	return windows ? windowsPreferred : unixPreferred;
}

function getBaseUrl(): string {
	if (resolvedBaseUrl) return resolvedBaseUrl;
	return getBaseUrlCandidates()[0];
}

async function probeProtocolBase(baseUrl: string): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 1200);
	try {
		const response = await fetch(`${baseUrl}/health`, {
			method: 'GET',
			cache: 'no-store',
			signal: controller.signal
		});
		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

export async function resolveProtocolBaseUrl(): Promise<string | null> {
	if (resolvedBaseUrl) return resolvedBaseUrl;
	for (const base of getBaseUrlCandidates()) {
		if (await probeProtocolBase(base)) {
			resolvedBaseUrl = base;
			return base;
		}
	}
	return null;
}

export function resetResolvedProtocolBaseUrl(): void {
	resolvedBaseUrl = null;
}

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
 * @param bookHash 书籍路径哈希（通过 registerBookPath 获取）
 * @param entryIndex 图片在压缩包中的索引
 * @returns Custom Protocol URL
 */
export function getArchiveImageUrl(bookHash: string, entryIndex: number): string {
	return `${getBaseUrl()}/image/${bookHash}/${entryIndex}`;
}

export function getArchiveImageUrlCandidates(bookHash: string, entryIndex: number): string[] {
	return getBaseUrlCandidates().map((base) => `${base}/image/${bookHash}/${entryIndex}`);
}

/**
 * 获取文件图片的 URL
 * @param pathHash 文件路径哈希
 * @returns Custom Protocol URL
 */
export function getFileImageUrl(pathHash: string): string {
	return `${getBaseUrl()}/file/${pathHash}`;
}

/**
 * 获取缩略图的 URL
 * @param key 缩略图键
 * @returns Custom Protocol URL
 */
export function getThumbUrl(key: string): string {
	return `${getBaseUrl()}/thumb/${encodeURIComponent(key)}`;
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
 * @param entryIndices 图片 entryIndex 列表
 */
export function preloadArchiveImages(bookHash: string, entryIndices: number[]): void {
	const urls = entryIndices.map((idx) => getArchiveImageUrl(bookHash, idx));
	preloadImages(urls);
}

/**
 * 检查 Custom Protocol 是否可用
 * @returns 是否可用
 */
export async function isProtocolAvailable(): Promise<boolean> {
	const resolved = await resolveProtocolBaseUrl();
	return resolved !== null;
}
