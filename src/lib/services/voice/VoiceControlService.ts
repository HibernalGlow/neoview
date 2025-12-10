/**
 * 语音控制服务
 * 使用 Web Speech API 实现语音识别
 */

import type {
	VoiceRecognitionStatus,
	VoiceCommandMatch,
	VoiceRecognitionResult,
	VoiceControlConfig,
	VoiceControlCallbacks,
} from './types';
import { DEFAULT_VOICE_CONFIG } from './types';
import { findMatchingAction } from './commandDict';

// Web Speech API 类型声明
interface SpeechRecognitionResult {
	readonly isFinal: boolean;
	readonly length: number;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
	readonly transcript: string;
	readonly confidence: number;
}

interface SpeechRecognitionResultList {
	readonly length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
	readonly resultIndex: number;
	readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
	readonly error: string;
	readonly message: string;
}

interface SpeechRecognition extends EventTarget {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	maxAlternatives: number;
	start(): void;
	stop(): void;
	abort(): void;
	onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
	onend: ((this: SpeechRecognition, ev: Event) => void) | null;
	onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
	onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
	onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
	onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
	new (): SpeechRecognition;
}

// 扩展 Window 接口以支持 webkitSpeechRecognition
declare global {
	interface Window {
		SpeechRecognition: SpeechRecognitionConstructor;
		webkitSpeechRecognition: SpeechRecognitionConstructor;
	}
}

/**
 * 语音控制服务类
 */
export class VoiceControlService {
	private recognition: SpeechRecognition | null = null;
	private config: VoiceControlConfig = { ...DEFAULT_VOICE_CONFIG };
	private callbacks: VoiceControlCallbacks = {};
	private status: VoiceRecognitionStatus = 'idle';
	private isSupported: boolean = false;
	private interimTranscript: string = '';

	constructor() {
		this.checkSupport();
	}

	/**
	 * 检查浏览器是否支持 Web Speech API
	 */
	private checkSupport(): boolean {
		if (typeof window === 'undefined') {
			this.isSupported = false;
			return false;
		}

		const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
		this.isSupported = !!SpeechRecognitionAPI;

		if (this.isSupported) {
			console.log('[VoiceControl] Web Speech API 已支持');
		} else {
			console.warn('[VoiceControl] 当前浏览器不支持 Web Speech API');
		}

		return this.isSupported;
	}

	/**
	 * 检查是否支持语音识别
	 */
	public getIsSupported(): boolean {
		return this.isSupported;
	}

	/**
	 * 获取当前状态
	 */
	public getStatus(): VoiceRecognitionStatus {
		return this.status;
	}

	/**
	 * 设置回调函数
	 */
	public setCallbacks(callbacks: VoiceControlCallbacks): void {
		this.callbacks = { ...this.callbacks, ...callbacks };
	}

	/**
	 * 更新配置
	 */
	public updateConfig(config: Partial<VoiceControlConfig>): void {
		this.config = { ...this.config, ...config };
		
		// 如果已经初始化，更新识别器配置
		if (this.recognition) {
			this.recognition.lang = this.config.language;
			this.recognition.continuous = this.config.continuous;
		}
	}

	/**
	 * 获取当前配置
	 */
	public getConfig(): VoiceControlConfig {
		return { ...this.config };
	}

	/**
	 * 初始化语音识别
	 */
	public initialize(): boolean {
		if (!this.isSupported) {
			console.error('[VoiceControl] 无法初始化：浏览器不支持');
			return false;
		}

		if (this.recognition) {
			console.log('[VoiceControl] 已初始化，跳过');
			return true;
		}

		try {
			const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
			this.recognition = new SpeechRecognitionAPI();

			// 配置识别器
			this.recognition.lang = this.config.language;
			this.recognition.continuous = this.config.continuous;
			this.recognition.interimResults = true; // 启用中间结果
			this.recognition.maxAlternatives = 1;

			// 绑定事件处理器
			this.recognition.onstart = this.handleStart.bind(this);
			this.recognition.onend = this.handleEnd.bind(this);
			this.recognition.onresult = this.handleResult.bind(this);
			this.recognition.onerror = this.handleError.bind(this);
			this.recognition.onspeechstart = this.handleSpeechStart.bind(this);
			this.recognition.onspeechend = this.handleSpeechEnd.bind(this);

			console.log('[VoiceControl] 初始化成功');
			return true;
		} catch (error) {
			console.error('[VoiceControl] 初始化失败:', error);
			return false;
		}
	}

	/**
	 * 开始语音识别
	 */
	public start(): boolean {
		if (!this.recognition) {
			if (!this.initialize()) {
				return false;
			}
		}

		if (this.status === 'listening') {
			console.log('[VoiceControl] 已在监听中');
			return true;
		}

		try {
			this.interimTranscript = '';
			this.recognition!.start();
			console.log('[VoiceControl] 开始监听');
			return true;
		} catch (error) {
			console.error('[VoiceControl] 启动失败:', error);
			this.setStatus('error');
			return false;
		}
	}

	/**
	 * 停止语音识别
	 */
	public stop(): void {
		if (this.recognition && this.status === 'listening') {
			try {
				this.recognition.stop();
				console.log('[VoiceControl] 停止监听');
			} catch (error) {
				console.error('[VoiceControl] 停止失败:', error);
			}
		}
	}

	/**
	 * 中止语音识别
	 */
	public abort(): void {
		if (this.recognition) {
			try {
				this.recognition.abort();
				this.setStatus('idle');
			} catch (error) {
				console.error('[VoiceControl] 中止失败:', error);
			}
		}
	}

	/**
	 * 销毁服务
	 */
	public destroy(): void {
		this.abort();
		this.recognition = null;
		this.callbacks = {};
	}

	/**
	 * 设置状态
	 */
	private setStatus(status: VoiceRecognitionStatus): void {
		if (this.status !== status) {
			this.status = status;
			this.callbacks.onStatusChange?.(status);
		}
	}

	/**
	 * 处理识别开始
	 */
	private handleStart(): void {
		console.log('[VoiceControl] 识别开始');
		this.setStatus('listening');
	}

	/**
	 * 处理识别结束
	 */
	private handleEnd(): void {
		console.log('[VoiceControl] 识别结束');
		
		// 如果是持续模式且仍然启用，自动重启
		if (this.config.continuous && this.config.enabled && this.status !== 'error') {
			setTimeout(() => {
				if (this.config.enabled) {
					this.start();
				}
			}, 100);
		} else {
			this.setStatus('idle');
		}
	}

	/**
	 * 处理识别结果
	 */
	private handleResult(event: SpeechRecognitionEvent): void {
		let interimTranscript = '';

		for (let i = event.resultIndex; i < event.results.length; ++i) {
			const result = event.results[i];
			const transcript = result[0].transcript;
			const confidence = result[0].confidence;

			if (result.isFinal) {
				console.log(`[VoiceControl] 最终结果: "${transcript}" (置信度: ${(confidence * 100).toFixed(1)}%)`);
				
				// 处理最终结果
				this.processTranscript({
					transcript,
					confidence,
					isFinal: true,
				});
			} else {
				interimTranscript += transcript;
			}
		}

		this.interimTranscript = interimTranscript;
	}

	/**
	 * 处理语音识别文本
	 */
	private processTranscript(result: VoiceRecognitionResult): void {
		if (!result.isFinal) return;

		// 预处理文本：去除末尾标点
		const cleanTranscript = result.transcript.replace(/[。，、！？.?! ]+$/, '');
		
		// 查找匹配的命令（优先匹配，再检查置信度）
		const match = findMatchingAction(cleanTranscript);

		// 检查置信度
		// 如果置信度为 0（某些引擎不返回置信度）且有匹配结果，则允许通过
		// 否则需要满足最小置信度要求
		const isConfidenceAcceptable = result.confidence === 0 || result.confidence >= this.config.minConfidence;
		
		if (!isConfidenceAcceptable) {
			console.log(`[VoiceControl] 置信度过低，忽略: ${result.confidence}`);
			return;
		}

		// 如果只是置信度够高但没匹配到命令，我们也可以记录或提示，但这里只处理匹配到的情况
		if (!match) {
			console.log(`[VoiceControl] 未匹配到命令: "${result.transcript}"`);
			return;
		}

		this.setStatus('processing');

		const commandMatch: VoiceCommandMatch = {
			action: match.action,
			transcript: result.transcript,
			confidence: result.confidence,
			matchedPhrase: match.matchedPhrase,
		};

		console.log(`[VoiceControl] 匹配命令: ${match.action} (短语: "${match.matchedPhrase}")`);
		this.callbacks.onCommandRecognized?.(commandMatch);

		// 恢复监听状态
		if (this.status === 'processing') {
			this.setStatus('listening');
		}
	}

	/**
	 * 处理错误
	 */
	private handleError(event: SpeechRecognitionErrorEvent): void {
		console.error('[VoiceControl] 错误:', event.error, event.message);
		
		let errorMessage = '语音识别错误';
		switch (event.error) {
			case 'no-speech':
				errorMessage = '未检测到语音';
				break;
			case 'aborted':
				errorMessage = '识别被中止';
				break;
			case 'audio-capture':
				errorMessage = '无法访问麦克风';
				break;
			case 'network':
				errorMessage = '网络错误';
				break;
			case 'not-allowed':
				errorMessage = '麦克风权限被拒绝';
				break;
			case 'service-not-allowed':
				errorMessage = '语音服务不可用';
				break;
			default:
				errorMessage = `识别错误: ${event.error}`;
		}

		this.setStatus('error');
		this.callbacks.onError?.(errorMessage);
	}

	/**
	 * 处理语音开始
	 */
	private handleSpeechStart(): void {
		console.log('[VoiceControl] 检测到语音');
		this.callbacks.onSpeechStart?.();
	}

	/**
	 * 处理语音结束
	 */
	private handleSpeechEnd(): void {
		console.log('[VoiceControl] 语音结束');
		this.callbacks.onSpeechEnd?.();
	}

	/**
	 * 获取临时识别文本
	 */
	public getInterimTranscript(): string {
		return this.interimTranscript;
	}
}

// 导出单例
export const voiceControlService = new VoiceControlService();
