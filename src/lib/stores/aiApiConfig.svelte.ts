/**
 * AI API 配置存储
 * 共享给 AI 标签推断、翻译等功能使用
 * 格式与 EMM 的 api_config.json 兼容
 * 使用 openai 和 @google/genai SDK
 */
import { writable, get } from 'svelte/store';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

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

		// 调用 AI API (通用) - 使用 SDK
		async chat(
			messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
			options?: { jsonMode?: boolean; provider?: AiProvider }
		): Promise<string> {
			const p = options?.provider || this.getActiveProvider();
			if (!p) {
				throw new Error('没有配置 AI 提供商');
			}

			if (p.provider === 'gemini') {
				// 使用 Google GenAI SDK
				console.log('[aiApiConfig] Using Google GenAI SDK...');
				const genAI = new GoogleGenAI({ apiKey: p.apiKey });
				
				// 合并所有消息为一个 prompt
				const prompt = messages.map(m => {
					if (m.role === 'system') return `[System] ${m.content}`;
					if (m.role === 'assistant') return `[Assistant] ${m.content}`;
					return m.content;
				}).join('\n\n');

				const response = await genAI.models.generateContent({
					model: p.model,
					contents: prompt,
					config: {
						temperature: p.temperature || 0.3,
						maxOutputTokens: p.maxTokens || 500,
						...(options?.jsonMode ? { responseMimeType: 'application/json' } : {})
					}
				});

				if (!response.text) {
					throw new Error('Gemini API 返回空内容');
				}
				return response.text;
			} else {
				// 使用 OpenAI SDK (兼容所有 OpenAI-compatible APIs)
				console.log('[aiApiConfig] Using OpenAI SDK...');
				// baseURL 不应包含 /chat/completions，SDK 会自动添加
				let baseURL = p.baseUrl;
				if (baseURL.endsWith('/chat/completions')) {
					baseURL = baseURL.slice(0, -'/chat/completions'.length);
				}
				console.log('[aiApiConfig] baseURL:', baseURL, 'model:', p.model);
				
				const openai = new OpenAI({
					apiKey: p.apiKey,
					baseURL,
					dangerouslyAllowBrowser: true,
					timeout: 30000,
					maxRetries: 0
				});

				const completion = await openai.chat.completions.create({
					model: p.model,
					messages: messages.map(m => ({
						role: m.role,
						content: m.content
					})),
					temperature: p.temperature || 0.3,
					max_tokens: p.maxTokens || 500,
					...(options?.jsonMode ? { response_format: { type: 'json_object' as const } } : {})
				});

				const content = completion.choices[0]?.message?.content;
				if (!content) {
					throw new Error('OpenAI API 返回空内容');
				}
				console.log('[aiApiConfig] OpenAI SDK call succeeded');
				return content;
			}
		}
	};
}

export const aiApiConfigStore = createAiApiConfigStore();
