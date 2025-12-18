/**
 * NeoView - Auto Backup Store
 * 自动备份管理系统
 * 使用 Python HTTP API 进行文件操作
 */

import { apiPost, apiGet } from '$lib/api/http-bridge';
import { getStartupConfig } from '$lib/config/startupConfig';
import { settingsManager } from './settingsManager.svelte';
import { settingsManager as coreSettingsManager } from '$lib/settings/settingsManager';

// ==================== 文件操作辅助函数 ====================

/**
 * 创建目录（通过 HTTP API）
 */
async function createDirectory(path: string): Promise<void> {
    await apiPost('/file/mkdir', { path });
}

/**
 * 写入文本文件（通过 HTTP API）
 */
async function writeTextFile(path: string, content: string): Promise<void> {
    await apiPost('/file/write', { path, content });
}

/**
 * 删除文件（通过 HTTP API）
 */
async function deleteFile(path: string): Promise<void> {
    // 使用 DELETE 方法，路径作为查询参数
    const { apiDelete } = await import('$lib/api/http-bridge');
    await apiDelete('/file', { path });
}

// ==================== 类型定义 ====================

export interface BackupExclusionSettings {
    excludedKeys: string[]; // 手动排除的 localStorage 键名
    excludedModules: string[]; // 排除的模块名
    autoExcludeLargeData: boolean; // 自动排除大数据
    maxLineCount: number; // 超过此行数的数据将被排除
}

export interface BackupSettings {
    enabled: boolean;
    intervalMinutes: number; // 备份间隔（分钟）
    maxBackups: number; // 最大保留备份数量
    backupPath: string; // 备份目录路径
    lastBackupTime: number | null; // 上次备份时间戳
    includeAllLocalStorage: boolean; // 是否包含所有 localStorage 数据
    exclusion: BackupExclusionSettings; // 排除配置
}

export interface BackupInfo {
    filename: string;
    timestamp: number;
    size: number;
    path: string;
}

export interface FullBackupPayload {
    version: string;
    timestamp: number;
    backupType: 'auto' | 'manual';
    nativeSettings: any;
    appSettings: any;
    extendedData: any;
    rawLocalStorage: Record<string, string>; // 所有 localStorage 原始数据
}

// ==================== 常量 ====================

const SETTINGS_KEY = 'neoview-auto-backup-settings';
const DEFAULT_EXCLUSION: BackupExclusionSettings = {
    excludedKeys: [
        'neoview-emm-folder-ratings',
        'neoview-empty-settings',
        'neoview-ai-translation-cache'
    ],
    excludedModules: [],
    autoExcludeLargeData: true,
    maxLineCount: 1000
};

const DEFAULT_SETTINGS: BackupSettings = {
    enabled: false,
    intervalMinutes: 60, // 默认每小时备份一次
    maxBackups: 10,
    backupPath: '',
    lastBackupTime: null,
    includeAllLocalStorage: true,
    exclusion: DEFAULT_EXCLUSION
};

// ==================== Store ====================

class AutoBackupStore {
    private settings = $state<BackupSettings>(this.loadSettings());
    private timer: number | null = null;
    private isBackingUp = $state(false);
    private lastError = $state<string | null>(null);
    private initialized = false;

    constructor() {
        // 初始化时启动定时器和默认路径
        if (typeof window !== 'undefined') {
            this.initializeDefaultPath();
            this.startScheduler();
        }
    }

    /**
     * 初始化默认备份路径
     */
    private async initializeDefaultPath() {
        if (this.initialized) return;
        this.initialized = true;

        // 如果没有设置备份路径，使用默认路径
        if (!this.settings.backupPath) {
            try {
                const config = await getStartupConfig();
                const cacheDir = config.cacheDir || '';
                
                if (!cacheDir) {
                    console.warn('[AutoBackup] 未配置 cacheDir，无法设置默认备份路径');
                    return;
                }
                
                const defaultPath = `${cacheDir}/backups`;
                
                // 尝试创建目录
                try {
                    await createDirectory(defaultPath);
                } catch {
                    // 目录可能已存在，忽略错误
                }
                
                this.settings = { ...this.settings, backupPath: defaultPath };
                this.saveSettings();
                console.log('[AutoBackup] 默认备份路径:', defaultPath);
            } catch (e) {
                console.error('[AutoBackup] 初始化默认路径失败:', e);
            }
        }
    }

    // ==================== 设置管理 ====================

    private loadSettings(): BackupSettings {
        if (typeof window === 'undefined') return DEFAULT_SETTINGS;
        try {
            const stored = localStorage.getItem(SETTINGS_KEY);
            if (stored) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.error('加载备份设置失败:', e);
        }
        return DEFAULT_SETTINGS;
    }

    private saveSettings() {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
        } catch (e) {
            console.error('保存备份设置失败:', e);
        }
    }

    get currentSettings() {
        return this.settings;
    }

    get backing() {
        return this.isBackingUp;
    }

    get error() {
        return this.lastError;
    }

    updateSettings(partial: Partial<BackupSettings>) {
        this.settings = { ...this.settings, ...partial };
        this.saveSettings();
        this.restartScheduler();
    }

    // ==================== 定时器管理 ====================

    private startScheduler() {
        this.stopScheduler();
        
        if (!this.settings.enabled || this.settings.intervalMinutes <= 0) {
            return;
        }

        const intervalMs = this.settings.intervalMinutes * 60 * 1000;
        
        // 检查是否需要立即备份
        const now = Date.now();
        const lastBackup = this.settings.lastBackupTime || 0;
        const timeSinceLastBackup = now - lastBackup;
        
        if (timeSinceLastBackup >= intervalMs) {
            // 需要立即备份
            this.performBackup('auto');
        }

        // 设置定时器
        this.timer = window.setInterval(() => {
            this.performBackup('auto');
        }, intervalMs);

        console.log(`[AutoBackup] 定时备份已启动，间隔: ${this.settings.intervalMinutes} 分钟`);
    }

    private stopScheduler() {
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
    }

    private restartScheduler() {
        this.startScheduler();
    }

    // ==================== 备份功能 ====================

    /**
     * 计算字符串的行数
     */
    private countLines(str: string): number {
        if (!str) return 0;
        return str.split('\n').length;
    }

    /**
     * 检查键名是否应被排除
     */
    private shouldExcludeKey(key: string, value: string): boolean {
        const exclusion = this.settings.exclusion || DEFAULT_EXCLUSION;
        
        // 检查是否在手动排除列表中
        if (exclusion.excludedKeys.includes(key)) {
            return true;
        }
        
        // 检查是否超过行数限制
        if (exclusion.autoExcludeLargeData && exclusion.maxLineCount > 0) {
            const lineCount = this.countLines(value);
            if (lineCount > exclusion.maxLineCount) {
                console.log(`[AutoBackup] 自动排除大数据: ${key} (行数: ${lineCount})`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * 收集所有 localStorage 数据（应用排除规则）
     */
    private collectAllLocalStorage(): Record<string, string> {
        const data: Record<string, string> = {};
        if (typeof window === 'undefined' || !window.localStorage) return data;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                const value = localStorage.getItem(key);
                if (value !== null && !this.shouldExcludeKey(key, value)) {
                    data[key] = value;
                }
            }
        }
        return data;
    }

    /**
     * 分析 localStorage 数据（用于显示给用户）
     */
    analyzeLocalStorage(): Array<{ key: string; lines: number; size: number; excluded: boolean; reason?: string }> {
        const result: Array<{ key: string; lines: number; size: number; excluded: boolean; reason?: string }> = [];
        if (typeof window === 'undefined' || !window.localStorage) return result;

        const exclusion = this.settings.exclusion || DEFAULT_EXCLUSION;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                const value = localStorage.getItem(key) || '';
                const lines = this.countLines(value);
                const size = new Blob([value]).size;
                
                let excluded = false;
                let reason: string | undefined;
                
                if (exclusion.excludedKeys.includes(key)) {
                    excluded = true;
                    reason = '手动排除';
                } else if (exclusion.autoExcludeLargeData && lines > exclusion.maxLineCount) {
                    excluded = true;
                    reason = `超过${exclusion.maxLineCount}行`;
                }
                
                result.push({ key, lines, size, excluded, reason });
            }
        }
        
        // 按大小排序
        return result.sort((a, b) => b.size - a.size);
    }

    /**
     * 构建完整备份数据
     */
    buildFullBackupPayload(backupType: 'auto' | 'manual'): FullBackupPayload {
        // 获取现有的导出数据
        const fullPayload = settingsManager.buildFullPayload({
            includeNativeSettings: true,
            includeExtendedData: true
        });

        const payload: FullBackupPayload = {
            version: '2.0.0',
            timestamp: Date.now(),
            backupType,
            nativeSettings: fullPayload?.nativeSettings || coreSettingsManager.getSettings(),
            appSettings: fullPayload?.appSettings || settingsManager.exportSettings(),
            extendedData: fullPayload?.extended || {},
            rawLocalStorage: this.settings.includeAllLocalStorage 
                ? this.collectAllLocalStorage() 
                : {}
        };

        return payload;
    }

    /**
     * 执行备份
     */
    async performBackup(type: 'auto' | 'manual' = 'manual'): Promise<boolean> {
        if (this.isBackingUp) {
            console.log('[AutoBackup] 备份正在进行中，跳过');
            return false;
        }

        if (!this.settings.backupPath) {
            this.lastError = '未设置备份路径';
            console.error('[AutoBackup]', this.lastError);
            return false;
        }

        this.isBackingUp = true;
        this.lastError = null;

        try {
            const payload = this.buildFullBackupPayload(type);
            const json = JSON.stringify(payload, null, 2);
            
            // 生成文件名
            const date = new Date();
            const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `neoview-backup-${type}-${dateStr}.json`;
            const filepath = `${this.settings.backupPath}/${filename}`;

            // 写入文件
            await writeTextFile(filepath, json);

            // 更新最后备份时间
            this.settings.lastBackupTime = Date.now();
            this.saveSettings();

            // 清理旧备份
            await this.cleanupOldBackups();

            console.log(`[AutoBackup] 备份成功: ${filepath}`);
            return true;
        } catch (e) {
            this.lastError = e instanceof Error ? e.message : String(e);
            console.error('[AutoBackup] 备份失败:', e);
            return false;
        } finally {
            this.isBackingUp = false;
        }
    }

    /**
     * 清理旧备份
     */
    private async cleanupOldBackups() {
        if (this.settings.maxBackups <= 0) return;

        try {
            const backups = await this.listBackups();
            if (backups.length > this.settings.maxBackups) {
                // 按时间排序，删除最旧的
                const toDelete = backups
                    .sort((a, b) => a.timestamp - b.timestamp)
                    .slice(0, backups.length - this.settings.maxBackups);

                for (const backup of toDelete) {
                    try {
                        await deleteFile(backup.path);
                        console.log(`[AutoBackup] 已删除旧备份: ${backup.filename}`);
                    } catch (e) {
                        console.error(`[AutoBackup] 删除旧备份失败: ${backup.filename}`, e);
                    }
                }
            }
        } catch (e) {
            console.error('[AutoBackup] 清理旧备份失败:', e);
        }
    }

    /**
     * 列出所有备份文件
     */
    async listBackups(): Promise<BackupInfo[]> {
        if (!this.settings.backupPath) return [];

        try {
            // 使用 HTTP API 列出目录文件
            const response = await apiGet<Array<{
                name: string;
                path: string;
                size: number;
                modified: number;
                isDir: boolean;
            }>>('/directory/list', { path: this.settings.backupPath });

            // 过滤出备份文件
            return response
                .filter(f => !f.isDir && f.name.startsWith('neoview-backup-') && f.name.endsWith('.json'))
                .map(f => ({
                    filename: f.name,
                    path: f.path,
                    size: f.size,
                    timestamp: f.modified
                }));
        } catch (e) {
            console.error('[AutoBackup] 列出备份失败:', e);
            return [];
        }
    }

    /**
     * 从备份文件路径恢复
     */
    async restoreFromBackup(backupPath: string): Promise<boolean> {
        try {
            // 使用 HTTP API 读取文件
            const { PYTHON_API_BASE } = await import('$lib/api/config');
            const response = await fetch(`${PYTHON_API_BASE}/file?path=${encodeURIComponent(backupPath)}`);
            if (!response.ok) {
                throw new Error(`读取文件失败: ${response.status}`);
            }
            const content = await response.text();
            const payload = JSON.parse(content) as FullBackupPayload;

            return this.restoreFromPayload(payload);
        } catch (e) {
            console.error('[AutoBackup] 恢复失败:', e);
            return false;
        }
    }

    /**
     * 选择备份目录（Web 模式下使用输入框）
     */
    async selectBackupPath(): Promise<string | null> {
        // Web 模式：使用 prompt 让用户输入路径
        const currentPath = this.settings.backupPath || '';
        const newPath = prompt('请输入备份目录路径:', currentPath);
        
        if (newPath && newPath.trim()) {
            const trimmedPath = newPath.trim();
            // 尝试创建目录
            try {
                await createDirectory(trimmedPath);
            } catch {
                // 目录可能已存在，忽略错误
            }
            this.updateSettings({ backupPath: trimmedPath });
            return trimmedPath;
        }
        return null;
    }

    /**
     * 手动触发备份
     */
    async manualBackup(): Promise<boolean> {
        return this.performBackup('manual');
    }

    /**
     * 导出到文件（Web 模式：下载到浏览器）
     */
    async exportToFile(): Promise<boolean> {
        try {
            const payload = this.buildFullBackupPayload('manual');
            const json = JSON.stringify(payload, null, 2);
            
            // Web 模式：使用浏览器下载
            const date = new Date();
            const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `neoview-backup-manual-${dateStr}.json`;
            
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`[AutoBackup] 导出成功: ${filename}`);
            return true;
        } catch (e) {
            console.error('[AutoBackup] 导出失败:', e);
            return false;
        }
    }

    /**
     * 从文件导入（Web 模式：使用文件选择器）
     */
    async importFromFile(): Promise<boolean> {
        return new Promise((resolve) => {
            // Web 模式：使用 HTML5 文件选择器
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) {
                    resolve(false);
                    return;
                }
                
                try {
                    const content = await file.text();
                    const payload = JSON.parse(content) as FullBackupPayload;
                    
                    // 恢复数据
                    const success = await this.restoreFromPayload(payload);
                    resolve(success);
                } catch (e) {
                    console.error('[AutoBackup] 导入失败:', e);
                    resolve(false);
                }
            };
            
            input.oncancel = () => resolve(false);
            input.click();
        });
    }

    /**
     * 从 payload 恢复数据（内部方法）
     */
    private async restoreFromPayload(payload: FullBackupPayload): Promise<boolean> {
        try {
            // 恢复 localStorage 数据
            if (payload.rawLocalStorage && typeof window !== 'undefined') {
                for (const [key, value] of Object.entries(payload.rawLocalStorage)) {
                    try {
                        localStorage.setItem(key, value);
                    } catch (e) {
                        console.error(`恢复 localStorage 键失败: ${key}`, e);
                    }
                }
            }

            // 使用现有的导入功能恢复其他数据
            if (payload.nativeSettings || payload.appSettings || payload.extendedData) {
                await settingsManager.applyFullPayload(
                    {
                        version: payload.version,
                        timestamp: payload.timestamp,
                        includeNativeSettings: !!payload.nativeSettings,
                        includeExtendedData: !!payload.extendedData,
                        nativeSettings: payload.nativeSettings,
                        appSettings: payload.appSettings,
                        extended: payload.extendedData
                    },
                    {
                        importNativeSettings: true,
                        modules: {
                            nativeSettings: true,
                            keybindings: true,
                            emmConfig: true,
                            fileBrowserSort: true,
                            uiState: true,
                            panelsLayout: true,
                            bookmarks: true,
                            history: true,
                            historySettings: true,
                            searchHistory: true,
                            upscaleSettings: true,
                            customThemes: true,
                            performanceSettings: true,
                            folderRatings: true
                        },
                        strategy: 'overwrite'
                    }
                );
            }

            console.log('[AutoBackup] 恢复成功');
            return true;
        } catch (e) {
            console.error('[AutoBackup] 恢复失败:', e);
            return false;
        }
    }

    /**
     * 获取下次备份时间
     */
    get nextBackupTime(): number | null {
        if (!this.settings.enabled || !this.settings.lastBackupTime) return null;
        return this.settings.lastBackupTime + this.settings.intervalMinutes * 60 * 1000;
    }

    /**
     * 格式化时间
     */
    formatTime(timestamp: number | null): string {
        if (!timestamp) return '从未';
        return new Date(timestamp).toLocaleString('zh-CN');
    }

    /**
     * 销毁
     */
    destroy() {
        this.stopScheduler();
    }
}

export const autoBackupStore = new AutoBackupStore();
