/**
 * 统一日志工具
 * 使用 Tauri 官方 plugin-log，支持分级日志和生产环境过滤
 */

import {
  trace as tauriTrace,
  debug as tauriDebug,
  info as tauriInfo,
  warn as tauriWarn,
  error as tauriError
} from '@tauri-apps/plugin-log';

// 检测是否为开发环境
const isDev = import.meta.env.DEV;

/**
 * 调试日志（仅开发环境）
 */
export function debug(...args: unknown[]): void {
  if (isDev) {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    tauriDebug(message);
  }
}

/**
 * 信息日志
 */
export function info(...args: unknown[]): void {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  tauriInfo(message);
}

/**
 * 警告日志
 */
export function warn(...args: unknown[]): void {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  tauriWarn(message);
}

/**
 * 错误日志
 */
export function error(...args: unknown[]): void {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  tauriError(message);
}

/**
 * 追踪日志（最详细级别，仅开发环境）
 */
export function trace(...args: unknown[]): void {
  if (isDev) {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    tauriTrace(message);
  }
}

/**
 * 创建带前缀的日志器
 */
export function createLogger(prefix: string) {
  return {
    trace: (...args: unknown[]) => trace(`[${prefix}]`, ...args),
    debug: (...args: unknown[]) => debug(`[${prefix}]`, ...args),
    info: (...args: unknown[]) => info(`[${prefix}]`, ...args),
    warn: (...args: unknown[]) => warn(`[${prefix}]`, ...args),
    error: (...args: unknown[]) => error(`[${prefix}]`, ...args)
  };
}

// 默认导出
export default {
  trace,
  debug,
  info,
  warn,
  error,
  createLogger
};
