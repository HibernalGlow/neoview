/**
 * 语音控制模块类型定义
 */

// 语音识别状态
export type VoiceRecognitionStatus = 'idle' | 'listening' | 'processing' | 'error';

// 语音命令匹配结果
export interface VoiceCommandMatch {
	action: string;           // 匹配到的操作ID
	transcript: string;       // 原始语音识别文本
	confidence: number;       // 置信度 (0-1)
	matchedPhrase: string;    // 匹配到的命令短语
}

// 语音识别结果
export interface VoiceRecognitionResult {
	transcript: string;
	confidence: number;
	isFinal: boolean;
}

// 语音控制配置
export interface VoiceControlConfig {
	enabled: boolean;
	triggerMode: 'button' | 'hotkey' | 'wakeword' | 'always';
	hotkey: string;
	wakeWord: string;
	language: string;
	minConfidence: number;
	continuous: boolean;
	showFeedback: boolean;
	playSound: boolean;
}

// 语音控制统计
export interface VoiceControlStats {
	totalCommands: number;
	successfulCommands: number;
	failedCommands: number;
	lastCommand: string | null;
	lastCommandTime: number | null;
}

// 语音控制回调
export interface VoiceControlCallbacks {
	onCommandRecognized?: (match: VoiceCommandMatch) => void;
	onSpeechStart?: () => void;
	onSpeechEnd?: () => void;
	onError?: (error: string) => void;
	onStatusChange?: (status: VoiceRecognitionStatus) => void;
}

// 默认配置
export const DEFAULT_VOICE_CONFIG: VoiceControlConfig = {
	enabled: false,
	triggerMode: 'button',
	hotkey: 'V',
	wakeWord: '小N',
	language: 'zh-CN',
	minConfidence: 0.6,
	continuous: false,
	showFeedback: true,
	playSound: true,
};

// 默认统计
export const DEFAULT_VOICE_STATS: VoiceControlStats = {
	totalCommands: 0,
	successfulCommands: 0,
	failedCommands: 0,
	lastCommand: null,
	lastCommandTime: null,
};
