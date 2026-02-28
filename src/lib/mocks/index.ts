/**
 * Tauri Mock 入口文件
 * 在纯前端开发模式下替代真实的 Tauri API
 */

export * from './tauriMock';

// 重新导出为各个 Tauri 包的格式
export { invoke, convertFileSrc } from './tauriMock';
export { listen, emit } from './tauriMock';
export { WebviewWindow, getCurrentWindow, Command } from './tauriMock';

export {
	open,
	save,
	message,
	confirm,
	readTextFile,
	writeTextFile,
	readDir,
	exists,
	appDataDir,
	homeDir,
	join,
	dirname,
	basename,
	getMatches
} from './tauriMock';

import {
	open,
	save,
	message,
	confirm,
	readTextFile,
	writeTextFile,
	readDir,
	exists,
	appDataDir,
	homeDir,
	join,
	dirname,
	basename,
	getCurrentWindow,
	getMatches
} from './tauriMock';

export const dialog = { open, save, message, confirm };
export const fs = { readTextFile, writeTextFile, readDir, exists };
export const path = { appDataDir, homeDir, join, dirname, basename };
export const window = { getCurrentWindow };
export const cli = { getMatches };
