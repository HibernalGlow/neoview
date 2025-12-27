/**
 * AI 翻译服务配置工具函数
 */
import { invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';
import { toast } from 'svelte-sonner';
import { clearOllamaStatusCache } from '$lib/services/translationService';

// ============ Ollama 服务管理 ============

/**
 * 检查 Ollama 服务状态
 */
export async function checkOllamaStatus(apiUrl: string): Promise<boolean> {
	try {
		return await invoke<boolean>('ollama_check_status', { apiUrl });
	} catch {
		return false;
	}
}

/**
 * 启动 Ollama 服务
 */
export async function startOllamaService(): Promise<boolean> {
	try {
		const command = Command.create('ollama', ['serve']);
		command.on('error', (error) => {
			console.error('Ollama 启动错误:', error);
			toast.error('Ollama 启动失败: ' + error);
		});
		await command.spawn();
		toast.success('正在启动 Ollama 服务...');
		
		// 清除翻译服务中的状态缓存
		clearOllamaStatusCache();
		
		return true;
	} catch (e) {
		console.error('启动 Ollama 失败:', e);
		toast.error('启动 Ollama 失败: ' + e);
		return false;
	}
}

// ============ LibreTranslate 服务管理 ============

/**
 * 检查 LibreTranslate 服务状态
 */
export async function checkLibreTranslateStatus(url: string): Promise<boolean> {
	try {
		const response = await fetch(`${url}/languages`, {
			method: 'GET',
			signal: AbortSignal.timeout(3000)
		});
		return response.ok;
	} catch {
		return false;
	}
}

// ============ 清理规则处理 ============

/**
 * 应用清理规则到文本
 */
export function applyCleanupRules(
	text: string, 
	rules: Array<{ enabled: boolean; pattern: string }>
): string {
	let result = text;
	
	for (const rule of rules) {
		if (!rule.enabled || !rule.pattern) continue;
		try {
			const regex = new RegExp(rule.pattern, 'g');
			result = result.replace(regex, '');
		} catch (e) {
			// 忽略无效正则
		}
	}
	
	// 清理多余空格
	return result.replace(/\s+/g, ' ').trim();
}

// ============ 配置导入导出 ============

export interface AiConfigExport {
	version: number;
	exportedAt: string;
	config: {
		type: string;
		ollamaUrl: string;
		ollamaModel: string;
		ollamaPromptTemplate?: string;
		libreTranslateUrl: string;
		sourceLanguage: string;
		targetLanguage: string;
		cleanupRules?: any[];
	};
}

/**
 * 导出配置为 JSON 文件
 */
export function exportConfigToFile(config: AiConfigExport['config']): void {
	const exportData: AiConfigExport = {
		version: 1,
		exportedAt: new Date().toISOString(),
		config,
	};
	const json = JSON.stringify(exportData, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `ai-translation-config-${new Date().toISOString().split('T')[0]}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * 解析导入的配置文件
 */
export function parseImportedConfig(content: string): AiConfigExport | null {
	try {
		const data = JSON.parse(content) as AiConfigExport;
		if (!data.config || typeof data.config !== 'object') {
			toast.error('无效的配置文件格式');
			return null;
		}
		return data;
	} catch (e) {
		toast.error('解析配置文件失败: ' + e);
		return null;
	}
}

// ============ 字节格式化 ============

/**
 * 格式化字节大小为可读字符串
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
