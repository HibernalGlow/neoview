/**
 * NeoView - Image API (原 File System API)
 * 文件系统操作相关的前端 API 封装
 * 全面使用 Python HTTP API
 */

import { apiGet } from './http-bridge';

export interface FileInfo {
	name: string;
	path: string;
	isDirectory: boolean;
	size?: number;
	modified?: string;
}

export async function readDirectory(path: string): Promise<FileInfo[]> {
	const items = await apiGet<Array<{
		name: string;
		path: string;
		is_dir: boolean;
		size: number;
		modified: number;
	}>>('/directory/list', { path });
	
	return items.map(item => ({
		name: item.name,
		path: item.path,
		isDirectory: item.is_dir,
		size: item.size,
		modified: item.modified ? new Date(item.modified * 1000).toISOString() : undefined
	}));
}

export async function getFileInfo(path: string): Promise<FileInfo> {
	const item = await apiGet<{
		name: string;
		path: string;
		is_dir: boolean;
		size: number;
		modified: number;
	}>('/file/info', { path });
	
	return {
		name: item.name,
		path: item.path,
		isDirectory: item.is_dir,
		size: item.size,
		modified: item.modified ? new Date(item.modified * 1000).toISOString() : undefined
	};
}

export async function pathExists(path: string): Promise<boolean> {
	return await apiGet<boolean>('/file/exists', { path });
}
