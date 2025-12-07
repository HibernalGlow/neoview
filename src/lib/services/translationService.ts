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

/**
 * 使用 Ollama 本地模型翻译
 */
async function translateWithOllama(
	text: string,
	sourceLang: string,
	targetLang: string,
	apiUrl: string,
	model: string
): Promise<TranslationResult> {
	const sourceLangName = sourceLang === 'ja' ? '日语' : sourceLang === 'en' ? '英语' : '原文';
	const targetLangName = targetLang === 'zh' ? '中文' : targetLang === 'en' ? '英语' : '目标语言';

	const prompt = `请将以下${sourceLangName}文本翻译成${targetLangName}，只输出翻译结果，不要解释：

${text}`;

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
 */
export async function translateText(text: string): Promise<TranslationResult> {
	const config = aiTranslationStore.getConfig();

	if (!config.enabled || config.type === 'disabled') {
		return { success: false, error: '翻译服务未启用' };
	}

	// 检查缓存
	const cached = aiTranslationStore.getCachedTranslation(text);
	if (cached) {
		return { success: true, translated: cached };
	}

	// 检测源语言
	let sourceLang = config.sourceLanguage;
	if (sourceLang === 'auto') {
		const detected = detectLanguage(text);
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
					text,
					sourceLang,
					config.targetLanguage,
					config.libreTranslateUrl,
					config.libreTranslateApiKey
				);
				break;
			case 'ollama':
				result = await translateWithOllama(
					text,
					sourceLang,
					config.targetLanguage,
					config.ollamaUrl,
					config.ollamaModel
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
