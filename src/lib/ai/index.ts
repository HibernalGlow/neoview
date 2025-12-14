/**
 * AI 模块统一导出
 * 提供 TanStack AI 相关功能的统一入口
 */

// 适配器
export { createTanStackProvider, supportsStreaming, supportsJsonMode } from './tanstackAdapter';
export type { TanStackAIConfig } from './tanstackAdapter';

// 配置转换
export {
	validateConfig,
	convertToTanStack,
	convertFromTanStack,
	convertAllToTanStack,
	exportToEMMFormat,
	importFromEMMFormat,
} from './configConverter';
export type { ValidationResult } from './configConverter';

// 流式翻译
export { translateWithStreaming, translateWithoutStreaming } from './streamingTranslation';
export type { StreamingTranslationOptions, StreamingTranslationResult } from './streamingTranslation';

// 翻译集成
export { translateWithTanStack, isTanStackAvailable } from './translationIntegration';
export type { IntegratedTranslationOptions } from './translationIntegration';

// 标签推断
export { inferTags, inferTagsWithStreaming } from './tagInference';
export type { InferredTag, TagInferenceResult, TagInferenceOptions } from './tagInference';

// 错误处理
export {
	createAIError,
	normalizeError,
	isAIError,
	withRetry,
	getErrorMessage,
} from './errorHandler';
export type { AIError, AIErrorCode } from './errorHandler';

// 消息序列化
export {
	serializeMessage,
	deserializeMessage,
	serializeMessages,
	deserializeMessages,
	serializeSession,
	deserializeSession,
	isValidSerializedMessages,
} from './messageSerializer';
export type { SerializedMessage, SerializedSession } from './messageSerializer';
