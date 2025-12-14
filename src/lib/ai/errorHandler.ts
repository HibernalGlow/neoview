/**
 * AI 错误处理模块
 * 统一处理不同 AI 提供商的错误，提供标准化的错误格式和重试逻辑
 */

/**
 * AI 错误代码
 */
export type AIErrorCode = 'NETWORK' | 'AUTH' | 'RATE_LIMIT' | 'PROVIDER' | 'STREAM' | 'TIMEOUT' | 'UNKNOWN';

/**
 * 标准化的 AI 错误
 */
export interface AIError {
	/** 错误代码 */
	code: AIErrorCode;
	/** 错误消息 */
	message: string;
	/** 是否可重试 */
	retryable: boolean;
	/** 建议的重试等待时间（毫秒） */
	retryAfter?: number;
	/** 原始错误 */
	originalError?: Error;
	/** 提供商名称 */
	provider?: string;
}

/**
 * 创建 AI 错误
 */
export function createAIError(
	code: AIErrorCode,
	message: string,
	options?: {
		retryable?: boolean;
		retryAfter?: number;
		originalError?: Error;
		provider?: string;
	}
): AIError {
	const retryableByDefault: Record<AIErrorCode, boolean> = {
		NETWORK: true,
		AUTH: false,
		RATE_LIMIT: true,
		PROVIDER: false,
		STREAM: true,
		TIMEOUT: true,
		UNKNOWN: false,
	};

	return {
		code,
		message,
		retryable: options?.retryable ?? retryableByDefault[code],
		retryAfter: options?.retryAfter,
		originalError: options?.originalError,
		provider: options?.provider,
	};
}

/**
 * 将任意错误转换为标准化的 AI 错误
 */
export function normalizeError(error: unknown, provider?: string): AIError {
	// 已经是 AIError
	if (isAIError(error)) {
		return { ...error, provider: provider || error.provider };
	}

	// 标准 Error 对象
	if (error instanceof Error) {
		const message = error.message.toLowerCase();

		// 网络错误
		if (
			message.includes('network') ||
			message.includes('fetch') ||
			message.includes('connection') ||
			message.includes('econnrefused')
		) {
			return createAIError('NETWORK', `网络错误: ${error.message}`, {
				originalError: error,
				provider,
				retryAfter: 1000,
			});
		}

		// 认证错误
		if (
			message.includes('unauthorized') ||
			message.includes('401') ||
			message.includes('api key') ||
			message.includes('authentication')
		) {
			return createAIError('AUTH', `认证失败: ${error.message}`, {
				originalError: error,
				provider,
			});
		}

		// 速率限制
		if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
			// 尝试从错误消息中提取重试时间
			const retryMatch = message.match(/retry after (\d+)/i);
			const retryAfter = retryMatch ? parseInt(retryMatch[1]) * 1000 : 60000;

			return createAIError('RATE_LIMIT', `请求频率超限: ${error.message}`, {
				originalError: error,
				provider,
				retryAfter,
			});
		}

		// 超时错误
		if (message.includes('timeout') || message.includes('timed out')) {
			return createAIError('TIMEOUT', `请求超时: ${error.message}`, {
				originalError: error,
				provider,
				retryAfter: 2000,
			});
		}

		// 流式错误
		if (message.includes('stream') || message.includes('abort')) {
			return createAIError('STREAM', `流式响应错误: ${error.message}`, {
				originalError: error,
				provider,
			});
		}

		// 提供商错误（模型不存在等）
		if (
			message.includes('model') ||
			message.includes('not found') ||
			message.includes('invalid') ||
			message.includes('400')
		) {
			return createAIError('PROVIDER', `提供商错误: ${error.message}`, {
				originalError: error,
				provider,
			});
		}

		// 未知错误
		return createAIError('UNKNOWN', error.message, {
			originalError: error,
			provider,
		});
	}

	// 非 Error 对象
	return createAIError('UNKNOWN', String(error), { provider });
}

/**
 * 检查是否是 AIError
 */
export function isAIError(error: unknown): error is AIError {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		'message' in error &&
		'retryable' in error
	);
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试的异步函数执行器
 * 
 * @param fn - 要执行的异步函数
 * @param options - 重试选项
 * @returns 函数执行结果
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options?: {
		/** 最大重试次数 */
		maxRetries?: number;
		/** 初始延迟（毫秒） */
		initialDelay?: number;
		/** 最大延迟（毫秒） */
		maxDelay?: number;
		/** 延迟倍数 */
		backoffMultiplier?: number;
		/** 重试前的回调 */
		onRetry?: (error: AIError, attempt: number) => void;
		/** 提供商名称 */
		provider?: string;
	}
): Promise<T> {
	const {
		maxRetries = 3,
		initialDelay = 1000,
		maxDelay = 30000,
		backoffMultiplier = 2,
		onRetry,
		provider,
	} = options || {};

	let lastError: AIError | null = null;
	let delay = initialDelay;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = normalizeError(error, provider);

			// 如果不可重试或已达到最大重试次数，抛出错误
			if (!lastError.retryable || attempt >= maxRetries) {
				throw lastError;
			}

			// 计算延迟时间
			const waitTime = lastError.retryAfter || Math.min(delay, maxDelay);

			// 调用重试回调
			onRetry?.(lastError, attempt + 1);

			// 等待后重试
			await sleep(waitTime);

			// 增加延迟时间（指数退避）
			delay = Math.min(delay * backoffMultiplier, maxDelay);
		}
	}

	// 不应该到达这里，但为了类型安全
	throw lastError || createAIError('UNKNOWN', '未知错误');
}

/**
 * 获取用户友好的错误消息
 */
export function getErrorMessage(error: AIError): string {
	const messages: Record<AIErrorCode, string> = {
		NETWORK: '网络连接失败，请检查网络设置',
		AUTH: 'API 认证失败，请检查 API Key 是否正确',
		RATE_LIMIT: '请求过于频繁，请稍后再试',
		PROVIDER: 'AI 服务出错，请检查配置',
		STREAM: '响应中断，请重试',
		TIMEOUT: '请求超时，请重试',
		UNKNOWN: '发生未知错误',
	};

	return messages[error.code] || error.message;
}
