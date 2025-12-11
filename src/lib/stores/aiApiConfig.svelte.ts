/**
 * AI API 配置存储
 * 共享给 AI 标签推断、翻译等功能使用
 */
import { writable, get } from 'svelte/store';

// API 提供商配置
export interface AiProvider {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	model: string;
	temperature?: number;
	maxTokens?: number;
}

// 预设提供商
export const AI_PROVIDER_PRESETS: Record<string, Omit<AiProvider, 'id' | 'apiKey'>> = {
	deepseek: {
		name: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/v1/chat/completions',
		model: 'deepseek-chat',
		temperature: 0.3,
		maxTokens: 500
	},
	openai: {
		name: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1/chat/completions',
		model: 'gpt-3.5-turbo',
		temperature: 0.3,
		maxTokens: 500
	},
	ollama: {
		name: 'Ollama (本地)',
		baseUrl: 'http://localhost:11434/v1/chat/completions',
		model: 'qwen2.5:7b',
		temperature: 0.3,
		maxTokens: 500
	},
	gemini: {
		name: 'Google Gemini',
		baseUrl: 'https://generativelanguage.googleapis.com',
		model: 'gemini-1.5-flash',
		temperature: 0.3,
		maxTokens: 500
	},
	qwen: {
		name: '通义千问',
		baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
		model: 'qwen-turbo',
		temperature: 0.3,
		maxTokens: 500
	},
	siliconflow: {
		name: 'SiliconFlow',
		baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
		model: 'Qwen/Qwen2.5-7B-Instruct',
		temperature: 0.3,
		maxTokens: 500
	}
};

// 配置状态
export interface AiApiConfigState {
	providers: AiProvider[];
	activeProviderId: string | null;
}

const STORAGE_KEY = 'neoview-ai-api-config';

// 默认状态
const defaultState: AiApiConfigState = {
	providers: [],
	activeProviderId: null
};

// 从 localStorage 加载
function loadFromStorage(): AiApiConfigState {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			return JSON.parse(saved);
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
	const { subscribe, set, update } = writable<AiApiConfigState>(loadFromStorage());

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
					newState.activeProviderId = provider.id;
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
				id: `${presetId}-${Date.now()}`,
				...preset,
				apiKey
			};
			this.addProvider(provider);
		},

		// 更新提供商
		updateProvider(id: string, updates: Partial<AiProvider>) {
			update(state => {
				const newState = {
					...state,
					providers: state.providers.map(p => 
						p.id === id ? { ...p, ...updates } : p
					)
				};
				saveToStorage(newState);
				return newState;
			});
		},

		// 删除提供商
		removeProvider(id: string) {
			update(state => {
				const newProviders = state.providers.filter(p => p.id !== id);
				const newState = {
					...state,
					providers: newProviders,
					activeProviderId: state.activeProviderId === id 
						? (newProviders[0]?.id || null)
						: state.activeProviderId
				};
				saveToStorage(newState);
				return newState;
			});
		},

		// 设置活动提供商
		setActiveProvider(id: string | null) {
			update(state => {
				const newState = { ...state, activeProviderId: id };
				saveToStorage(newState);
				return newState;
			});
		},

		// 获取活动提供商
		getActiveProvider(): AiProvider | null {
			const state = get({ subscribe });
			if (!state.activeProviderId) return null;
			return state.providers.find(p => p.id === state.activeProviderId) || null;
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
					// OpenAI 兼容 API 测试
					const response = await fetch(p.baseUrl, {
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

		// 调用 AI API (通用)
		async chat(
			messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
			options?: { jsonMode?: boolean; provider?: AiProvider }
		): Promise<string> {
			const p = options?.provider || this.getActiveProvider();
			if (!p) {
				throw new Error('没有配置 AI 提供商');
			}

			const isGemini = p.baseUrl.includes('googleapis.com');

			if (isGemini) {
				// Gemini API
				const url = `${p.baseUrl}/v1beta/models/${p.model}:generateContent?key=${p.apiKey}`;
				const contents = messages.map(m => ({
					role: m.role === 'assistant' ? 'model' : 'user',
					parts: [{ text: m.content }]
				}));

				const response = await fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						contents,
						generationConfig: {
							temperature: p.temperature || 0.3,
							maxOutputTokens: p.maxTokens || 500,
							...(options?.jsonMode ? { response_mime_type: 'application/json' } : {})
						}
					})
				});

				if (!response.ok) {
					const err = await response.text();
					throw new Error(`Gemini API 错误: ${err.slice(0, 200)}`);
				}

				const data = await response.json();
				return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
			} else {
				// OpenAI 兼容 API
				const response = await fetch(p.baseUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${p.apiKey}`
					},
					body: JSON.stringify({
						model: p.model,
						messages,
						temperature: p.temperature || 0.3,
						max_tokens: p.maxTokens || 500,
						...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {})
					})
				});

				if (!response.ok) {
					const err = await response.text();
					throw new Error(`API 错误: ${err.slice(0, 200)}`);
				}

				const data = await response.json();
				return data.choices?.[0]?.message?.content || '';
			}
		}
	};
}

export const aiApiConfigStore = createAiApiConfigStore();
