/**
 * AI 配置转换器
 * 在现有 AiProvider 格式和 TanStack AI 格式之间转换
 * 保持与 EMM 配置格式的兼容性
 */
import type { AiProvider, AiApiConfigJson } from '$lib/stores/aiApiConfig.svelte';
import { createTanStackProvider, type TanStackAIConfig } from './tanstackAdapter';

/**
 * 配置验证结果
 */
export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * 验证 AiProvider 配置是否有效
 * 
 * @param config - 要验证的配置
 * @returns 验证结果，包含错误和警告信息
 */
export function validateConfig(config: AiProvider): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// 检查必填字段
	if (!config.name || config.name.trim() === '') {
		errors.push('提供商名称不能为空');
	}

	if (!config.model || config.model.trim() === '') {
		errors.push('模型名称不能为空');
	}

	if (!config.baseUrl || config.baseUrl.trim() === '') {
		errors.push('Base URL 不能为空');
	}

	// 检查 API Key（本地服务除外）
	const isLocalService = config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1');
	if (!config.apiKey && !isLocalService) {
		errors.push('非本地服务需要提供 API Key');
	}

	// 检查 provider 类型
	if (config.provider !== 'openai' && config.provider !== 'gemini') {
		errors.push(`不支持的提供商类型: ${config.provider}`);
	}

	// 检查参数范围
	if (config.temperature < 0 || config.temperature > 2) {
		warnings.push('温度参数建议在 0-2 之间');
	}

	if (config.maxTokens < 1) {
		errors.push('最大 token 数必须大于 0');
	}

	if (config.maxTokens > 128000) {
		warnings.push('最大 token 数可能超出模型限制');
	}

	// 验证 URL 格式
	try {
		new URL(config.baseUrl);
	} catch {
		errors.push('Base URL 格式无效');
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * 将 AiProvider 配置转换为 TanStack AI 配置
 * 
 * @param config - 现有的 AiProvider 配置
 * @returns TanStack AI 配置，如果转换失败返回 null
 */
export function convertToTanStack(config: AiProvider): TanStackAIConfig | null {
	const validation = validateConfig(config);
	if (!validation.valid) {
		console.error('[configConverter] 配置验证失败:', validation.errors);
		return null;
	}

	try {
		return createTanStackProvider(config);
	} catch (error) {
		console.error('[configConverter] 转换失败:', error);
		return null;
	}
}

/**
 * 从 TanStack AI 配置提取基本信息（用于保存）
 * 注意：TanStack AI 配置不包含完整的原始信息，
 * 所以这个函数主要用于验证 round-trip
 * 
 * @param tanstackConfig - TanStack AI 配置
 * @param originalConfig - 原始 AiProvider 配置（用于补充信息）
 * @returns 重建的 AiProvider 配置
 */
export function convertFromTanStack(
	tanstackConfig: TanStackAIConfig,
	originalConfig: AiProvider
): AiProvider {
	// TanStack AI 配置不存储原始的 apiKey 和 baseUrl
	// 所以我们需要从原始配置中获取这些信息
	return {
		name: tanstackConfig.providerName || originalConfig.name,
		provider: originalConfig.provider,
		baseUrl: originalConfig.baseUrl,
		apiKey: originalConfig.apiKey,
		model: originalConfig.model,
		temperature: tanstackConfig.temperature,
		maxTokens: tanstackConfig.maxTokens,
	};
}

/**
 * 批量转换配置
 * 
 * @param configs - AiProvider 配置数组
 * @returns 成功转换的 TanStack AI 配置数组
 */
export function convertAllToTanStack(configs: AiProvider[]): TanStackAIConfig[] {
	return configs
		.map(convertToTanStack)
		.filter((config): config is TanStackAIConfig => config !== null);
}

/**
 * 导出配置为 EMM 兼容的 JSON 格式
 * 
 * @param providers - AiProvider 配置数组
 * @param activeIndex - 当前活动的提供商索引
 * @returns EMM 兼容的配置 JSON
 */
export function exportToEMMFormat(providers: AiProvider[], activeIndex: number): AiApiConfigJson {
	return {
		providers,
		activeIndex,
		comment: '翻译和 AI 标签推断的 API 配置。请填写正确的 API Key 并设置 activeIndex 选择要使用的提供商。',
	};
}

/**
 * 从 EMM 格式导入配置
 * 
 * @param json - EMM 格式的配置 JSON
 * @returns 解析后的配置，包含验证结果
 */
export function importFromEMMFormat(json: AiApiConfigJson): {
	providers: AiProvider[];
	activeIndex: number;
	validationResults: ValidationResult[];
} {
	const providers = json.providers || [];
	const activeIndex = Math.max(0, Math.min(json.activeIndex || 0, providers.length - 1));
	const validationResults = providers.map(validateConfig);

	return {
		providers,
		activeIndex,
		validationResults,
	};
}
