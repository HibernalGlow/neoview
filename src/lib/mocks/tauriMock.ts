/**
 * Tauri API Mock - 用于纯前端开发模式
 * 当不运行 Tauri 后端时，提供基本的 mock 实现让界面能正常显示
 */

// 检测是否在 Tauri 环境中
export const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Mock 响应数据
const mockResponses: Record<string, unknown> = {
  get_system_capabilities: {
    hasGpu: false,
    gpuName: 'Mock GPU',
    hasPython: false,
    pythonVersion: null,
  },
  get_startup_config: {
    upscaleConditions: [],
    defaultUpscaleModel: null,
  },
  list_directory: [],
  read_file: '',
  get_file_metadata: {
    isDir: false,
    size: 0,
    modified: Date.now(),
  },
};

// Mock invoke - @tauri-apps/api/core
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  console.warn(`[Mock] invoke called: ${cmd}`, args);
  return (mockResponses[cmd] ?? null) as T;
}

// Mock Channel - @tauri-apps/api/core
export class Channel<T = unknown> {
  private _callback: ((response: T) => void) | null = null;
  id = 0;

  set onmessage(handler: (response: T) => void) {
    this._callback = handler;
  }

  get onmessage(): ((response: T) => void) | null {
    return this._callback;
  }

  toJSON(): string {
    return `__CHANNEL__:${this.id}`;
  }
}

// Mock convertFileSrc - @tauri-apps/api/core
export function convertFileSrc(filePath: string, _protocol?: string): string {
  console.warn(`[Mock] convertFileSrc called: ${filePath}`);
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('data:')) {
    return filePath;
  }
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23333" width="100" height="100"/><text fill="%23fff" x="50" y="50" text-anchor="middle" dy=".3em" font-size="10">Mock</text></svg>`;
}

// Mock listen - @tauri-apps/api/event
export async function listen<T>(
  event: string,
  _handler: (event: { payload: T }) => void
): Promise<() => void> {
  console.warn(`[Mock] listen called: ${event}`);
  return () => {};
}

// Mock emit - @tauri-apps/api/event
export async function emit(event: string, payload?: unknown): Promise<void> {
  console.warn(`[Mock] emit called: ${event}`, payload);
}

// Mock path - @tauri-apps/api/path
export async function appDataDir(): Promise<string> {
  return '/mock/app/data';
}
export async function homeDir(): Promise<string> {
  return '/mock/home';
}
export async function join(...paths: string[]): Promise<string> {
  return paths.join('/');
}
export async function dirname(p: string): Promise<string> {
  return p.substring(0, p.lastIndexOf('/'));
}
export async function basename(p: string): Promise<string> {
  return p.substring(p.lastIndexOf('/') + 1);
}

// Mock getCurrentWindow - @tauri-apps/api/window
export function getCurrentWindow() {
  return {
    async setFullscreen(fullscreen: boolean): Promise<void> {
      console.warn('[Mock] setFullscreen called', fullscreen);
    },
    async isFullscreen(): Promise<boolean> {
      return false;
    },
    async onCloseRequested(_handler: () => void): Promise<() => void> {
      return () => {};
    },
    async minimize(): Promise<void> {},
    async maximize(): Promise<void> {},
    async close(): Promise<void> {},
    async setTitle(_title: string): Promise<void> {},
    label: 'main',
  };
}

// Mock getCurrentWebviewWindow - @tauri-apps/api/webviewWindow
export function getCurrentWebviewWindow() {
  return {
    async setFullscreen(fullscreen: boolean): Promise<void> {
      console.warn('[Mock] webview.setFullscreen called', fullscreen);
    },
    async isFullscreen(): Promise<boolean> {
      return false;
    },
    async minimize(): Promise<void> {},
    async maximize(): Promise<void> {},
    async unmaximize(): Promise<void> {},
    async toggleMaximize(): Promise<void> {},
    async close(): Promise<void> {},
    async setTitle(_title: string): Promise<void> {},
    async listen<T>(_event: string, _handler: (event: { payload: T }) => void): Promise<() => void> {
      return () => {};
    },
    async emit(_event: string, _payload?: unknown): Promise<void> {},
    label: 'main',
  };
}

// Mock WebviewWindow - @tauri-apps/api/webviewWindow
export class WebviewWindow {
  label: string;

  constructor(label: string, options?: Record<string, unknown>) {
    this.label = label;
    console.warn('[Mock] WebviewWindow created', label, options);
  }

  async emit(event: string, payload?: unknown): Promise<void> {
    console.warn('[Mock] WebviewWindow.emit called', event, payload);
  }

  async listen<T>(event: string, _handler: (event: { payload: T }) => void): Promise<() => void> {
    console.warn('[Mock] WebviewWindow.listen called', event);
    return () => {};
  }

  async close(): Promise<void> {
    console.warn('[Mock] WebviewWindow.close called');
  }

  async show(): Promise<void> {}
  async hide(): Promise<void> {}
  async setFocus(): Promise<void> {}
}

// Mock dialog - @tauri-apps/plugin-dialog
export async function open(options?: {
  directory?: boolean;
  multiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
  title?: string;
}): Promise<string | string[] | null> {
  console.warn('[Mock] dialog.open called', options);
  return null;
}

export async function save(options?: {
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
}): Promise<string | null> {
  console.warn('[Mock] dialog.save called', options);
  return null;
}

export async function message(msg: string, options?: { title?: string; type?: string }): Promise<void> {
  console.warn('[Mock] dialog.message called', msg, options);
  alert(msg);
}

export async function confirm(msg: string, options?: { title?: string }): Promise<boolean> {
  console.warn('[Mock] dialog.confirm called', msg, options);
  return globalThis.confirm(msg);
}

// Mock fs - @tauri-apps/plugin-fs
export async function readTextFile(filePath: string): Promise<string> {
  console.warn('[Mock] fs.readTextFile called', filePath);
  return '';
}

export async function writeTextFile(filePath: string, _contents: string): Promise<void> {
  console.warn('[Mock] fs.writeTextFile called', filePath);
}

export async function readDir(dirPath: string): Promise<{ name: string; path: string }[]> {
  console.warn('[Mock] fs.readDir called', dirPath);
  return [];
}

export async function exists(filePath: string): Promise<boolean> {
  console.warn('[Mock] fs.exists called', filePath);
  return false;
}

// Mock cli - @tauri-apps/plugin-cli
export async function getMatches(): Promise<{ args: Record<string, { value: unknown }> }> {
  console.warn('[Mock] cli.getMatches called');
  return { args: {} };
}

// Mock shell Command - @tauri-apps/plugin-shell
export class Command {
  program: string;
  args: string[];

  constructor(program: string, args?: string | string[]) {
    this.program = program;
    this.args = Array.isArray(args) ? args : args ? [args] : [];
    console.warn('[Mock] Command created', program, args);
  }

  async execute(): Promise<{ code: number; stdout: string; stderr: string }> {
    console.warn('[Mock] Command.execute called');
    return { code: 0, stdout: '', stderr: '' };
  }

  async spawn(): Promise<{ pid: number; kill: () => void }> {
    console.warn('[Mock] Command.spawn called');
    return { pid: 0, kill: () => {} };
  }
}
