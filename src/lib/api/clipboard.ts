/**
 * 剪贴板 API 封装
 * 使用 tauri-plugin-clipboard-x 实现真正的系统剪贴板操作
 */

import {
	writeFiles,
	readFiles,
	writeText,
	readText,
	hasFiles,
	hasText,
	clear
} from 'tauri-plugin-clipboard-x-api';

export interface ClipboardState {
	/** 剪贴板中的文件路径列表 */
	files: string[];
	/** 是否是剪切操作 */
	isCut: boolean;
}

// 本地状态：追踪是否是剪切操作（系统剪贴板不支持剪切标记）
let localCutState: Set<string> = new Set();

/**
 * 复制文件到系统剪贴板
 * @param paths 文件路径列表
 */
export async function copyFilesToClipboard(paths: string[]): Promise<void> {
	await writeFiles(paths);
	// 清除剪切状态
	localCutState.clear();
}

/**
 * 剪切文件到系统剪贴板
 * 注意：Windows 剪贴板原生不支持"剪切"标记，这里通过本地状态追踪
 * @param paths 文件路径列表
 */
export async function cutFilesToClipboard(paths: string[]): Promise<void> {
	await writeFiles(paths);
	// 设置剪切状态
	localCutState = new Set(paths);
}

/**
 * 从系统剪贴板读取文件
 * @returns 剪贴板状态
 */
export async function readFilesFromClipboard(): Promise<ClipboardState | null> {
	try {
		const hasFilesInClipboard = await hasFiles();
		if (!hasFilesInClipboard) {
			return null;
		}
		
		const files = await readFiles();
		if (!files || files.length === 0) {
			return null;
		}
		
		// 检查是否是我们之前剪切的文件
		const isCut = files.every((f: string) => localCutState.has(f));
		
		return {
			files,
			isCut
		};
	} catch (error) {
		console.error('[Clipboard] Failed to read files:', error);
		return null;
	}
}

/**
 * 清除剪切状态（粘贴完成后调用）
 */
export function clearCutState(): void {
	localCutState.clear();
}

/**
 * 检查剪贴板是否有文件
 */
export async function clipboardHasFiles(): Promise<boolean> {
	try {
		return await hasFiles();
	} catch {
		return false;
	}
}

/**
 * 复制文本到剪贴板
 */
export async function copyTextToClipboard(text: string): Promise<void> {
	await writeText(text);
}

/**
 * 从剪贴板读取文本
 */
export async function readTextFromClipboard(): Promise<string | null> {
	try {
		const hasTextInClipboard = await hasText();
		if (!hasTextInClipboard) {
			return null;
		}
		return await readText();
	} catch {
		return null;
	}
}

/**
 * 清空剪贴板
 */
export async function clearClipboard(): Promise<void> {
	await clear();
	localCutState.clear();
}

export const ClipboardAPI = {
	copyFiles: copyFilesToClipboard,
	cutFiles: cutFilesToClipboard,
	readFiles: readFilesFromClipboard,
	hasFiles: clipboardHasFiles,
	copyText: copyTextToClipboard,
	readText: readTextFromClipboard,
	clear: clearClipboard,
	clearCutState
};
