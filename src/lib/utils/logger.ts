/**
 * 统一日志工具
 * 在生产环境中禁用调试日志，避免性能损耗
 */

// 检测是否为开发环境
const isDev = import.meta.env.DEV;

// 日志级别
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

// 当前日志级别（生产环境只显示警告和错误）
let currentLevel: LogLevel = isDev ? LogLevel.DEBUG : LogLevel.WARN;

/**
 * 设置日志级别
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * 获取当前日志级别
 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * 调试日志（仅开发环境）
 */
export function debug(...args: unknown[]): void {
  if (currentLevel <= LogLevel.DEBUG) {
    console.log(...args);
  }
}

/**
 * 信息日志（仅开发环境）
 */
export function info(...args: unknown[]): void {
  if (currentLevel <= LogLevel.INFO) {
    console.log(...args);
  }
}

/**
 * 警告日志
 */
export function warn(...args: unknown[]): void {
  if (currentLevel <= LogLevel.WARN) {
    console.warn(...args);
  }
}

/**
 * 错误日志
 */
export function error(...args: unknown[]): void {
  if (currentLevel <= LogLevel.ERROR) {
    console.error(...args);
  }
}

/**
 * 创建带前缀的日志器
 */
export function createLogger(prefix: string) {
  return {
    debug: (...args: unknown[]) => debug(`[${prefix}]`, ...args),
    info: (...args: unknown[]) => info(`[${prefix}]`, ...args),
    warn: (...args: unknown[]) => warn(`[${prefix}]`, ...args),
    error: (...args: unknown[]) => error(`[${prefix}]`, ...args)
  };
}

// 默认导出
export default {
  debug,
  info,
  warn,
  error,
  setLogLevel,
  getLogLevel,
  createLogger,
  LogLevel
};
