/**
 * AI 标签推断模块
 * 使用 TanStack AI 从图片或文本推断标签
 */
import { generateText, streamText } from 'ai';
import { aiApiConfigStore } from '$lib/stores/aiApiConfig.svelte';
import { createTanStackProvider, supportsJsonMode } from './tanstackAdapter';
import { normalizeError, withRetry, getErrorMessage } from './errorHandler';

/**
 * 推断的标签
 */
export interface InferredTag {
	/** 标签名称 */
	name: string;
	/** 置信度 (0-1) */
	confidence: number;
	/** 标签类别（可选） */
	category?: string;
}

/**
 * 标签推断结果
 */
export interface TagInferenceResult {
	/** 是否成功 */
	success: boolean;
	/** 推断的标签列表 */
	tags?: InferredTag[];
	/** 错误信息 */
	error?: string;
}

/**
 * 标签推断选项
 */
export interface TagInferenceOptions {
	/** 要分析的文本（如文件名、描述等） */
	text?: string;
	/** 图片 base64 数据（如果支持多模态） */
	imageBase64?: string;
	/** 最大返回标签数 */
	maxTags?: number;
	/** 最小置信度阈值 */
	minConfidence?: number;
	/** 自定义 prompt */
	customPrompt?: string;
	/** 流式回调 */
	onChunk?: (chunk: string) => void;
}

/**
 * 默认标签推断 prompt
 */
const DEFAULT_TAG_PROMPT = `请分析以下内容，推断相关的标签。
返回 JSON 格式，包含 tags 数组，每个标签有 name（名称）、confidence（置信度 0-1）、category（类别，可选）。

内容：{text}

只返回 JSON，不要其他解释。示例格式：
{"tags": [{"name": "风景", "confidence": 0.9, "category": "主题"}]}`;

/**
 * 从文本推断标签
 * 
 * @param options - 推断选项
 * @returns 推断结果
 */
export async function inferTags(options: TagInferenceOptions): Promise<TagInferenceResult> {
	const {
		text,
		maxTags = 10,
		minConfidence = 0.5,
		customPrompt,
	} = options;

	if (!text) {
		return { success: false, error: '没有提供要分析的内容' };
	}

	const provider = aiApiConfigStore.getActiveProvider();
	if (!provider) {
		return { success: false, error: '没有配置 AI 提供商' };
	}

	const tanstackConfig = createTanStackProvider(provider);
	const useJsonMode = supportsJsonMode(provider);

	// 构建 prompt
	const prompt = (customPrompt || DEFAULT_TAG_PROMPT).replace('{text}', text);

	try {
		const result = await withRetry(
			async () => {
				const response = await generateText({
					model: tanstackConfig.model,
					prompt,
					temperature: 0.3, // 使用较低温度以获得更一致的结果
					maxOutputTokens: tanstackConfig.maxTokens,
				});

				return response.text;
			},
			{
				maxRetries: 2,
				provider: provider.name,
			}
		);

		// 解析结果
		const tags = parseTagResponse(result, maxTags, minConfidence);

		return {
			success: true,
			tags,
		};
	} catch (error) {
		const aiError = normalizeError(error, provider.name);
		return {
			success: false,
			error: getErrorMessage(aiError),
		};
	}
}

/**
 * 使用流式响应推断标签
 * 
 * @param options - 推断选项
 * @returns 推断结果
 */
export async function inferTagsWithStreaming(
	options: TagInferenceOptions
): Promise<TagInferenceResult> {
	const {
		text,
		maxTags = 10,
		minConfidence = 0.5,
		customPrompt,
		onChunk,
	} = options;

	if (!text) {
		return { success: false, error: '没有提供要分析的内容' };
	}

	const provider = aiApiConfigStore.getActiveProvider();
	if (!provider) {
		return { success: false, error: '没有配置 AI 提供商' };
	}

	const tanstackConfig = createTanStackProvider(provider);
	const prompt = (customPrompt || DEFAULT_TAG_PROMPT).replace('{text}', text);

	try {
		const result = await streamText({
			model: tanstackConfig.model,
			prompt,
			temperature: 0.3,
			maxOutputTokens: tanstackConfig.maxTokens,
		});

		let fullText = '';
		for await (const chunk of result.textStream) {
			fullText += chunk;
			onChunk?.(chunk);
		}

		const tags = parseTagResponse(fullText, maxTags, minConfidence);

		return {
			success: true,
			tags,
		};
	} catch (error) {
		const aiError = normalizeError(error, provider.name);
		return {
			success: false,
			error: getErrorMessage(aiError),
		};
	}
}

/**
 * 解析 AI 返回的标签响应
 */
function parseTagResponse(
	response: string,
	maxTags: number,
	minConfidence: number
): InferredTag[] {
	try {
		// 尝试提取 JSON
		const jsonMatch = response.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			console.warn('[tagInference] 无法从响应中提取 JSON:', response);
			return parseTextResponse(response, maxTags, minConfidence);
		}

		const parsed = JSON.parse(jsonMatch[0]);
		const tags: InferredTag[] = [];

		if (Array.isArray(parsed.tags)) {
			for (const tag of parsed.tags) {
				if (typeof tag.name === 'string' && typeof tag.confidence === 'number') {
					if (tag.confidence >= minConfidence) {
						tags.push({
							name: tag.name,
							confidence: tag.confidence,
							category: tag.category,
						});
					}
				}
			}
		}

		return tags.slice(0, maxTags);
	} catch (error) {
		console.warn('[tagInference] JSON 解析失败，尝试文本解析:', error);
		return parseTextResponse(response, maxTags, minConfidence);
	}
}

/**
 * 从纯文本响应解析标签（降级方案）
 */
function parseTextResponse(
	response: string,
	maxTags: number,
	_minConfidence: number
): InferredTag[] {
	const tags: InferredTag[] = [];

	// 尝试按行或逗号分割
	const lines = response.split(/[,\n]/).map(s => s.trim()).filter(Boolean);

	for (const line of lines) {
		// 移除常见的前缀
		const cleaned = line.replace(/^[-*•\d.)\]]+\s*/, '').trim();
		if (cleaned && cleaned.length > 0 && cleaned.length < 50) {
			tags.push({
				name: cleaned,
				confidence: 0.7, // 文本解析给予默认置信度
			});
		}
	}

	return tags.slice(0, maxTags);
}
