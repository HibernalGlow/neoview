/**
 * NeoView - Persisted State Utility
 * 持久化状态工具函数 (Svelte 5 Runes)
 * 
 * 提供与 Svelte 4 writable store 兼容的 API，同时使用 Svelte 5 Runes 实现
 */

/**
 * 持久化状态配置选项
 */
export interface PersistedStateOptions<T> {
	/** localStorage 键名（不含前缀） */
	key: string;
	/** 默认值 */
	defaultValue: T;
	/** 键名前缀，默认 'neoview-ui-' */
	prefix?: string;
	/** 自定义序列化函数 */
	serialize?: (value: T) => string;
	/** 自定义反序列化函数 */
	deserialize?: (raw: string) => T;
	/** 值变化时的回调 */
	onChange?: (value: T) => void;
}

/**
 * 持久化状态返回类型
 * 兼容 Svelte 4 writable store API
 */
export interface PersistedState<T> {
	/** 当前值（响应式） */
	readonly value: T;
	/** 设置新值 */
	set(value: T): void;
	/** 基于当前值更新 */
	update(updater: (current: T) => T): void;
	/** 订阅变化（兼容 Svelte 4） */
	subscribe(callback: (value: T) => void): () => void;
}

/**
 * 从 localStorage 加载状态
 */
function loadFromStorage<T>(
	fullKey: string,
	defaultValue: T,
	deserialize: (raw: string) => T
): T {
	try {
		const saved = localStorage.getItem(fullKey);
		if (saved !== null) {
			return deserialize(saved);
		}
	} catch (e) {
		console.error(`Failed to load ${fullKey} from storage:`, e);
	}
	return defaultValue;
}

/**
 * 保存状态到 localStorage
 */
function saveToStorage<T>(
	fullKey: string,
	value: T,
	serialize: (value: T) => string
): void {
	try {
		localStorage.setItem(fullKey, serialize(value));
	} catch (e) {
		console.error(`Failed to save ${fullKey} to storage:`, e);
	}
}

/**
 * 创建持久化状态
 * 
 * @example
 * ```ts
 * const isOpen = createPersistedState({
 *   key: 'sidebarOpen',
 *   defaultValue: false
 * });
 * 
 * // 读取值
 * console.log(isOpen.value);
 * 
 * // 设置值
 * isOpen.set(true);
 * 
 * // 更新值
 * isOpen.update(v => !v);
 * 
 * // 订阅（兼容 Svelte 4）
 * const unsubscribe = isOpen.subscribe(v => console.log(v));
 * ```
 */
export function createPersistedState<T>(options: PersistedStateOptions<T>): PersistedState<T> {
	const {
		key,
		defaultValue,
		prefix = 'neoview-ui-',
		serialize = JSON.stringify,
		deserialize = JSON.parse,
		onChange
	} = options;

	const fullKey = `${prefix}${key}`;
	
	// 从 localStorage 加载初始值
	const initialValue = loadFromStorage(fullKey, defaultValue, deserialize);
	
	// 使用包装对象来确保响应式更新能被 Svelte 检测到
	// 这是因为 $state 在 .svelte.ts 文件中的行为与 .svelte 文件中略有不同
	const state = $state({ current: initialValue });
	
	// 订阅者列表
	const subscribers = new Set<(value: T) => void>();
	
	// 通知所有订阅者
	function notifySubscribers(value: T) {
		for (const callback of subscribers) {
			try {
				callback(value);
			} catch (e) {
				console.error('Subscriber callback error:', e);
			}
		}
	}

	const store: PersistedState<T> = {
		get value() {
			return state.current;
		},
		
		set(newValue: T) {
			state.current = newValue;
			saveToStorage(fullKey, newValue, serialize);
			onChange?.(newValue);
			// 使用 queueMicrotask 确保在当前执行栈完成后通知订阅者
			queueMicrotask(() => notifySubscribers(newValue));
		},
		
		update(updater: (current: T) => T) {
			const newValue = updater(state.current);
			store.set(newValue);
		},
		
		subscribe(callback: (value: T) => void): () => void {
			// 立即调用一次（Svelte store 约定）
			callback(state.current);
			subscribers.add(callback);
			
			// 返回取消订阅函数
			return () => {
				subscribers.delete(callback);
			};
		}
	};
	
	return store;
}

/**
 * 创建简单的非持久化状态（仅内存）
 * 用于不需要持久化的临时状态
 */
export function createState<T>(initialValue: T): PersistedState<T> {
	const state = $state({ current: initialValue });
	const subscribers = new Set<(value: T) => void>();
	
	function notifySubscribers(value: T) {
		for (const callback of subscribers) {
			try {
				callback(value);
			} catch (e) {
				console.error('Subscriber callback error:', e);
			}
		}
	}

	const store: PersistedState<T> = {
		get value() {
			return state.current;
		},
		
		set(newValue: T) {
			state.current = newValue;
			queueMicrotask(() => notifySubscribers(newValue));
		},
		
		update(updater: (current: T) => T) {
			const newValue = updater(state.current);
			store.set(newValue);
		},
		
		subscribe(callback: (value: T) => void): () => void {
			callback(state.current);
			subscribers.add(callback);
			return () => {
				subscribers.delete(callback);
			};
		}
	};
	
	return store;
}
