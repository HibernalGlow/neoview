/**
 * TanStack AI 适配器
 * 将现有 AiProvider 配置转换为 TanStack AI 兼容格式
 */
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { AiProvider } from '$lib/stores/aiApiConfig.svelte';

/**
 * TanStack AI 配置接口
 */
export interface TanStackAIConfig {
	/** 语言模型实例 */
	model: LanguageModel;
	/** 温度参数 */
	temperature: number;
	/** 最大输出 token 数 */
	maxTokens: number;
	/** 原始提供商名称 */
	providerName: string;
}

/**
 * 将现有 AiProvider 配置转换为 TanStack AI 配置
 * 支持 OpenAI、Gemini 和 Ollama（OpenAI 兼容模式）
 * 
 * @param config - 现有的 AiProvider 配置
 * @returns TanStack AI 配置对象
 */
export function createTanStackProvider(config: AiProvider): TanStackAIConfig {
	if (config.provider === 'gemini') {
		// Google Gemini 提供商
		const google = createGoogleGenerativeAI({
			apiKey: config.apiKey,
		});

		return {
			model: google(config.model),
			temperature: config.temperature,
			maxTokens: config.maxTokens,
			providerName: config.name,
		};
	}

	// OpenAI 兼容提供商（包括 DeepSeek、Ollama、通义千问等）
	// 确保 baseURL 不包含 /chat/completions，SDK 会自动添加
	let baseURL = config.baseUrl;
	if (baseURL.endsWith('/chat/completions')) {
		baseURL = baseURL.slice(0, -'/chat/completions'.length);
	}

	const openai = createOpenAI({
		apiKey: config.apiKey || 'dummy-key', // Ollama 本地不需要 key
		baseURL
	});

	return {
		model: openai(config.model),
		temperature: config.temperature,
		maxTokens: config.maxTokens,
		providerName: config.name,
	};
}

/**
 * 检查提供商是否支持流式响应
 * 大多数现代 AI 提供商都支持流式响应
 */
export function supportsStreaming(config: AiProvider): boolean {
	// 所有主流提供商都支持流式响应
	return true;
}

/**
 * 检查提供商是否支持 JSON 模式
 */
export function supportsJsonMode(config: AiProvider): boolean {
	// Gemini 和大多数 OpenAI 兼容 API 支持 JSON 模式
	// Ollama 部分模型可能不支持
	if (config.baseUrl.includes('localhost:11434')) {
		// Ollama 本地模型，取决于具体模型
		return false;
	}
	return true;
}
