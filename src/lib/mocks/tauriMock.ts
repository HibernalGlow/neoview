/**
 * Tauri API Mock - 使用官方 @tauri-apps/api/mocks
 * 用于纯前端开发模式和测试环境
 */

import { mockIPC, mockWindows, clearMocks } from '@tauri-apps/api/mocks';

// 检测是否在 Tauri 环境中
export const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Mock 响应数据
const mockResponses: Record<string, unknown> = {
  'get_system_capabilities': {
    hasGpu: false,
    gpuName: 'Mock GPU',
    hasPython: false,
    pythonVersion: null,
  },
  'get_startup_config': {
    upscaleConditions: [],
    defaultUpscaleModel: null,
  },
  'list_directory': [],
  'read_file': '',
  'get_file_metadata': {
    isDir: false,
    size: 0,
    modified: Date.now(),
  },
};

/**
 * 初始化 Tauri Mock 环境
 * 在测试或纯前端开发时调用
 */
export function setupTauriMocks() {
  // Mock IPC 调用
  mockIPC((cmd, args) => {
    console.warn(`[Mock] invoke called: ${cmd}`, args);
    
    if (cmd in mockResponses) {
      return mockResponses[cmd];
    }
    
    // 处理插件调用 (plugin:xxx|command 格式)
    if (cmd.startsWith('plugin:')) {
      const [, pluginCmd] = cmd.split('|');
      return handlePluginCommand(cmd, pluginCmd, args);
    }
    
    return null;
  });

  // Mock 窗口
  mockWindows('main');
}

/**
 * 处理插件命令
 */
function handlePluginCommand(fullCmd: string, cmd: string, args: unknown): unknown {
  console.warn(`[Mock] plugin command: ${fullCmd}`, args);
  
  // dialog 插件
  if (fullCmd.includes('plugin:dialog')) {
    if (cmd === 'open') return null;
    if (cmd === 'save') return null;
    if (cmd === 'message') return undefined;
    if (cmd === 'confirm') return false;
  }
  
  // fs 插件
  if (fullCmd.includes('plugin:fs')) {
    if (cmd === 'read_text_file') return '';
    if (cmd === 'write_text_file') return undefined;
    if (cmd === 'read_dir') return [];
    if (cmd === 'exists') return false;
  }
  
  // shell 插件
  if (fullCmd.includes('plugin:shell')) {
    if (cmd === 'execute') return { code: 0, stdout: '', stderr: '' };
  }
  
  // cli 插件
  if (fullCmd.includes('plugin:cli')) {
    if (cmd === 'cli_matches') return { args: {} };
  }
  
  return null;
}

/**
 * 添加自定义 mock 响应
 */
export function addMockResponse(cmd: string, response: unknown) {
  mockResponses[cmd] = response;
}

/**
 * 清除所有 mock
 */
export { clearMocks };

// 自动初始化（非 Tauri 环境）
if (!isTauri && typeof window !== 'undefined') {
  setupTauriMocks();
}
