/**
 * 翻译集成模块
 * 将 TanStack AI 流式翻译与现有缓存机制集成
 */
import { aiTranslationStore, type TranslationServiceType } from '$lib/stores/ai/translationStore.svelte';
import { aiApiConfigStore } from '$lib/stores/aiApiConfig.svelte';
import { createTanStackProvider } from './tanstackAdapter';
import { translateWithStreaming, translateWithoutStreaming, type StreamingTranslationResult } from './streamingTranslation';
import { invoke } from '@tauri-apps/api/core';

/**
 * AI 翻译数据库缓存接口
 */
interface AiTranslationCache {
	title: string;
	service: 'libre' | 'ollama' | 'tanstack';
	model?: string;
	timestamp: number;
}

/**
 * 保存 AI 翻译到数据库
 */
async function saveAiTranslationToDb(
	key: string,
	title: string,
	service: 'libre' | 'ollama' | 'tanstack',
	model?: string
): Promise<void> {
	try {
		const cache: AiTranslationCache = {
			title,
			service,
			model,
			timestamp: Date.now(),
		};
		await invoke('save_ai_translation', { key, aiTranslationJson: JSON.stringify(cache) });
	} catch (e) {
		console.warn('[translationIntegration] 保存到数据库失败:', e);
	}
}

/**
 * 从数据库读取 AI 翻译缓存
 */
async function loadAiTranslationFromDb(key: string, modelFilter?: string): Promise<AiTranslationCache | null> {
	try {
		const json = await invoke<string | null>('load_ai_translation', { key, modelFilter });
		if (json) {
			return JSON.parse(json);
		}
	} catch {
		// 数据库读取失败，忽略
	}
	return null;
}

/**
 * 流式翻译选项
 */
export interface IntegratedTranslationOptions {
	/** 要翻译的文本 */
	text: string;
	/** 源语言 */
	sourceLang?: string;
	/** 目标语言 */
	targetLang?: string;
	/** 是否使用流式响应 */
	streaming?: boolean;
	/** 自定义 prompt 模板 */
	promptTemplate?: string;
	/** 收到新内容块时的回调 */
	onChunk?: (chunk: string, accumulated: string) => void;
	/** 翻译完成时的回调 */
	onComplete?: (result: string) => void;
	/** 发生错误时的回调 */
	onError?: (error: Error) => void;
	/** 跳过缓存检查 */
	skipCache?: boolean;
}

/**
 * 使用 TanStack AI 进行翻译（集成缓存）
 * 
 * @param options - 翻译选项
 * @returns 翻译结果
 */
export async function translateWithTanStack(
	options: IntegratedTranslationOptions
): Promise<StreamingTranslationResult> {
	const {
		text,
		sourceLang = 'auto',
		targetLang = 'zh',
		streaming = false,
		promptTemplate,
		onChunk,
		onComplete,
		onError,
		skipCache = false,
	} = options;

	// 获取当前活动的 AI 提供商配置
	const provider = aiApiConfigStore.getActiveProvider();
	if (!provider) {
		const error = '没有配置 AI 提供商';
		onError?.(new Error(error));
		return { success: false, error };
	}

	// 检查内存缓存
	if (!skipCache) {
		const cached = aiTranslationStore.getCachedTranslation(text);
		if (cached) {
			onComplete?.(cached);
			return { success: true, translated: cached };
		}

		// 检查数据库缓存
		const dbCached = await loadAiTranslationFromDb(text, provider.model);
		if (dbCached) {
			// 同步到内存缓存
			const serviceType: TranslationServiceType = 'ollama'; // TanStack 使用 ollama 类型存储
			aiTranslationStore.addToCache(text, dbCached.title, serviceType);
			onComplete?.(dbCached.title);
			return { success: true, translated: dbCached.title };
		}
	}

	// 创建 TanStack AI 配置
	const tanstackConfig = createTanStackProvider(provider);

	// 设置翻译状态
	aiTranslationStore.setTranslating(true);
	aiTranslationStore.setError(null);
	aiTranslationStore.incrementApiCalls();

	try {
		let result: StreamingTranslationResult;

		if (streaming) {
			result = await translateWithStreaming(tanstackConfig, {
				text,
				sourceLang,
				targetLang,
				promptTemplate,
				onChunk,
				onComplete: (translated) => {
					// 缓存结果
					cacheTranslationResult(text, translated, provider.model);
					onComplete?.(translated);
				},
				onError,
			});
		} else {
			result = await translateWithoutStreaming(tanstackConfig, {
				text,
				sourceLang,
				targetLang,
				promptTemplate,
				onComplete: (translated) => {
					// 缓存结果
					cacheTranslationResult(text, translated, provider.model);
					onComplete?.(translated);
				},
				onError,
			});
		}

		if (!result.success && result.error) {
			aiTranslationStore.setError(result.error);
		}

		return result;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : '未知错误';
		aiTranslationStore.setError(errorMessage);
		onError?.(error instanceof Error ? error : new Error(errorMessage));
		return { success: false, error: errorMessage };
	} finally {
		aiTranslationStore.setTranslating(false);
	}
}

/**
 * 缓存翻译结果
 */
function cacheTranslationResult(original: string, translated: string, model?: string): void {
	// 内存缓存
	const serviceType: TranslationServiceType = 'ollama'; // TanStack 使用 ollama 类型存储
	aiTranslationStore.addToCache(original, translated, serviceType);

	// 数据库缓存（异步，不阻塞）
	saveAiTranslationToDb(original, translated, 'tanstack', model);
}

/**
 * 检查 TanStack AI 是否可用
 */
export function isTanStackAvailable(): boolean {
	const provider = aiApiConfigStore.getActiveProvider();
	return provider !== null;
}
