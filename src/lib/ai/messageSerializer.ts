/**
 * AI 消息序列化模块
 * 处理消息的 JSON 序列化和反序列化，支持持久化存储
 */
import type { AIMessage } from '$lib/stores/ai/tanstackStore.svelte';

/**
 * 序列化后的消息格式
 */
export interface SerializedMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	createdAt: string; // ISO 8601 格式
}

/**
 * 序列化后的会话格式
 */
export interface SerializedSession {
	version: number;
	messages: SerializedMessage[];
	metadata?: {
		createdAt: string;
		updatedAt: string;
		title?: string;
	};
}

/**
 * 当前序列化版本
 */
const CURRENT_VERSION = 1;

/**
 * 将单个消息序列化为 JSON 兼容格式
 * 
 * @param message - AI 消息
 * @returns 序列化后的消息
 */
export function serializeMessage(message: AIMessage): SerializedMessage {
	return {
		id: message.id,
		role: message.role,
		content: message.content,
		createdAt: message.createdAt?.toISOString() || new Date().toISOString(),
	};
}

/**
 * 将序列化的消息反序列化为 AIMessage
 * 
 * @param serialized - 序列化的消息
 * @returns AI 消息
 */
export function deserializeMessage(serialized: SerializedMessage): AIMessage {
	return {
		id: serialized.id,
		role: serialized.role,
		content: serialized.content,
		createdAt: new Date(serialized.createdAt),
	};
}

/**
 * 将消息数组序列化为 JSON 字符串
 * 
 * @param messages - AI 消息数组
 * @returns JSON 字符串
 */
export function serializeMessages(messages: AIMessage[]): string {
	const serialized: SerializedMessage[] = messages.map(serializeMessage);
	return JSON.stringify(serialized);
}

/**
 * 将 JSON 字符串反序列化为消息数组
 * 
 * @param json - JSON 字符串
 * @returns AI 消息数组
 */
export function deserializeMessages(json: string): AIMessage[] {
	try {
		const parsed = JSON.parse(json);
		
		// 处理数组格式（旧版本）
		if (Array.isArray(parsed)) {
			return parsed.map(deserializeMessage);
		}
		
		// 处理会话格式（新版本）
		if (parsed.version && parsed.messages) {
			return migrateSession(parsed).messages.map(deserializeMessage);
		}
		
		throw new Error('无效的消息格式');
	} catch (error) {
		console.error('[messageSerializer] 反序列化失败:', error);
		return [];
	}
}

/**
 * 序列化完整会话（包含元数据）
 * 
 * @param messages - AI 消息数组
 * @param title - 会话标题（可选）
 * @returns JSON 字符串
 */
export function serializeSession(messages: AIMessage[], title?: string): string {
	const now = new Date().toISOString();
	const session: SerializedSession = {
		version: CURRENT_VERSION,
		messages: messages.map(serializeMessage),
		metadata: {
			createdAt: messages[0]?.createdAt?.toISOString() || now,
			updatedAt: now,
			title,
		},
	};
	return JSON.stringify(session);
}

/**
 * 反序列化完整会话
 * 
 * @param json - JSON 字符串
 * @returns 会话数据
 */
export function deserializeSession(json: string): {
	messages: AIMessage[];
	metadata?: SerializedSession['metadata'];
} {
	try {
		const parsed = JSON.parse(json);
		
		// 处理数组格式（旧版本，无元数据）
		if (Array.isArray(parsed)) {
			return {
				messages: parsed.map(deserializeMessage),
			};
		}
		
		// 处理会话格式
		if (parsed.version && parsed.messages) {
			const migrated = migrateSession(parsed);
			return {
				messages: migrated.messages.map(deserializeMessage),
				metadata: migrated.metadata,
			};
		}
		
		throw new Error('无效的会话格式');
	} catch (error) {
		console.error('[messageSerializer] 会话反序列化失败:', error);
		return { messages: [] };
	}
}

/**
 * 迁移旧版本会话格式
 * 
 * @param session - 旧版本会话
 * @returns 迁移后的会话
 */
function migrateSession(session: SerializedSession): SerializedSession {
	// 当前只有版本 1，未来可以在这里添加迁移逻辑
	if (session.version === CURRENT_VERSION) {
		return session;
	}
	
	// 未知版本，尝试直接使用
	console.warn(`[messageSerializer] 未知会话版本: ${session.version}，尝试直接使用`);
	return {
		...session,
		version: CURRENT_VERSION,
	};
}

/**
 * 验证序列化的消息格式是否有效
 * 
 * @param json - JSON 字符串
 * @returns 是否有效
 */
export function isValidSerializedMessages(json: string): boolean {
	try {
		const parsed = JSON.parse(json);
		
		// 数组格式
		if (Array.isArray(parsed)) {
			return parsed.every(isValidSerializedMessage);
		}
		
		// 会话格式
		if (parsed.version && Array.isArray(parsed.messages)) {
			return parsed.messages.every(isValidSerializedMessage);
		}
		
		return false;
	} catch {
		return false;
	}
}

/**
 * 验证单个序列化消息是否有效
 */
function isValidSerializedMessage(msg: unknown): msg is SerializedMessage {
	if (typeof msg !== 'object' || msg === null) return false;
	
	const m = msg as Record<string, unknown>;
	
	return (
		typeof m.id === 'string' &&
		(m.role === 'user' || m.role === 'assistant' || m.role === 'system') &&
		typeof m.content === 'string' &&
		typeof m.createdAt === 'string'
	);
}
