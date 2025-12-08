/**
 * 翻译服务
 * 支持 LibreTranslate 和 Ollama 本地模型
 */

import { aiTranslationStore } from '$lib/stores/ai/translationStore.svelte';

export interface TranslationResult {
	success: boolean;
	translated?: string;
	error?: string;
}

/**
 * 检测文本是否包含日文字符
 */
export function containsJapanese(text: string): boolean {
	// 平假名: \u3040-\u309F
	// 片假名: \u30A0-\u30FF
	// 日文汉字常用范围: \u4E00-\u9FAF (与中文共用)
	// 日文特殊字符: \u3000-\u303F
	const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
	return japaneseRegex.test(text);
}

/**
 * 检测文本是否需要翻译（源语言与目标语言不同）
 */
export function needsTranslation(text: string, targetLanguage: string): boolean {
	const detected = detectLanguage(text);
	// 如果检测结果是 unknown，默认需要翻译
	if (detected === 'unknown') return true;
	// 源语言与目标语言相同，不需要翻译
	return detected !== targetLanguage;
}

/**
 * 使用正则模式清理标题（去除不需要翻译的部分）
 */
export function cleanupTitle(title: string, patterns: string[]): string {
	let cleaned = title;
	for (const pattern of patterns) {
		try {
			const regex = new RegExp(pattern, 'g');
			cleaned = cleaned.replace(regex, '');
		} catch (e) {
			console.warn('[翻译] 无效的裁剪正则:', pattern, e);
		}
	}
	// 清理多余空格
	return cleaned.replace(/\s+/g, ' ').trim();
}

// 文件类型扩展名映射
const FILE_TYPE_EXT_MAP: Record<string, string[]> = {
	folder: ['folder'],
	archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cbz', 'cbr', 'cb7'],
	image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'jxl', 'avif'],
	video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'],
};

/**
 * 根据扩展名获取文件类型 key
 */
function getFileTypeKey(extension: string): string | null {
	const ext = extension.toLowerCase();
	for (const [typeKey, exts] of Object.entries(FILE_TYPE_EXT_MAP)) {
		if (exts.includes(ext)) {
			return typeKey;
		}
	}
	return null;
}

interface CleanupRule {
	id: string;
	pattern: string;
	enabled: boolean;
	applyTo: string[];
	description?: string;
}

/**
 * 根据文件扩展名获取适用的裁剪规则
 * @param extension 文件扩展名（不含点），文件夹传 'folder'
 * @param config 翻译配置
 */
export function getCleanupPatternsForType(
	extension: string,
	config: {
		titleCleanupPatterns: string[];
		titleCleanupByType?: Record<string, string[]>;
		cleanupRules?: CleanupRule[];
	}
): string[] {
	const ext = extension.toLowerCase();
	const typeKey = getFileTypeKey(ext);
	
	// 优先使用新版 cleanupRules
	if (config.cleanupRules && config.cleanupRules.length > 0) {
		const patterns: string[] = [];
		for (const rule of config.cleanupRules) {
			if (!rule.enabled) continue;
			
			// 检查是否适用于当前文件类型
			const applies = rule.applyTo.includes('all') ||
				(typeKey && rule.applyTo.includes(typeKey)) ||
				rule.applyTo.includes(ext); // 支持直接指定扩展名
			
			if (applies) {
				patterns.push(rule.pattern);
			}
		}
		return patterns;
	}
	
	// 旧版兼容：使用 titleCleanupByType
	const byType = config.titleCleanupByType;
	if (byType && Object.keys(byType).length > 0) {
		// 直接匹配扩展名
		if (ext in byType) {
			return byType[ext];
		}
		// 类型匹配
		if (typeKey && typeKey in byType) {
			return byType[typeKey];
		}
	}
	
	// 使用默认规则
	return config.titleCleanupPatterns;
}

/**
 * 检测文本的主要语言
 */
export function detectLanguage(text: string): 'ja' | 'zh' | 'en' | 'unknown' {
	if (containsJapanese(text)) {
		return 'ja';
	}
	// 简单的中文检测（没有平假名/片假名但有汉字）
	const chineseRegex = /[\u4E00-\u9FAF]/;
	if (chineseRegex.test(text)) {
		return 'zh';
	}
	// 英文检测
	const englishRegex = /^[a-zA-Z0-9\s\-_[\]().,'": ;!?]+$/;
	if (englishRegex.test(text)) {
		return 'en';
	}
	return 'unknown';
}

/**
 * 使用 LibreTranslate API 翻译
 */
async function translateWithLibreTranslate(
	text: string,
	sourceLang: string,
	targetLang: string,
	apiUrl: string,
	apiKey: string
): Promise<TranslationResult> {
	try {
		const response = await fetch(`${apiUrl}/translate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				q: text,
				source: sourceLang === 'auto' ? 'auto' : sourceLang,
				target: targetLang,
				api_key: apiKey || undefined,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return { success: false, error: `LibreTranslate 错误: ${response.status} - ${errorText}` };
		}

		const data = await response.json();
		return { success: true, translated: data.translatedText };
	} catch (error) {
		return { success: false, error: `LibreTranslate 请求失败: ${error}` };
	}
}

// 语言代码到名称的映射
const LANG_NAMES: Record<string, string> = {
	ja: '日语',
	en: '英语',
	zh: '中文',
	ko: '韩语',
	auto: '原文',
};

/**
 * 解析 prompt 模板，替换变量
 * 支持变量: {text}, {source_lang}, {target_lang}, {filename}
 */
function parsePromptTemplate(
	template: string,
	text: string,
	sourceLang: string,
	targetLang: string,
	filename?: string
): string {
	const sourceLangName = LANG_NAMES[sourceLang] || sourceLang;
	const targetLangName = LANG_NAMES[targetLang] || targetLang;
	
	return template
		.replace(/\{text\}/g, text)
		.replace(/\{source_lang\}/g, sourceLangName)
		.replace(/\{target_lang\}/g, targetLangName)
		.replace(/\{filename\}/g, filename || text);
}

/**
 * 使用 Ollama 本地模型翻译
 */
async function translateWithOllama(
	text: string,
	sourceLang: string,
	targetLang: string,
	apiUrl: string,
	model: string,
	promptTemplate?: string
): Promise<TranslationResult> {
	// 使用自定义模板或默认模板
	const template = promptTemplate || '请将以下{source_lang}文本翻译成{target_lang}，只返回翻译结果，不要解释：\n{text}';
	const prompt = parsePromptTemplate(template, text, sourceLang, targetLang);

	try {
		const response = await fetch(`${apiUrl}/api/generate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model,
				prompt,
				stream: false,
				options: {
					temperature: 0.3,
					num_predict: 256,
				},
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return { success: false, error: `Ollama 错误: ${response.status} - ${errorText}` };
		}

		const data = await response.json();
		const translated = data.response?.trim();
		if (!translated) {
			return { success: false, error: 'Ollama 返回空结果' };
		}
		return { success: true, translated };
	} catch (error) {
		return { success: false, error: `Ollama 请求失败: ${error}` };
	}
}

/**
 * 翻译文本（自动选择服务）
 * @param text 原始文本
 * @param options 可选配置
 * @param options.skipCleanup 是否跳过标题清理（默认 false）
 * @param options.fileExtension 文件扩展名，用于选择裁剪规则（文件夹传 'folder'）
 */
export async function translateText(
	text: string,
	options: { skipCleanup?: boolean; fileExtension?: string } = {}
): Promise<TranslationResult> {
	const { skipCleanup = false, fileExtension } = options;
	const config = aiTranslationStore.getConfig();

	if (!config.enabled || config.type === 'disabled') {
		return { success: false, error: '翻译服务未启用' };
	}

	// 根据文件类型获取裁剪规则
	const patterns = fileExtension
		? getCleanupPatternsForType(fileExtension, config)
		: config.titleCleanupPatterns;

	// 应用标题清理（如果配置了裁剪正则）
	let textToTranslate = text;
	if (!skipCleanup && patterns?.length > 0) {
		textToTranslate = cleanupTitle(text, patterns);
		// 如果清理后为空，返回原文
		if (!textToTranslate) {
			return { success: true, translated: text };
		}
	}

	// 检查缓存（使用原始文本作为 key）
	const cached = aiTranslationStore.getCachedTranslation(text);
	if (cached) {
		return { success: true, translated: cached };
	}

	// 检测源语言（使用清理后的文本）
	let sourceLang = config.sourceLanguage;
	if (sourceLang === 'auto') {
		const detected = detectLanguage(textToTranslate);
		if (detected === 'unknown') {
			sourceLang = 'ja'; // 默认假设日语
		} else {
			sourceLang = detected;
		}
	}

	// 如果源语言和目标语言相同，不翻译
	if (sourceLang === config.targetLanguage) {
		return { success: true, translated: text };
	}

	aiTranslationStore.setTranslating(true);
	aiTranslationStore.setError(null);

	let result: TranslationResult;

	try {
		aiTranslationStore.incrementApiCalls();

		switch (config.type) {
			case 'libretranslate':
				result = await translateWithLibreTranslate(
					textToTranslate,
					sourceLang,
					config.targetLanguage,
					config.libreTranslateUrl,
					config.libreTranslateApiKey
				);
				break;
			case 'ollama':
				result = await translateWithOllama(
					textToTranslate,
					sourceLang,
					config.targetLanguage,
					config.ollamaUrl,
					config.ollamaModel,
					config.ollamaPromptTemplate
				);
				break;
			default:
				result = { success: false, error: '未知的翻译服务类型' };
		}

		if (result.success && result.translated) {
			// 缓存成功的翻译
			aiTranslationStore.addToCache(text, result.translated, config.type);
		} else if (result.error) {
			aiTranslationStore.setError(result.error);
		}
	} catch (error) {
		result = { success: false, error: `翻译失败: ${error}` };
		aiTranslationStore.setError(result.error || null);
	} finally {
		aiTranslationStore.setTranslating(false);
	}

	return result;
}

/**
 * 批量翻译（带速率限制）
 */
export async function translateBatch(
	texts: string[],
	onProgress?: (current: number, total: number) => void
): Promise<Map<string, string>> {
	const results = new Map<string, string>();
	const config = aiTranslationStore.getConfig();

	if (!config.enabled || config.type === 'disabled') {
		return results;
	}

	for (let i = 0; i < texts.length; i++) {
		const text = texts[i];
		onProgress?.(i + 1, texts.length);

		const result = await translateText(text);
		if (result.success && result.translated) {
			results.set(text, result.translated);
		}

		// 速率限制：每次请求间隔 100ms
		if (i < texts.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	return results;
}

/**
 * 测试翻译服务连接
 */
export async function testConnection(): Promise<TranslationResult> {
	const config = aiTranslationStore.getConfig();

	if (config.type === 'disabled') {
		return { success: false, error: '请先选择翻译服务' };
	}

	const testText = 'こんにちは';

	switch (config.type) {
		case 'libretranslate':
			return translateWithLibreTranslate(
				testText,
				'ja',
				'zh',
				config.libreTranslateUrl,
				config.libreTranslateApiKey
			);
		case 'ollama':
			return translateWithOllama(testText, 'ja', 'zh', config.ollamaUrl, config.ollamaModel);
		default:
			return { success: false, error: '未知的翻译服务类型' };
	}
}
