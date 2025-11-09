/**
 * NeoView - File System API
 * 文件系统操作相关的前端 API 封装
 */

import { invoke } from '@tauri-apps/api/core';

export interface FileInfo {
	name: string;
	path: string;
	isDirectory: boolean;
	size?: number;
	modified?: string;
}

export async function readDirectory(path: string): Promise<FileInfo[]> {
	return await invoke<FileInfo[]>('read_directory', { path });
}

export async function getFileInfo(path: string): Promise<FileInfo> {
	return await invoke<FileInfo>('get_file_info', { path });
}

export async function pathExists(path: string): Promise<boolean> {
	return await invoke<boolean>('path_exists', { path });
}
