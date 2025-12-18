/**
 * IPC Timeout Utility
 * HTTP API 调用超时处理工具（已从 Tauri IPC 迁移到 HTTP API）
 */

import { apiGet } from '$lib/api/http-bridge';

// 超时时间配置
// 普通查询：5秒
// 文件夹扫描：10秒（需要更长时间）
export const DEFAULT_IPC_TIMEOUT = 5000; // 5秒默认超时
export const FOLDER_SCAN_TIMEOUT = 10000; // 10秒文件夹扫描超时

export class IpcTimeoutError extends Error {
	constructor(command: string, timeout: number) {
		super(`API command '${command}' timed out after ${timeout}ms`);
		this.name = 'IpcTimeoutError';
	}
}

/**
 * 带超时的 API 调用
 * 注意：此函数已弃用，请直接使用 apiGet/apiPost
 * @deprecated 使用 apiGet 或 apiPost 替代
 */
export async function invokeWithTimeout<T>(
	command: string,
	args?: Record<string, unknown>,
	timeout: number = DEFAULT_IPC_TIMEOUT
): Promise<T> {
	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => {
			reject(new IpcTimeoutError(command, timeout));
		}, timeout);
	});

	// 将命令转换为 API 端点（简单映射）
	const endpoint = `/${command.replace(/_/g, '-')}`;
	
	return Promise.race([
		apiGet<T>(endpoint, args as Record<string, string | number | boolean>),
		timeoutPromise
	]);
}

/**
 * 判断错误是否为超时错误
 */
export function isTimeoutError(error: unknown): error is IpcTimeoutError {
	return error instanceof IpcTimeoutError;
}

/**
 * 判断错误是否为 IPC 错误（连接问题）
 */
export function isIpcError(error: unknown): boolean {
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		return msg.includes('ipc') || 
			   msg.includes('connection') || 
			   msg.includes('channel closed');
	}
	return false;
}
