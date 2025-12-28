/**
 * AI 翻译服务配置工具函数
 */

/**
 * 格式化字节大小
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 测试裁剪规则 - 应用所有启用的规则到输入文本
 */
export function applyCleanupRules(
	text: string,
	rules: Array<{ pattern: string; enabled: boolean }>
): string {
	if (!text) return '';
	
	let result = text;
	for (const rule of rules) {
		if (!rule.enabled || !rule.pattern) continue;
		try {
			const regex = new RegExp(rule.pattern, 'g');
			result = result.replace(regex, '');
		} catch {
			// 忽略无效正则
		}
	}
	
	// 清理多余空格
	return result.replace(/\s+/g, ' ').trim();
}

/**
 * 导出配置为 JSON Blob
 */
export function exportConfigToBlob(config: {
	type: string;
	ollamaUrl?: string;
	ollamaModel?: string;
	ollamaPromptTemplate?: string;
	libreTranslateUrl?: string;
	sourceLanguage?: string;
	targetLanguage?: string;
	cleanupRules?: Array<unknown>;
}): Blob {
	const exportData = {
		version: 1,
		exportedAt: new Date().toISOString(),
		config: {
			type: config.type,
			ollamaUrl: config.ollamaUrl,
			ollamaModel: config.ollamaModel,
			ollamaPromptTemplate: config.ollamaPromptTemplate,
			libreTranslateUrl: config.libreTranslateUrl,
			sourceLanguage: config.sourceLanguage,
			targetLanguage: config.targetLanguage,
			cleanupRules: config.cleanupRules,
		},
	};
	const json = JSON.stringify(exportData, null, 2);
	return new Blob([json], { type: 'application/json' });
}

/**
 * 下载 Blob 文件
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * 生成配置导出文件名
 */
export function generateExportFilename(): string {
	return `ai-translation-config-${new Date().toISOString().split('T')[0]}.json`;
}

/**
 * 生成 LibreTranslate 启动命令
 */
export function generateLibreTranslateCommand(
	url: string,
	sourceLanguage: string,
	targetLanguage: string
): string {
	try {
		const parsedUrl = new URL(url || 'http://localhost:5000');
		const host = parsedUrl.hostname;
		const port = parsedUrl.port || '5000';
		
		// 收集需要的语言
		const langs = new Set<string>();
		if (sourceLanguage && sourceLanguage !== 'auto') {
			langs.add(sourceLanguage);
		} else {
			// 自动检测时默认加载日语
			langs.add('ja');
		}
		langs.add(targetLanguage || 'zh');
		// 英语作为中转语言
		langs.add('en');
		
		const langList = Array.from(langs).sort().join(',');
		
		return `libretranslate --host ${host} --port ${port} --load-only ${langList}`;
	} catch {
		return 'libretranslate --host 0.0.0.0 --port 5000 --load-only en,ja,zh';
	}
}

/**
 * 服务类型选项
 */
export const SERVICE_TYPE_OPTIONS = [
	{ value: 'disabled', label: '禁用' },
	{ value: 'libretranslate', label: 'LibreTranslate' },
	{ value: 'ollama', label: 'Ollama (本地模型)' },
] as const;

/**
 * 源语言选项
 */
export const SOURCE_LANGUAGE_OPTIONS = [
	{ value: 'auto', label: '自动检测' },
	{ value: 'ja', label: '日语' },
	{ value: 'en', label: '英语' },
	{ value: 'ko', label: '韩语' },
] as const;

/**
 * 目标语言选项
 */
export const TARGET_LANGUAGE_OPTIONS = [
	{ value: 'zh', label: '中文' },
	{ value: 'en', label: '英语' },
] as const;
