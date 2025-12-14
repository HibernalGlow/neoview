/**
 * TanStack AI Store
 * 与 Svelte 5 响应式系统集成的 AI 状态管理
 */
import { writable, derived, get } from 'svelte/store';

/**
 * AI 消息接口（与 TanStack AI 兼容）
 */
export interface AIMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	createdAt?: Date;
}

/**
 * AI Store 状态
 */
export interface AIStoreState {
	/** 消息历史 */
	messages: AIMessage[];
	/** 是否正在加载 */
	isLoading: boolean;
	/** 错误信息 */
	error: Error | null;
	/** 流式响应的累积内容 */
	streamingContent: string;
	/** 是否正在流式响应 */
	isStreaming: boolean;
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
	return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 创建 AI Store
 * 提供与 Svelte 5 响应式系统集成的 AI 状态管理
 */
export function createAIStore() {
	const initialState: AIStoreState = {
		messages: [],
		isLoading: false,
		error: null,
		streamingContent: '',
		isStreaming: false,
	};

	const { subscribe, update, set } = writable<AIStoreState>(initialState);

	return {
		subscribe,

		/**
		 * 设置加载状态
		 */
		setLoading(loading: boolean) {
			update((s) => ({ ...s, isLoading: loading }));
		},

		/**
		 * 设置流式状态
		 */
		setStreaming(streaming: boolean) {
			update((s) => ({ ...s, isStreaming: streaming }));
		},

		/**
		 * 追加流式内容块
		 */
		appendStreamChunk(chunk: string) {
			update((s) => ({
				...s,
				streamingContent: s.streamingContent + chunk,
			}));
		},

		/**
		 * 设置流式内容
		 */
		setStreamingContent(content: string) {
			update((s) => ({ ...s, streamingContent: content }));
		},

		/**
		 * 清空流式内容
		 */
		clearStream() {
			update((s) => ({ ...s, streamingContent: '', isStreaming: false }));
		},

		/**
		 * 添加消息
		 */
		addMessage(message: Omit<AIMessage, 'id' | 'createdAt'>) {
			const newMessage: AIMessage = {
				...message,
				id: generateId(),
				createdAt: new Date(),
			};
			update((s) => ({
				...s,
				messages: [...s.messages, newMessage],
			}));
			return newMessage;
		},

		/**
		 * 添加用户消息
		 */
		addUserMessage(content: string) {
			return this.addMessage({ role: 'user', content });
		},

		/**
		 * 添加助手消息
		 */
		addAssistantMessage(content: string) {
			return this.addMessage({ role: 'assistant', content });
		},

		/**
		 * 添加系统消息
		 */
		addSystemMessage(content: string) {
			return this.addMessage({ role: 'system', content });
		},

		/**
		 * 更新消息内容
		 */
		updateMessage(id: string, content: string) {
			update((s) => ({
				...s,
				messages: s.messages.map((m) => (m.id === id ? { ...m, content } : m)),
			}));
		},

		/**
		 * 删除消息
		 */
		removeMessage(id: string) {
			update((s) => ({
				...s,
				messages: s.messages.filter((m) => m.id !== id),
			}));
		},

		/**
		 * 设置错误
		 */
		setError(error: Error | null) {
			update((s) => ({ ...s, error }));
		},

		/**
		 * 清空所有消息
		 */
		clearMessages() {
			update((s) => ({ ...s, messages: [] }));
		},

		/**
		 * 重置整个状态
		 */
		reset() {
			set(initialState);
		},

		/**
		 * 获取当前状态
		 */
		getState(): AIStoreState {
			return get({ subscribe });
		},

		/**
		 * 获取消息历史
		 */
		getMessages(): AIMessage[] {
			return get({ subscribe }).messages;
		},

		/**
		 * 将流式内容转换为助手消息
		 */
		commitStreamToMessage() {
			const state = get({ subscribe });
			if (state.streamingContent) {
				this.addAssistantMessage(state.streamingContent);
				this.clearStream();
			}
		},
	};
}

/**
 * 默认 AI Store 实例
 */
export const aiStore = createAIStore();

/**
 * 派生 store：是否有消息
 */
export const hasMessages = derived(aiStore, ($store) => $store.messages.length > 0);

/**
 * 派生 store：最后一条消息
 */
export const lastMessage = derived(aiStore, ($store) =>
	$store.messages.length > 0 ? $store.messages[$store.messages.length - 1] : null
);

/**
 * 派生 store：是否正在处理（加载或流式）
 */
export const isProcessing = derived(aiStore, ($store) => $store.isLoading || $store.isStreaming);
