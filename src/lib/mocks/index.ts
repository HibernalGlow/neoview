/**
 * Tauri Mock 入口文件
 * 在纯前端开发模式下替代真实的 Tauri API
 */

export * from './tauriMock';

// 重新导出为各个 Tauri 包的格式
export { invoke, convertFileSrc } from './tauriMock';
export { listen, emit } from './tauriMock';
export { dialog } from './tauriMock';
export { fs } from './tauriMock';
export { path } from './tauriMock';
export { window, WebviewWindow, getCurrentWindow } from './tauriMock';
export { cli, Command } from './tauriMock';
