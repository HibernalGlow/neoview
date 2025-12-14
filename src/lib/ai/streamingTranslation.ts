/**
 * 流式翻译服务
 * 使用 TanStack AI 的 streamText API 实现流式翻译
 */
import { streamText, generateText } from 'ai';
import type { TanStackAIConfig } from './tanstackAdapter';

/**
 * 语言代码到名称的映射
 */
const LANG_NAMES: Record<string, string> = {
	ja: '日语',
	en: '英语',
	zh: '中文',
	ko: '韩语',
	auto: '原文',
};

/**
 * 流式翻译选项
 */
export interface StreamingTranslationOptions {
	/** 要翻译的文本 */
	text: string;
	/** 源语言代码 */
	sourceLang: string;
	/** 目标语言代码 */
	targetLang: string;
	/** 自定义 prompt 模板 */
	promptTemplate?: string;
	/** 收到新内容块时的回调 */
	onChunk?: (chunk: string, accumulated: string) => void;
	/** 翻译完成时的回调 */
	onComplete?: (result: string) => void;
	/** 发生错误时的回调 */
	onError?: (error: Error) => void;
	/** AbortController 信号，用于取消请求 */
	abortSignal?: AbortSignal;
}

/**
 * 流式翻译结果
 */
export interface StreamingTranslationResult {
	/** 是否成功 */
	success: boolean;
	/** 翻译结果 */
	translated?: string;
	/** 错误信息 */
	error?: string;
	/** 是否被中断 */
	aborted?: boolean;
}

/**
 * 解析 prompt 模板，替换变量
 */
function parsePromptTemplate(
	template: string,
	text: string,
	sourceLang: string,
	targetLang: string
): string {
	const sourceLangName = LANG_NAMES[sourceLang] || sourceLang;
	const targetLangName = LANG_NAMES[targetLang] || targetLang;

	return template
		.replace(/\{text\}/g, text)
		.replace(/\{source_lang\}/g, sourceLangName)
		.replace(/\{target_lang\}/g, targetLangName);
}

/**
 * 默认翻译 prompt 模板
 */
const DEFAULT_PROMPT_TEMPLATE = '请将以下{source_lang}文本翻译成{target_lang}，只返回翻译结果，不要解释：\n{text}';

/**
 * 使用流式响应进行翻译
 * 
 * @param config - TanStack AI 配置
 * @param options - 翻译选项
 * @returns 翻译结果
 */
export async function translateWithStreaming(
	config: TanStackAIConfig,
	options: StreamingTranslationOptions
): Promise<StreamingTranslationResult> {
	const {
		text,
		sourceLang,
		targetLang,
		promptTemplate = DEFAULT_PROMPT_TEMPLATE,
		onChunk,
		onComplete,
		onError,
		abortSignal,
	} = options;

	const prompt = parsePromptTemplate(promptTemplate, text, sourceLang, targetLang);

	try {
		const result = await streamText({
			model: config.model,
			prompt,
			temperature: config.temperature,
			maxTokens: config.maxTokens,
			abortSignal,
		});

		let fullText = '';

		for await (const chunk of result.textStream) {
			fullText += chunk;
			onChunk?.(chunk, fullText);
		}

		// 清理结果（去除可能的引号和多余空白）
		const cleanedResult = fullText.trim().replace(/^["']|["']$/g, '');

		onComplete?.(cleanedResult);

		return {
			success: true,
			translated: cleanedResult,
		};
	} catch (error) {
		// 检查是否是中断错误
		if (error instanceof Error && error.name === 'AbortError') {
			return {
				success: false,
				aborted: true,
				error: '翻译被取消',
			};
		}

		const errorMessage = error instanceof Error ? error.message : '未知错误';
		onError?.(error instanceof Error ? error : new Error(errorMessage));

		return {
			success: false,
			error: `翻译失败: ${errorMessage}`,
		};
	}
}

/**
 * 使用非流式响应进行翻译（用于不需要实时显示的场景）
 * 
 * @param config - TanStack AI 配置
 * @param options - 翻译选项（不包含流式回调）
 * @returns 翻译结果
 */
export async function translateWithoutStreaming(
	config: TanStackAIConfig,
	options: Omit<StreamingTranslationOptions, 'onChunk'>
): Promise<StreamingTranslationResult> {
	const {
		text,
		sourceLang,
		targetLang,
		promptTemplate = DEFAULT_PROMPT_TEMPLATE,
		onComplete,
		onError,
		abortSignal,
	} = options;

	const prompt = parsePromptTemplate(promptTemplate, text, sourceLang, targetLang);

	try {
		const result = await generateText({
			model: config.model,
			prompt,
			temperature: config.temperature,
			maxTokens: config.maxTokens,
			abortSignal,
		});

		const cleanedResult = result.text.trim().replace(/^["']|["']$/g, '');

		onComplete?.(cleanedResult);

		return {
			success: true,
			translated: cleanedResult,
		};
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			return {
				success: false,
				aborted: true,
				error: '翻译被取消',
			};
		}

		const errorMessage = error instanceof Error ? error.message : '未知错误';
		onError?.(error instanceof Error ? error : new Error(errorMessage));

		return {
			success: false,
			error: `翻译失败: ${errorMessage}`,
		};
	}
}
