/**
 * 系统集成模块
 * 包含资源管理器右键菜单、系统 API 等功能
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * 查询是否已在资源管理器右键菜单中注册 "Open in NeoView"
 */
export async function getExplorerContextMenuEnabled(): Promise<boolean> {
  return await invoke<boolean>('get_explorer_context_menu_enabled');
}

/**
 * 设置资源管理器右键菜单中的 "Open in NeoView" 开关
 * Windows 下通过写入 HKCU\Software\Classes，便携版也可使用
 */
export async function setExplorerContextMenuEnabled(enabled: boolean): Promise<boolean> {
  return await invoke<boolean>('set_explorer_context_menu_enabled', { enabled });
}

/**
 * 生成 Explorer 右键菜单注册表文件内容 (.reg)
 * 基于当前 exe 路径，返回完整文本，前端可触发下载
 */
export async function generateExplorerContextMenuReg(): Promise<string> {
  return await invoke<string>('generate_explorer_context_menu_reg');
}
