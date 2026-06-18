<script lang="ts">
	/**
	 * 语音控制卡片
	 * 提供语音识别控制和状态显示
	 */
	import { onMount, onDestroy } from 'svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { voiceStore } from '$lib/stores/voice/voiceStore.svelte';
	import { DEFAULT_VOICE_COMMANDS, getActiveCommands } from '$lib/services/voice/commandDict';
	import { keyBindingsStore } from '$lib/stores/keybindings';
	import {
		Mic,
		MicOff,
		Volume2,
		AlertCircle,
		CheckCircle,
		Settings,
		History,
		Info,
		Edit2,
		Save,
		RotateCcw
	} from '@lucide/svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { toast } from 'svelte-sonner';

	// 响应式状态绑定
	let isSupported = $state(false);
	let isEnabled = $state(false);
	let isListening = $state(false);
	let status = $state<'idle' | 'listening' | 'processing' | 'error'>('idle');
	let lastRecognizedText = $state('');
	let interimText = $state(''); // 实时识别中的文字
	let errorMessage = $state<string | null>(null);
	let showSettings = $state(false);
	let showHistory = $state(false);
	let showCommandEditor = $state(false);

	// 配置状态
	let triggerMode = $state<'button' | 'hotkey' | 'wakeword' | 'always'>('button');
	let minConfidence = $state(0.6);
	let showFeedback = $state(true);
	let playSound = $state(true);
	let continuous = $state(false);

	// 自定义命令编辑状态
	let editingAction = $state<string>(Object.keys(DEFAULT_VOICE_COMMANDS)[0]);
	let editingPhrases = $state<string>('');

	// 统计数据
	let totalCommands = $state(0);
	let successfulCommands = $state(0);
	let commandHistory = $state<
		Array<{
			action: string;
			transcript: string;
			time: number;
			success: boolean;
		}>
	>([]);

	// 支持的命令数量
	const supportedCommandsCount = Object.keys(DEFAULT_VOICE_COMMANDS).length;

	// 全局 dispatchAction 函数引用
	let dispatchAction: ((action: string) => void) | null = null;

	// 定时更新中间结果
	let interimUpdateInterval: ReturnType<typeof setInterval> | null = null;

	// 启动中间结果更新
	function startInterimUpdate() {
		stopInterimUpdate();
		interimUpdateInterval = setInterval(() => {
			const interim = voiceStore.getService().getInterimTranscript();
			if (interim) {
				interimText = interim;
			}
		}, 100);
	}

	// 停止中间结果更新
	function stopInterimUpdate() {
		if (interimUpdateInterval) {
			clearInterval(interimUpdateInterval);
			interimUpdateInterval = null;
		}
	}

	function handleVoiceExecute(event: CustomEvent) {
		// 用于外部触发语音命令执行
	}

	onMount(() => {
		// 初始化语音服务
		voiceStore.initialize();

		// 同步状态
		syncState();

		// 设置命令识别回调
		voiceStore.getService().setCallbacks({
			onStatusChange: (newStatus) => {
				status = newStatus;
				if (newStatus === 'error') {
					errorMessage = voiceStore.errorMessage;
				} else {
					errorMessage = null;
				}
				isListening = newStatus === 'listening';

				// 开始监听时，启动中间结果更新
				if (newStatus === 'listening') {
					startInterimUpdate();
				} else {
					stopInterimUpdate();
				}
			},
			onCommandRecognized: (match) => {
				lastRecognizedText = match.transcript;
				interimText = ''; // 清除中间结果

				// 执行命令
				executeCommand(match.action, match.transcript);
			},
			onError: (error) => {
				errorMessage = error;
				toast.error(error);
			},
			onSpeechStart: () => {
				// 检测到语音开始
				interimText = '正在识别...';
			},
			onSpeechEnd: () => {
				// 语音结束
			}
		});

		// 获取全局的 dispatchAction 函数
		// 通过自定义事件与 App.svelte 通信
		if (typeof window !== 'undefined') {
			window.addEventListener('neoview-voice-execute', handleVoiceExecute as EventListener);
		}
	});

	onDestroy(() => {
		stopInterimUpdate();
		if (typeof window !== 'undefined') {
			window.removeEventListener('neoview-voice-execute', handleVoiceExecute as EventListener);
		}
	});

	function syncState() {
		isSupported = voiceStore.isSupported;
		isEnabled = voiceStore.config.enabled;
		isListening = voiceStore.isListening;
		status = voiceStore.status;
		lastRecognizedText = voiceStore.lastRecognizedText;
		errorMessage = voiceStore.errorMessage;

		// 配置
		triggerMode = voiceStore.config.triggerMode;
		minConfidence = voiceStore.config.minConfidence;
		showFeedback = voiceStore.config.showFeedback;
		playSound = voiceStore.config.playSound;
		continuous = voiceStore.config.continuous;

		// 统计
		totalCommands = voiceStore.stats.totalCommands;
		successfulCommands = voiceStore.stats.successfulCommands;
		commandHistory = voiceStore.commandHistory;
	}

	function executeCommand(action: string, transcript: string) {
		console.log(`[VoiceCard] 执行命令: ${action}`);

		// 通过全局事件派发命令
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('neoview-voice-command', {
					detail: { action, transcript }
				})
			);
		}

		// 记录成功
		voiceStore.recordCommand(
			{ action, transcript, confidence: 1, matchedPhrase: transcript },
			true
		);

		// 同步状态
		syncState();

		// 显示反馈
		if (showFeedback) {
			const binding = keyBindingsStore.getBinding(action);
			const actionName = binding?.name || action;
			toast.success(`🎤 ${actionName}`, {
				description: `"${transcript}"`,
				duration: 2000
			});
		}
	}

	function toggleEnabled() {
		isEnabled = !isEnabled;
		voiceStore.setEnabled(isEnabled);

		if (isEnabled) {
			toast.success('语音控制已启用');
		} else {
			toast.info('语音控制已禁用');
			if (isListening) {
				voiceStore.stopListening();
			}
		}
	}

	function toggleListening() {
		if (!isEnabled) {
			toast.warning('请先启用语音控制');
			return;
		}

		if (isListening) {
			voiceStore.stopListening();
			isListening = false;
		} else {
			const success = voiceStore.startListening();
			if (success) {
				isListening = true;
				toast.info('🎤 开始监听...', { duration: 1500 });
			}
		}
	}

	function updateTriggerMode(mode: string) {
		triggerMode = mode as typeof triggerMode;
		voiceStore.updateConfig({ triggerMode });
	}

	function updateMinConfidence(value: number) {
		minConfidence = value;
		voiceStore.updateConfig({ minConfidence: value });
	}

	function toggleShowFeedback() {
		showFeedback = !showFeedback;
		voiceStore.updateConfig({ showFeedback });
	}

	function togglePlaySound() {
		playSound = !playSound;
		voiceStore.updateConfig({ playSound });
	}

	function toggleContinuous() {
		continuous = !continuous;
		voiceStore.updateConfig({ continuous });

		// 如果正在监听，需要重启才能生效
		if (isListening) {
			toast.info('重启监听以应用持续模式');
			voiceStore.stopListening();
			setTimeout(() => {
				if (isEnabled) voiceStore.startListening();
			}, 500);
		}
	}

	function resetStats() {
		voiceStore.resetStats();
		syncState();
		toast.success('统计数据已重置');
	}

	// 保存自定义命令
	function saveCustomCommand() {
		if (!editingPhrases.trim()) {
			toast.error('命令短语不能为空');
			return;
		}

		const phrases = editingPhrases
			.split(/[,，\n]/)
			.map((p) => p.trim())
			.filter((p) => p);
		if (phrases.length === 0) {
			toast.error('有效命令短语不能为空');
			return;
		}

		voiceStore.updateCommandPhrases(editingAction, phrases);
		toast.success(`已更新 "${getActionName(editingAction)}" 的语音命令`);
	}

	// 重置自定义命令
	function resetCustomCommand() {
		const defaultPhrases = DEFAULT_VOICE_COMMANDS[editingAction];
		if (defaultPhrases) {
			editingPhrases = defaultPhrases.join(', ');
			saveCustomCommand();
		}
	}

	// 下拉选项
	const commandOptions = Object.keys(DEFAULT_VOICE_COMMANDS)
		.map((action) => ({
			value: action,
			get label() {
				return getActionName(action);
			}
		}))
		.sort((a, b) => a.value.localeCompare(b.value));

	// 监听编辑动作变化
	$effect(() => {
		const activeMap = getActiveCommands();
		const phrases = activeMap[editingAction] || DEFAULT_VOICE_COMMANDS[editingAction] || [];
		editingPhrases = phrases.join(', ');
	});

	function formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('zh-CN', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function getActionName(action: string): string {
		const binding = keyBindingsStore.getBinding(action);
		return binding?.name || action;
	}

	// 状态指示器样式
	const statusColors = {
		idle: 'bg-gray-400',
		listening: 'bg-green-500 animate-pulse',
		processing: 'bg-yellow-500',
		error: 'bg-red-500'
	};

	const statusText = {
		idle: '待机',
		listening: '监听中',
		processing: '处理中',
		error: '错误'
	};
</script>

<div class="space-y-4">
	<!-- 不支持提示 -->
	{#if !isSupported}
		<div
			class="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
		>
			<AlertCircle class="h-4 w-4 text-amber-500" />
			<span class="text-amber-700 dark:text-amber-400">当前浏览器不支持语音识别</span>
		</div>
	{:else}
		<!-- 主开关 -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Mic class="text-muted-foreground h-4 w-4" />
				<Label>启用语音控制</Label>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Info class="text-muted-foreground h-3 w-3" />
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p class="max-w-xs text-xs">
							使用语音命令控制应用，支持 {supportedCommandsCount} 种操作
						</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
			<Switch checked={isEnabled} onCheckedChange={toggleEnabled} />
		</div>

		{#if isEnabled}
			<!-- 状态显示 -->
			<div class="bg-muted/30 flex items-center justify-between rounded-md border p-3">
				<div class="flex items-center gap-3">
					<!-- 状态指示器 -->
					<div class="flex items-center gap-2">
						<span class="relative flex h-3 w-3">
							<span
								class="{statusColors[
									status
								]} absolute inline-flex h-full w-full rounded-full opacity-75"
							></span>
							<span class="{statusColors[status]} relative inline-flex h-3 w-3 rounded-full"></span>
						</span>
						<span class="text-sm font-medium">{statusText[status]}</span>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<Label class="cursor-pointer text-xs" for="continuous-mode">持续模式</Label>
					<Switch
						id="continuous-mode"
						checked={continuous}
						onCheckedChange={toggleContinuous}
						class="origin-right scale-75"
					/>
				</div>

				<!-- 监听按钮 -->
				<Button
					variant={isListening ? 'destructive' : 'default'}
					size="sm"
					onclick={toggleListening}
					class="gap-2"
				>
					{#if isListening}
						<MicOff class="h-4 w-4" />
						停止
					{:else}
						<Mic class="h-4 w-4" />
						开始监听
					{/if}
				</Button>
			</div>

			<!-- 实时识别文字显示 -->
			{#if isListening && interimText}
				<div class="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
					<Mic class="mt-0.5 h-4 w-4 animate-pulse text-blue-500" />
					<div class="flex-1">
						<p class="text-muted-foreground text-xs">正在识别...</p>
						<p class="text-sm font-medium text-blue-700 dark:text-blue-300">"{interimText}"</p>
					</div>
				</div>
			{/if}

			<!-- 最近识别结果显示 -->
			{#if lastRecognizedText}
				<div
					class="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3"
				>
					<Volume2 class="mt-0.5 h-4 w-4 text-green-500" />
					<div class="flex-1">
						<p class="text-muted-foreground text-xs">最近识别 (已执行)</p>
						<p class="text-sm font-medium">"{lastRecognizedText}"</p>
					</div>
				</div>
			{/if}

			<!-- 错误显示 -->
			{#if errorMessage}
				<div
					class="flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm"
				>
					<AlertCircle class="h-4 w-4 text-red-500" />
					<span class="text-red-700 dark:text-red-400">{errorMessage}</span>
				</div>
			{/if}

			<!-- 统计信息 -->
			<div class="grid grid-cols-2 gap-2 text-sm">
				<div class="bg-muted/30 rounded-md border p-2 text-center">
					<p class="text-primary text-lg font-bold">{totalCommands}</p>
					<p class="text-muted-foreground text-xs">总命令数</p>
				</div>
				<div class="bg-muted/30 rounded-md border p-2 text-center">
					<p class="text-lg font-bold text-green-500">{successfulCommands}</p>
					<p class="text-muted-foreground text-xs">成功执行</p>
				</div>
			</div>

			<!-- 设置和历史按钮 -->
			<div class="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					class="flex-1 text-xs"
					onclick={() => (showSettings = !showSettings)}
				>
					<Settings class="mr-1 h-3 w-3" />
					{showSettings ? '收起设置' : '高级设置'}
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="flex-1 text-xs"
					onclick={() => (showCommandEditor = !showCommandEditor)}
				>
					<Edit2 class="mr-1 h-3 w-3" />
					{showCommandEditor ? '收起编辑' : '命令编辑'}
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="flex-1 text-xs"
					onclick={() => (showHistory = !showHistory)}
				>
					<History class="mr-1 h-3 w-3" />
					{showHistory ? '收起历史' : '命令历史'}
				</Button>
			</div>

			<!-- 命令编辑区域 -->
			{#if showCommandEditor}
				<div class="bg-muted/20 space-y-3 rounded-md border p-3">
					<h4 class="text-muted-foreground text-xs font-medium">自定义命令字典</h4>

					<div class="space-y-2">
						<Label class="text-xs">选择操作</Label>
						<NativeSelect
							class="h-8 w-full text-xs"
							value={editingAction}
							onchange={(e) => (editingAction = (e.target as HTMLSelectElement).value)}
						>
							{#each commandOptions as option}
								<NativeSelectOption value={option.value}>{option.label}</NativeSelectOption>
							{/each}
						</NativeSelect>
					</div>

					<div class="space-y-2">
						<Label class="text-xs">语音指令 (用逗号分隔)</Label>
						<textarea
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-20 w-full rounded-md border px-3 py-2 text-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							bind:value={editingPhrases}
							placeholder="例如：放大, 变大, 放大图片"
						></textarea>
					</div>

					<div class="flex gap-2">
						<Button size="sm" class="flex-1 text-xs" onclick={saveCustomCommand}>
							<Save class="mr-1 h-3 w-3" /> 保存
						</Button>
						<Button variant="outline" size="sm" class="flex-1 text-xs" onclick={resetCustomCommand}>
							<RotateCcw class="mr-1 h-3 w-3" /> 重置默认
						</Button>
					</div>
				</div>
			{/if}

			<!-- 高级设置 -->
			{#if showSettings}
				<div class="bg-muted/20 space-y-3 rounded-md border p-3">
					<h4 class="text-muted-foreground text-xs font-medium">高级设置</h4>

					<!-- 触发模式 -->
					<div class="flex items-center justify-between">
						<Label class="text-xs">触发模式</Label>
						<NativeSelect
							class="h-7 w-24 text-xs"
							value={triggerMode}
							onchange={(e) => updateTriggerMode((e.target as HTMLSelectElement).value)}
						>
							<NativeSelectOption value="button">按钮</NativeSelectOption>
							<NativeSelectOption value="hotkey">热键</NativeSelectOption>
						</NativeSelect>
					</div>

					<!-- 最低置信度 -->
					<div class="flex items-center justify-between">
						<Label class="text-xs">最低置信度: {(minConfidence * 100).toFixed(0)}%</Label>
						<input
							type="range"
							min="0.3"
							max="0.9"
							step="0.1"
							value={minConfidence}
							oninput={(e) => updateMinConfidence(parseFloat((e.target as HTMLInputElement).value))}
							class="h-2 w-24"
						/>
					</div>

					<!-- 显示反馈 -->
					<div class="flex items-center justify-between">
						<Label class="text-xs">显示命令反馈</Label>
						<Switch checked={showFeedback} onCheckedChange={toggleShowFeedback} />
					</div>

					<!-- 重置统计 -->
					<Button variant="ghost" size="sm" class="w-full text-xs" onclick={resetStats}>
						重置统计数据
					</Button>
				</div>
			{/if}

			<!-- 命令历史 -->
			{#if showHistory}
				<div class="bg-muted/20 max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
					<h4 class="text-muted-foreground text-xs font-medium">命令历史</h4>
					{#if commandHistory.length === 0}
						<p class="text-muted-foreground py-2 text-center text-xs">暂无历史记录</p>
					{:else}
						{#each commandHistory.slice(0, 10) as item}
							<div
								class="border-border/50 flex items-center justify-between border-b py-1 text-xs last:border-0"
							>
								<div class="flex items-center gap-2">
									{#if item.success}
										<CheckCircle class="h-3 w-3 text-green-500" />
									{:else}
										<AlertCircle class="h-3 w-3 text-red-500" />
									{/if}
									<span class="font-medium">{getActionName(item.action)}</span>
								</div>
								<span class="text-muted-foreground">{formatTime(item.time)}</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			<!-- 支持的命令提示 -->
			<div class="text-muted-foreground text-xs">
				<p>💡 提示：说出命令如 "下一页"、"放大"、"全屏" 等</p>
			</div>
		{/if}
	{/if}
</div>
