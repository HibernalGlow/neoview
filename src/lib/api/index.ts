/**
 * NeoView - API Exports
 * 统一导出所有 API 接口
 */

export * from './book';
export * from './image';
export * from './fs';
export * from './performance';
export * as FileSystemAPI from './filesystem';
export * as IndexAPI from './file_index';

// NeoView 新架构 - 后端主导加载系统
export * as PageManagerAPI from './pageManager';

// 剪贴板 API - 使用 tauri-plugin-clipboard-x
export { ClipboardAPI } from './clipboard';

// Web 浏览模式适配器 - 自动检测环境选择 Tauri IPC 或 HTTP
export * from './adapter';
