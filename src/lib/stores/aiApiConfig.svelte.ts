/**
 * AI API 配置存储
 * 共享给 AI 标签推断、翻译等功能使用
 * 格式与 EMM 的 api_config.json 兼容
 * 使用 TanStack AI SDK（支持 OpenAI 和 Google Gemini）
 */
import { writable, get } from 'svelte/store';
import { generateText } from 'ai';
import { createTanStackProvider } from '$lib/ai/tanstackAdapter';
import { normalizeError, withRetry, getErrorMessage } from '$lib/ai/errorHandler';

// API 提供商配置 - 与 EMM 格式兼容
export interface AiProvider {
	name: string;
	provider: 'openai' | 'gemini';  // API 类型
	baseUrl: string;
	apiKey: string;
	model: string;
	temperature: number;
	maxTokens: number;
}

// JSON 配置格式 - 与 EMM 完全兼容
export interface AiApiConfigJson {
	providers: AiProvider[];
	activeIndex: number;
	comment?: string;
}

// 预设提供商模板 - baseUrl 不包含 /chat/completions，SDK 会自动添加
export const AI_PROVIDER_PRESETS: Record<string, Omit<AiProvider, 'apiKey'>> = {
	deepseek: {
		name: 'DeepSeek',
		provider: 'openai',
		baseUrl: 'https://api.deepseek.com/v1',
		model: 'deepseek-chat',
		temperature: 0.3,
		maxTokens: 500
	},
	openai: {
		name: 'OpenAI',
		provider: 'openai',
		baseUrl: 'https://api.openai.com/v1',
		model: 'gpt-3.5-turbo',
		temperature: 0.3,
		maxTokens: 500
	},
	ollama: {
		name: 'Ollama (本地)',
		provider: 'openai',
		baseUrl: 'http://localhost:11434/v1',
		model: 'qwen2.5:7b',
		temperature: 0.3,
		maxTokens: 500
	},
	gemini: {
		name: 'Google Gemini',
		provider: 'gemini',
		baseUrl: 'https://generativelanguage.googleapis.com',
		model: 'gemini-1.5-flash',
		temperature: 0.3,
		maxTokens: 500
	},
	qwen: {
		name: '通义千问',
		provider: 'openai',
		baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		model: 'qwen-turbo',
		temperature: 0.3,
		maxTokens: 500
	},
	siliconflow: {
		name: 'SiliconFlow',
		provider: 'openai',
		baseUrl: 'https://api.siliconflow.cn/v1',
		model: 'Qwen/Qwen2.5-7B-Instruct',
		temperature: 0.3,
		maxTokens: 500
	},
	openrouter: {
		name: 'OpenRouter',
		provider: 'openai',
		baseUrl: 'https://openrouter.ai/api/v1',
		model: 'deepseek/deepseek-chat-v3-0324:free',
		temperature: 0.3,
		maxTokens: 500
	}
};

// 内部状态
export interface AiApiConfigState {
	providers: AiProvider[];
	activeIndex: number;
}

const STORAGE_KEY = 'neoview-ai-api-config';

// 默认状态
const defaultState: AiApiConfigState = {
	providers: [],
	activeIndex: 0
};

// 从 localStorage 加载
function loadFromStorage(): AiApiConfigState {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			// 兼容旧格式
			if (parsed.activeProviderId !== undefined) {
				return { providers: parsed.providers || [], activeIndex: 0 };
			}
			return parsed;
		}
	} catch (e) {
		console.error('[aiApiConfig] 加载配置失败:', e);
	}
	return defaultState;
}

// 保存到 localStorage
function saveToStorage(state: AiApiConfigState) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (e) {
		console.error('[aiApiConfig] 保存配置失败:', e);
	}
}

// 创建 store
function createAiApiConfigStore() {
	const { subscribe, update } = writable<AiApiConfigState>(loadFromStorage());

	return {
		subscribe,

		// 添加提供商
		addProvider(provider: AiProvider) {
			update(state => {
				const newState = {
					...state,
					providers: [...state.providers, provider]
				};
				// 如果是第一个，自动设为活动
				if (newState.providers.length === 1) {
					newState.activeIndex = 0;
				}
				saveToStorage(newState);
				return newState;
			});
		},

		// 从预设添加
		addFromPreset(presetId: string, apiKey: string = '') {
			const preset = AI_PROVIDER_PRESETS[presetId];
			if (!preset) return;

			const provider: AiProvider = {
				...preset,
				apiKey
			};
			this.addProvider(provider);
		},

		// 更新提供商（按索引）
		updateProvider(index: number, updates: Partial<AiProvider>) {
			update(state => {
				const newState = {
					...state,
					providers: state.providers.map((p, i) => 
						i === index ? { ...p, ...updates } : p
					)
				};
				saveToStorage(newState);
				return newState;
			});
		},

		// 删除提供商（按索引）
		removeProvider(index: number) {
			update(state => {
				const newProviders = state.providers.filter((_, i) => i !== index);
				let newActiveIndex = state.activeIndex;
				if (index === state.activeIndex) {
					newActiveIndex = Math.min(0, newProviders.length - 1);
				} else if (index < state.activeIndex) {
					newActiveIndex = state.activeIndex - 1;
				}
				const newState = {
					providers: newProviders,
					activeIndex: Math.max(0, newActiveIndex)
				};
				saveToStorage(newState);
				return newState;
			});
		},

		// 设置活动提供商（按索引）
		setActiveIndex(index: number) {
			update(state => {
				const newState = { ...state, activeIndex: Math.max(0, Math.min(index, state.providers.length - 1)) };
				saveToStorage(newState);
				return newState;
			});
		},

		// 获取活动提供商
		getActiveProvider(): AiProvider | null {
			const state = get({ subscribe });
			if (state.providers.length === 0) return null;
			return state.providers[state.activeIndex] || state.providers[0] || null;
		},

		// 导出配置（EMM 兼容格式）
		exportConfig(): AiApiConfigJson {
			const state = get({ subscribe });
			return {
				providers: state.providers,
				activeIndex: state.activeIndex,
				comment: '翻译和 AI 标签推断的 API 配置。请填写正确的 API Key 并设置 activeIndex 选择要使用的提供商。'
			};
		},

		// 导入配置（EMM 兼容格式）
		importConfig(config: AiApiConfigJson) {
			update(() => {
				const newState: AiApiConfigState = {
					providers: config.providers || [],
					activeIndex: config.activeIndex || 0
				};
				saveToStorage(newState);
				return newState;
			});
		},

		// 测试 API 连接
		async testConnection(provider?: AiProvider): Promise<{ success: boolean; message: string }> {
			const p = provider || this.getActiveProvider();
			if (!p) {
				return { success: false, message: '没有配置提供商' };
			}

			try {
				const isGemini = p.baseUrl.includes('googleapis.com');
				
				if (isGemini) {
					// Gemini API 测试
					const url = `${p.baseUrl}/v1beta/models/${p.model}:generateContent?key=${p.apiKey}`;
					const response = await fetch(url, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							contents: [{ role: 'user', parts: [{ text: 'Hi' }] }]
						})
					});
					if (!response.ok) {
						const err = await response.text();
						return { success: false, message: `Gemini API 错误: ${err.slice(0, 100)}` };
					}
					return { success: true, message: `Gemini ${p.model} 连接成功` };
				} else {
					// OpenAI 兼容 API 测试 - 确保 URL 包含 /chat/completions
					let testUrl = p.baseUrl;
					if (!testUrl.endsWith('/chat/completions')) {
						testUrl = testUrl.replace(/\/?$/, '/chat/completions');
					}
					const response = await fetch(testUrl, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${p.apiKey}`
						},
						body: JSON.stringify({
							model: p.model,
							messages: [{ role: 'user', content: 'Hi' }],
							max_tokens: 10
						})
					});
					
					if (!response.ok) {
						const err = await response.text();
						return { success: false, message: `API 错误: ${err.slice(0, 100)}` };
					}
					return { success: true, message: `${p.name} 连接成功` };
				}
			} catch (e) {
				return { success: false, message: `连接失败: ${e instanceof Error ? e.message : '未知错误'}` };
			}
		},

		// 调用 AI API (通用) - 使用 TanStack AI SDK
		async chat(
			messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
			options?: { jsonMode?: boolean; provider?: AiProvider }
		): Promise<string> {
			const p = options?.provider || this.getActiveProvider();
			if (!p) {
				throw new Error('没有配置 AI 提供商');
			}

			console.log('[aiApiConfig] Using TanStack AI SDK...');
			console.log('[aiApiConfig] Provider:', p.name, 'Model:', p.model);

			// 创建 TanStack AI 配置
			const tanstackConfig = createTanStackProvider(p);

			// 合并消息为 prompt（TanStack AI 的 generateText 使用 prompt 或 messages）
			const systemMessage = messages.find(m => m.role === 'system');
			const userMessages = messages.filter(m => m.role !== 'system');
			
			// 构建 prompt
			let prompt = '';
			if (systemMessage) {
				prompt += `[System] ${systemMessage.content}\n\n`;
			}
			prompt += userMessages.map(m => {
				if (m.role === 'assistant') return `[Assistant] ${m.content}`;
				return m.content;
			}).join('\n\n');

			try {
				// 使用重试机制
				const result = await withRetry(
					async () => {
						const response = await generateText({
							model: tanstackConfig.model,
							prompt,
							temperature: tanstackConfig.temperature,
							maxTokens: tanstackConfig.maxTokens,
						});

						if (!response.text) {
							throw new Error('AI API 返回空内容');
						}

						return response.text;
					},
					{
						maxRetries: 2,
						provider: p.name,
						onRetry: (error, attempt) => {
							console.warn(`[aiApiConfig] 重试 ${attempt}:`, getErrorMessage(error));
						},
					}
				);

				console.log('[aiApiConfig] TanStack AI call succeeded');
				return result;
			} catch (error) {
				const aiError = normalizeError(error, p.name);
				console.error('[aiApiConfig] AI 调用失败:', aiError);
				throw new Error(getErrorMessage(aiError));
			}
		}
	};
}

export const aiApiConfigStore = createAiApiConfigStore();
