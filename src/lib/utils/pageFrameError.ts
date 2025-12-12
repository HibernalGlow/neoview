/**
 * PageFrame 错误处理工具
 *
 * 处理后端 PageFrame 系统返回的错误
 */

/** 错误信息接口（与后端 PageFrameErrorInfo 对应） */
export interface PageFrameErrorInfo {
	/** 错误代码 */
	code: string;
	/** 错误消息 */
	message: string;
	/** 是否可重试 */
	retryable: boolean;
}

/** 错误代码枚举 */
export const PageFrameErrorCode = {
	INDEX_OUT_OF_BOUNDS: 'INDEX_OUT_OF_BOUNDS',
	INVALID_POSITION: 'INVALID_POSITION',
	PAGE_NOT_FOUND: 'PAGE_NOT_FOUND',
	IMAGE_LOAD_FAILED: 'IMAGE_LOAD_FAILED',
	CACHE_ERROR: 'CACHE_ERROR',
	CONFIG_ERROR: 'CONFIG_ERROR',
	IO_ERROR: 'IO_ERROR',
	INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export type PageFrameErrorCodeType = (typeof PageFrameErrorCode)[keyof typeof PageFrameErrorCode];

/**
 * 解析后端错误
 */
export function parsePageFrameError(error: unknown): PageFrameErrorInfo {
	// 如果已经是 PageFrameErrorInfo 格式
	if (isPageFrameErrorInfo(error)) {
		return error;
	}

	// 如果是字符串
	if (typeof error === 'string') {
		return {
			code: PageFrameErrorCode.INTERNAL_ERROR,
			message: error,
			retryable: false
		};
	}

	// 如果是 Error 对象
	if (error instanceof Error) {
		return {
			code: PageFrameErrorCode.INTERNAL_ERROR,
			message: error.message,
			retryable: false
		};
	}

	// 未知错误
	return {
		code: PageFrameErrorCode.INTERNAL_ERROR,
		message: String(error),
		retryable: false
	};
}

/**
 * 检查是否为 PageFrameErrorInfo
 */
export function isPageFrameErrorInfo(error: unknown): error is PageFrameErrorInfo {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		'message' in error &&
		'retryable' in error
	);
}

/**
 * 获取用户友好的错误消息
 */
export function getErrorMessage(error: PageFrameErrorInfo): string {
	switch (error.code) {
		case PageFrameErrorCode.INDEX_OUT_OF_BOUNDS:
			return '页面索引超出范围';
		case PageFrameErrorCode.INVALID_POSITION:
			return '无效的页面位置';
		case PageFrameErrorCode.PAGE_NOT_FOUND:
			return '页面未找到';
		case PageFrameErrorCode.IMAGE_LOAD_FAILED:
			return '图片加载失败';
		case PageFrameErrorCode.CACHE_ERROR:
			return '缓存错误';
		case PageFrameErrorCode.CONFIG_ERROR:
			return '配置错误';
		case PageFrameErrorCode.IO_ERROR:
			return '文件读取错误';
		case PageFrameErrorCode.INTERNAL_ERROR:
		default:
			return error.message || '未知错误';
	}
}

/** 重试配置 */
export interface RetryConfig {
	/** 最大重试次数 */
	maxRetries: number;
	/** 初始延迟（毫秒） */
	initialDelay: number;
	/** 最大延迟（毫秒） */
	maxDelay: number;
	/** 延迟倍数（指数退避） */
	backoffMultiplier: number;
}

const defaultRetryConfig: RetryConfig = {
	maxRetries: 3,
	initialDelay: 100,
	maxDelay: 5000,
	backoffMultiplier: 2
};

/**
 * 带重试的异步操作
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	config: Partial<RetryConfig> = {}
): Promise<T> {
	const { maxRetries, initialDelay, maxDelay, backoffMultiplier } = {
		...defaultRetryConfig,
		...config
	};

	let lastError: unknown;
	let delay = initialDelay;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			const errorInfo = parsePageFrameError(error);

			// 如果不可重试，直接抛出
			if (!errorInfo.retryable) {
				throw error;
			}

			// 如果已达到最大重试次数，抛出错误
			if (attempt >= maxRetries) {
				throw error;
			}

			// 等待后重试
			console.warn(
				`[PageFrame] 操作失败，${delay}ms 后重试 (${attempt + 1}/${maxRetries}):`,
				errorInfo.message
			);
			await sleep(delay);

			// 指数退避
			delay = Math.min(delay * backoffMultiplier, maxDelay);
		}
	}

	throw lastError;
}

/**
 * 睡眠函数
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 错误边界状态
 */
export interface ErrorBoundaryState {
	hasError: boolean;
	error: PageFrameErrorInfo | null;
	retryCount: number;
}

/**
 * 创建错误边界状态
 */
export function createErrorBoundaryState(): ErrorBoundaryState {
	return {
		hasError: false,
		error: null,
		retryCount: 0
	};
}

/**
 * 设置错误
 */
export function setError(
	state: ErrorBoundaryState,
	error: unknown
): ErrorBoundaryState {
	return {
		...state,
		hasError: true,
		error: parsePageFrameError(error)
	};
}

/**
 * 清除错误
 */
export function clearError(state: ErrorBoundaryState): ErrorBoundaryState {
	return {
		...state,
		hasError: false,
		error: null
	};
}

/**
 * 增加重试计数
 */
export function incrementRetry(state: ErrorBoundaryState): ErrorBoundaryState {
	return {
		...state,
		retryCount: state.retryCount + 1
	};
}

/**
 * 重置重试计数
 */
export function resetRetry(state: ErrorBoundaryState): ErrorBoundaryState {
	return {
		...state,
		retryCount: 0
	};
}
