/**
 * IPC Timeout Utility
 * IPC 调用超时处理工具
 */

import { invoke } from '@tauri-apps/api/core';

// 缩短超时时间，快速失败以便处理其他任务（参考 NeeView 的快速标记策略）
export const DEFAULT_IPC_TIMEOUT = 3000; // 3秒默认超时

export class IpcTimeoutError extends Error {
	constructor(command: string, timeout: number) {
		super(`IPC command '${command}' timed out after ${timeout}ms`);
		this.name = 'IpcTimeoutError';
	}
}

/**
 * 带超时的 IPC 调用
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

	return Promise.race([
		invoke<T>(command, args),
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
