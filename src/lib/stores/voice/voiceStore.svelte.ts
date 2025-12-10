/**
 * 语音控制状态管理
 */

import { voiceControlService } from '$lib/services/voice/VoiceControlService';
import { updateCommandDict } from '$lib/services/voice/commandDict';
import type {
	VoiceRecognitionStatus,
	VoiceCommandMatch,
	VoiceControlConfig,
	VoiceControlStats,
} from '$lib/services/voice/types';
import {
	DEFAULT_VOICE_CONFIG,
	DEFAULT_VOICE_STATS,
} from '$lib/services/voice/types';

const STORAGE_KEY = 'neoview-voice-control';

// 可响应状态
let config = $state<VoiceControlConfig>({ ...DEFAULT_VOICE_CONFIG });
let stats = $state<VoiceControlStats>({ ...DEFAULT_VOICE_STATS });
let status = $state<VoiceRecognitionStatus>('idle');
let lastRecognizedText = $state<string>('');
let isSupported = $state<boolean>(false);
let errorMessage = $state<string | null>(null);

// 命令历史记录
let commandHistory = $state<Array<{
	action: string;
	transcript: string;
	time: number;
	success: boolean;
}>>([]);

/**
 * 从 localStorage 加载配置
 */
function loadFromStorage(): void {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			config = { ...DEFAULT_VOICE_CONFIG, ...parsed.config };
			stats = { ...DEFAULT_VOICE_STATS, ...parsed.stats };
		}
	} catch (error) {
		console.error('[VoiceStore] 加载配置失败:', error);
	}
}

/**
 * 保存配置到 localStorage
 */
function saveToStorage(): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ config, stats }));
	} catch (error) {
		console.error('[VoiceStore] 保存配置失败:', error);
	}
}

/**
 * 初始化语音控制
 */
function initialize(): boolean {
	isSupported = voiceControlService.getIsSupported();
	
	if (!isSupported) {
		errorMessage = '当前浏览器不支持语音识别';
		return false;
	}

	// 加载保存的配置
	loadFromStorage();
	
	// 应用自定义命令
	if (config.customCommands) {
		updateCommandDict(config.customCommands);
	}

	// 应用配置到服务
	voiceControlService.updateConfig(config);

	// 设置回调
	voiceControlService.setCallbacks({
		onStatusChange: (newStatus) => {
			status = newStatus;
			if (newStatus === 'error') {
				// 保持错误信息
			} else {
				errorMessage = null;
			}
		},
		onError: (error) => {
			errorMessage = error;
			stats.failedCommands++;
			saveToStorage();
		},
		onSpeechStart: () => {
			lastRecognizedText = '';
		},
		onSpeechEnd: () => {
			// 语音结束
		},
	});

	// 初始化服务
	return voiceControlService.initialize();
}

/**
 * 开始语音识别
 */
function startListening(): boolean {
	if (!isSupported) {
		errorMessage = '语音识别不可用';
		return false;
	}

	errorMessage = null;
	return voiceControlService.start();
}

/**
 * 停止语音识别
 */
function stopListening(): void {
	voiceControlService.stop();
}

/**
 * 切换语音识别状态
 */
function toggleListening(): boolean {
	if (status === 'listening') {
		stopListening();
		return false;
	} else {
		return startListening();
	}
}

/**
 * 更新配置
 */
function updateConfig(newConfig: Partial<VoiceControlConfig>): void {
	config = { ...config, ...newConfig };
	voiceControlService.updateConfig(config);
	saveToStorage();
}

/**
 * 更新特定操作的命令短语
 */
function updateCommandPhrases(action: string, phrases: string[]): void {
	const currentCustom = config.customCommands || {};
	currentCustom[action] = phrases;
	updateConfig({ customCommands: currentCustom });
	updateCommandDict(currentCustom);
}

/**
 * 设置启用状态
 */
function setEnabled(enabled: boolean): void {
	updateConfig({ enabled });
	
	if (!enabled && status === 'listening') {
		stopListening();
	}
}

/**
 * 记录命令执行结果
 */
function recordCommand(match: VoiceCommandMatch, success: boolean): void {
	lastRecognizedText = match.transcript;
	
	stats.totalCommands++;
	if (success) {
		stats.successfulCommands++;
	} else {
		stats.failedCommands++;
	}
	stats.lastCommand = match.action;
	stats.lastCommandTime = Date.now();

	// 添加到历史记录
	commandHistory = [
		{
			action: match.action,
			transcript: match.transcript,
			time: Date.now(),
			success,
		},
		...commandHistory.slice(0, 49), // 保留最近50条
	];

	saveToStorage();
}

/**
 * 重置统计
 */
function resetStats(): void {
	stats = { ...DEFAULT_VOICE_STATS };
	commandHistory = [];
	saveToStorage();
}

/**
 * 重置为默认配置
 */
function resetConfig(): void {
	config = { ...DEFAULT_VOICE_CONFIG };
	voiceControlService.updateConfig(config);
	saveToStorage();
}

/**
 * 销毁服务
 */
function destroy(): void {
	voiceControlService.destroy();
}

// 导出 store
export const voiceStore = {
	// 状态 getters
	get config() { return config; },
	get stats() { return stats; },
	get status() { return status; },
	get lastRecognizedText() { return lastRecognizedText; },
	get isSupported() { return isSupported; },
	get errorMessage() { return errorMessage; },
	get commandHistory() { return commandHistory; },
	get isListening() { return status === 'listening'; },
	get isProcessing() { return status === 'processing'; },
	get isIdle() { return status === 'idle'; },
	get hasError() { return status === 'error'; },

	// 方法
	initialize,
	startListening,
	stopListening,
	toggleListening,
	updateConfig,
	updateCommandPhrases,
	setEnabled,
	recordCommand,
	resetStats,
	resetConfig,
	destroy,

	// 获取服务实例（用于设置自定义回调）
	getService: () => voiceControlService,
};
