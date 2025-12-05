/**
 * Legacy 加载系统入口
 * 
 * 此文件夹包含老的前端主导加载系统：
 * - imageReader.ts - 图片读取（双模式 IPC/Tempfile）
 * - imageLoaderAdapter.ts - 加载适配器
 * - imageLoaderCore.ts - 加载核心逻辑
 * - imageLoaderFacade.ts - 加载门面
 * - preloadManager.svelte.ts - 预加载管理
 * - preloadRuntime.ts - 预加载运行时
 * - blobCache.ts - Blob 缓存
 * 
 * 新系统（NeeView 架构）在后端处理所有加载逻辑，
 * 前端只发请求。使用 `pageManager` API。
 * 
 * @deprecated 使用 `$lib/api/pageManager` 替代
 */

// Re-export legacy modules for backward compatibility
export * from '../imageReader';
export * from '../imageLoaderAdapter';
export * from '../imageLoaderCore';
export * from '../imageLoaderFacade';
export * from '../blobCache';

// Legacy preload - 直接从原文件导入使用
// import { ... } from '../preloadManager.svelte';

// Legacy load mode store
export { loadModeStore, type LoadModeConfig, type DataSource, type RenderMode } from '$lib/stores/loadModeStore.svelte';
