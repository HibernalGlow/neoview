/**
 * NeoView - Async Store Utility
 * 异步操作状态管理工具函数 (Svelte 5 Runes)
 * 
 * 提供统一的异步操作状态管理模式，包括 loading、error、data 状态
 */

/**
 * 异步操作状态
 */
export interface AsyncState<T, E = Error> {
	/** 数据 */
	data: T | null;
	/** 是否正在加载 */
	isLoading: boolean;
	/** 错误信息 */
	error: E | null;
	/** 是否已执行过 */
	isExecuted: boolean;
	/** 是否成功 */
	isSuccess: boolean;
	/** 是否失败 */
	isError: boolean;
}

/**
 * 异步 store 配置选项
 */
export interface AsyncStoreOptions<T, Args extends unknown[]> {
	/** 异步操作函数 */
	fetcher: (...args: Args) => Promise<T>;
	/** 初始数据 */
	initialData?: T | null;
	/** 是否自动取消之前的请求，默认 true */
	cancelPrevious?: boolean;
	/** 是否启用去重 */
	dedupe?: boolean;
	/** 去重时间窗口（毫秒），默认 0（同参数永不重复） */
	dedupeInterval?: number;
	/** 成功回调 */
	onSuccess?: (data: T) => void;
	/** 失败回调 */
	onError?: (error: Error) => void;
}

/**
 * 异步 store 返回类型
 */
export interface AsyncStore<T, Args extends unknown[]> {
	/** 当前状态（响应式） */
	readonly state: AsyncState<T>;
	/** 便捷访问器 */
	readonly data: T | null;
	readonly isLoading: boolean;
	readonly error: Error | null;
	readonly isSuccess: boolean;
	readonly isError: boolean;
	/** 执行异步操作 */
	execute(...args: Args): Promise<T>;
	/** 重置状态 */
	reset(): void;
	/** 重试上次操作 */
	retry(): Promise<T | null>;
	/** 取消当前操作 */
	cancel(): void;
	/** 手动设置数据 */
	setData(data: T | null): void;
	/** 手动设置错误 */
	setError(error: Error | null): void;
}

/**
 * 创建异步 store
 * 
 * @example
 * ```ts
 * const userStore = createAsyncStore({
 *   fetcher: async (id: string) => {
 *     const res = await fetch(`/api/users/${id}`);
 *     return res.json();
 *   },
 *   onSuccess: (user) => console.log('Loaded:', user),
 *   onError: (err) => console.error('Failed:', err)
 * });
 * 
 * // 执行
 * await userStore.execute('123');
 * 
 * // 访问状态
 * console.log(userStore.data);
 * console.log(userStore.isLoading);
 * 
 * // 重试
 * await userStore.retry();
 * 
 * // 取消
 * userStore.cancel();
 * ```
 */
export function createAsyncStore<T, Args extends unknown[] = []>(
	options: AsyncStoreOptions<T, Args>
): AsyncStore<T, Args> {
	const {
		fetcher,
		initialData = null,
		cancelPrevious = true,
		dedupe = false,
		dedupeInterval = 0,
		onSuccess,
		onError
	} = options;

	// 内部状态
	let _state = $state<AsyncState<T>>({
		data: initialData,
		isLoading: false,
		error: null,
		isExecuted: false,
		isSuccess: false,
		isError: false
	});

	// 取消控制器
	let abortController: AbortController | null = null;
	
	// 上次执行的参数（用于 retry）
	let lastArgs: Args | null = null;
	
	// 去重缓存：参数序列化 -> { timestamp, promise }
	const dedupeCache = new Map<string, { timestamp: number; promise: Promise<T> }>();
	
	// 当前执行 ID（用于检测取消）
	let currentExecutionId = 0;

	/**
	 * 序列化参数用于去重
	 */
	function serializeArgs(args: Args): string {
		try {
			return JSON.stringify(args);
		} catch {
			return String(args);
		}
	}

	/**
	 * 检查去重缓存
	 */
	function checkDedupeCache(args: Args): Promise<T> | null {
		if (!dedupe) return null;
		
		const key = serializeArgs(args);
		const cached = dedupeCache.get(key);
		
		if (cached) {
			const now = Date.now();
			if (dedupeInterval === 0 || now - cached.timestamp < dedupeInterval) {
				return cached.promise;
			}
			// 缓存过期，删除
			dedupeCache.delete(key);
		}
		
		return null;
	}

	/**
	 * 设置去重缓存
	 */
	function setDedupeCache(args: Args, promise: Promise<T>): void {
		if (!dedupe) return;
		
		const key = serializeArgs(args);
		dedupeCache.set(key, {
			timestamp: Date.now(),
			promise
		});
	}

	return {
		get state() {
			return _state;
		},
		
		get data() {
			return _state.data;
		},
		
		get isLoading() {
			return _state.isLoading;
		},
		
		get error() {
			return _state.error;
		},
		
		get isSuccess() {
			return _state.isSuccess;
		},
		
		get isError() {
			return _state.isError;
		},

		async execute(...args: Args): Promise<T> {
			// 检查去重缓存
			const cachedPromise = checkDedupeCache(args);
			if (cachedPromise) {
				return cachedPromise;
			}

			// 取消之前的请求
			if (cancelPrevious && abortController) {
				abortController.abort();
			}

			// 创建新的取消控制器
			abortController = new AbortController();
			const executionId = ++currentExecutionId;
			lastArgs = args;

			// 设置加载状态
			_state = {
				..._state,
				isLoading: true,
				error: null
			};

			// 创建执行 promise
			const executePromise = (async () => {
				try {
					const result = await fetcher(...args);
					
					// 检查是否被取消
					if (executionId !== currentExecutionId) {
						throw new Error('Operation cancelled');
					}

					// 更新成功状态
					_state = {
						data: result,
						isLoading: false,
						error: null,
						isExecuted: true,
						isSuccess: true,
						isError: false
					};

					onSuccess?.(result);
					return result;
				} catch (err) {
					// 检查是否被取消
					if (executionId !== currentExecutionId) {
						throw err;
					}

					const error = err instanceof Error ? err : new Error(String(err));
					
					// 不处理取消错误
					if (error.name === 'AbortError' || error.message === 'Operation cancelled') {
						throw error;
					}

					// 更新错误状态
					_state = {
						..._state,
						isLoading: false,
						error,
						isExecuted: true,
						isSuccess: false,
						isError: true
					};

					onError?.(error);
					throw error;
				}
			})();

			// 设置去重缓存
			setDedupeCache(args, executePromise);

			return executePromise;
		},

		reset() {
			// 取消当前操作
			if (abortController) {
				abortController.abort();
				abortController = null;
			}
			
			currentExecutionId++;
			lastArgs = null;
			
			_state = {
				data: initialData,
				isLoading: false,
				error: null,
				isExecuted: false,
				isSuccess: false,
				isError: false
			};
		},

		async retry(): Promise<T | null> {
			if (!lastArgs) {
				console.warn('No previous execution to retry');
				return null;
			}
			
			// 清除去重缓存以允许重试
			if (dedupe) {
				const key = serializeArgs(lastArgs);
				dedupeCache.delete(key);
			}
			
			return this.execute(...lastArgs);
		},

		cancel() {
			if (abortController) {
				abortController.abort();
				abortController = null;
			}
			
			currentExecutionId++;
			
			if (_state.isLoading) {
				_state = {
					..._state,
					isLoading: false
				};
			}
		},

		setData(data: T | null) {
			_state = {
				..._state,
				data,
				isSuccess: data !== null,
				isError: false,
				error: null
			};
		},

		setError(error: Error | null) {
			_state = {
				..._state,
				error,
				isError: error !== null,
				isSuccess: false
			};
		}
	};
}
