<script lang="ts">
/**
 * AI 翻译服务配置卡片
 */
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import { aiTranslationStore, type TranslationServiceType, BUILTIN_PRESETS, type TranslationPreset, FILE_TYPE_GROUPS, type CleanupRule, type FileTypeKey } from '$lib/stores/ai/translationStore.svelte';
import { testConnection } from '$lib/services/translationService';
import { Settings, Server, Bot, CheckCircle, XCircle, Loader2, Copy, Check, Terminal, Ban, ExternalLink, Circle, Sparkles, BookOpen } from '@lucide/svelte';
import * as Select from '$lib/components/ui/select';

let config = $state(aiTranslationStore.getConfig());
let isTesting = $state(false);
let testResult = $state<{ success: boolean; message: string } | null>(null);
let serviceOnline = $state<boolean | null>(null);
let checkingStatus = $state(false);

// 检查服务状态
async function checkServiceStatus() {
	if (config.type !== 'libretranslate') return;
	checkingStatus = true;
	try {
		const response = await fetch(`${config.libreTranslateUrl}/languages`, {
			method: 'GET',
			signal: AbortSignal.timeout(3000)
		});
		serviceOnline = response.ok;
	} catch {
		serviceOnline = false;
	} finally {
		checkingStatus = false;
	}
}

// 初始检查和配置变化时检查
$effect(() => {
	if (config.type === 'libretranslate' && config.libreTranslateUrl) {
		checkServiceStatus();
	} else {
		serviceOnline = null;
	}
});

// 在浏览器中打开
function openInBrowser() {
	window.open(config.libreTranslateUrl, '_blank');
}

// 订阅 store 更新
$effect(() => {
	const unsubscribe = aiTranslationStore.subscribe((state) => {
		config = state.config;
	});
	return unsubscribe;
});

function handleServiceTypeChange(value: string) {
	aiTranslationStore.setServiceType(value as TranslationServiceType);
}

function updateLibreTranslateUrl(e: Event) {
	const value = (e.target as HTMLInputElement).value;
	aiTranslationStore.updateConfig({ libreTranslateUrl: value });
}

function updateLibreTranslateApiKey(e: Event) {
	const value = (e.target as HTMLInputElement).value;
	aiTranslationStore.updateConfig({ libreTranslateApiKey: value });
}

function updateOllamaUrl(e: Event) {
	const value = (e.target as HTMLInputElement).value;
	aiTranslationStore.updateConfig({ ollamaUrl: value });
}

function updateOllamaModel(e: Event) {
	const value = (e.target as HTMLInputElement).value;
	aiTranslationStore.updateConfig({ ollamaModel: value });
}

function updateSourceLanguage(value: string) {
	aiTranslationStore.updateConfig({ sourceLanguage: value });
}

function updateTargetLanguage(value: string) {
	aiTranslationStore.updateConfig({ targetLanguage: value });
}

// 标题裁剪正则
let cleanupPatternsText = $state('');

// 初始化正则文本
$effect(() => {
	if (config.titleCleanupPatterns) {
		cleanupPatternsText = config.titleCleanupPatterns.join('\n');
	}
});

function updateCleanupPatterns() {
	const patterns = cleanupPatternsText
		.split('\n')
		.map(p => p.trim())
		.filter(p => p.length > 0);
	aiTranslationStore.updateConfig({ titleCleanupPatterns: patterns });
}

// 裁剪规则管理
let showRulesEditor = $state(false);

function toggleRuleEnabled(ruleId: string) {
	const rules = [...(config.cleanupRules || [])];
	const idx = rules.findIndex(r => r.id === ruleId);
	if (idx >= 0) {
		rules[idx] = { ...rules[idx], enabled: !rules[idx].enabled };
		aiTranslationStore.updateConfig({ cleanupRules: rules });
	}
}

function updateRulePattern(ruleId: string, pattern: string) {
	const rules = [...(config.cleanupRules || [])];
	const idx = rules.findIndex(r => r.id === ruleId);
	if (idx >= 0) {
		rules[idx] = { ...rules[idx], pattern };
		aiTranslationStore.updateConfig({ cleanupRules: rules });
	}
}

function toggleRuleApplyTo(ruleId: string, typeKey: FileTypeKey) {
	const rules = [...(config.cleanupRules || [])];
	const idx = rules.findIndex(r => r.id === ruleId);
	if (idx >= 0) {
		const applyTo = [...rules[idx].applyTo];
		const typeIdx = applyTo.indexOf(typeKey);
		if (typeIdx >= 0) {
			applyTo.splice(typeIdx, 1);
		} else {
			// 如果添加 'all'，清除其他
			if (typeKey === 'all') {
				applyTo.length = 0;
			} else {
				// 如果已有 'all'，移除它
				const allIdx = applyTo.indexOf('all');
				if (allIdx >= 0) applyTo.splice(allIdx, 1);
			}
			applyTo.push(typeKey);
		}
		rules[idx] = { ...rules[idx], applyTo };
		aiTranslationStore.updateConfig({ cleanupRules: rules });
	}
}

function addRule() {
	const rules = [...(config.cleanupRules || [])];
	const newRule: CleanupRule = {
		id: `rule-${Date.now()}`,
		pattern: '',
		enabled: true,
		applyTo: ['all'],
		description: '',
	};
	rules.push(newRule);
	aiTranslationStore.updateConfig({ cleanupRules: rules });
}

function removeRule(ruleId: string) {
	const rules = (config.cleanupRules || []).filter(r => r.id !== ruleId);
	aiTranslationStore.updateConfig({ cleanupRules: rules });
}

// 导出配置
function exportConfig() {
	const exportData = {
		version: 1,
		exportedAt: new Date().toISOString(),
		config: {
			type: config.type,
			ollamaUrl: config.ollamaUrl,
			ollamaModel: config.ollamaModel,
			ollamaPromptTemplate: config.ollamaPromptTemplate,
			libreTranslateUrl: config.libreTranslateUrl,
			sourceLanguage: config.sourceLanguage,
			targetLanguage: config.targetLanguage,
			cleanupRules: config.cleanupRules,
		},
	};
	const json = JSON.stringify(exportData, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `ai-translation-config-${new Date().toISOString().split('T')[0]}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

// 导入配置
let importInput: HTMLInputElement | null = null;

function handleImportClick() {
	importInput?.click();
}

function handleImportFile(e: Event) {
	const file = (e.target as HTMLInputElement).files?.[0];
	if (!file) return;
	
	const reader = new FileReader();
	reader.onload = (event) => {
		try {
			const data = JSON.parse(event.target?.result as string);
			if (data.config) {
				aiTranslationStore.updateConfig(data.config);
				testResult = { success: true, message: '配置导入成功' };
			}
		} catch (err) {
			testResult = { success: false, message: '导入失败：无效的配置文件' };
		}
	};
	reader.readAsText(file);
	// 重置 input
	if (importInput) importInput.value = '';
}

// Prompt 模板
let promptTemplateText = $state('');

$effect(() => {
	if (config.ollamaPromptTemplate) {
		promptTemplateText = config.ollamaPromptTemplate;
	}
});

function updatePromptTemplate() {
	aiTranslationStore.updateConfig({ ollamaPromptTemplate: promptTemplateText, activePreset: 'custom' });
}

// 预设选择
function applyPreset(preset: TranslationPreset) {
	const updates: Partial<typeof config> = {
		activePreset: preset.id,
		type: preset.type,
	};
	
	if (preset.ollamaUrl) updates.ollamaUrl = preset.ollamaUrl;
	if (preset.ollamaModel) updates.ollamaModel = preset.ollamaModel;
	if (preset.ollamaPromptTemplate) {
		updates.ollamaPromptTemplate = preset.ollamaPromptTemplate;
		promptTemplateText = preset.ollamaPromptTemplate;
	}
	if (preset.libreTranslateUrl) updates.libreTranslateUrl = preset.libreTranslateUrl;
	if (preset.sourceLanguage) updates.sourceLanguage = preset.sourceLanguage;
	if (preset.targetLanguage) updates.targetLanguage = preset.targetLanguage;
	if (preset.titleCleanupPatterns) {
		updates.titleCleanupPatterns = preset.titleCleanupPatterns;
		cleanupPatternsText = preset.titleCleanupPatterns.join('\n');
	}
	
	aiTranslationStore.updateConfig(updates);
}

function handlePresetChange(presetId: string) {
	if (presetId === 'custom') {
		aiTranslationStore.updateConfig({ activePreset: 'custom' });
		return;
	}
	const preset = BUILTIN_PRESETS.find(p => p.id === presetId);
	if (preset) {
		applyPreset(preset);
	}
}

async function handleTestConnection() {
	isTesting = true;
	testResult = null;

	try {
		const result = await testConnection();
		if (result.success) {
			testResult = { success: true, message: `测试成功: "${result.translated}"` };
		} else {
			testResult = { success: false, message: result.error || '测试失败' };
		}
	} catch (e) {
		testResult = { success: false, message: `测试出错: ${e}` };
	} finally {
		isTesting = false;
	}
}

const serviceTypeOptions = [
	{ value: 'disabled', label: '禁用' },
	{ value: 'libretranslate', label: 'LibreTranslate' },
	{ value: 'ollama', label: 'Ollama (本地模型)' },
];

const languageOptions = [
	{ value: 'auto', label: '自动检测' },
	{ value: 'ja', label: '日语' },
	{ value: 'en', label: '英语' },
	{ value: 'ko', label: '韩语' },
];

const targetLanguageOptions = [
	{ value: 'zh', label: '中文' },
	{ value: 'en', label: '英语' },
];

// 生成 LibreTranslate 启动命令
let copied = $state(false);

const startCommand = $derived.by(() => {
	if (config.type !== 'libretranslate') return '';
	
	try {
		const url = new URL(config.libreTranslateUrl || 'http://localhost:5000');
		const host = url.hostname;
		const port = url.port || '5000';
		
		// 收集需要的语言
		const langs = new Set<string>();
		if (config.sourceLanguage && config.sourceLanguage !== 'auto') {
			langs.add(config.sourceLanguage);
		} else {
			// 自动检测时默认加载日语
			langs.add('ja');
		}
		langs.add(config.targetLanguage || 'zh');
		// 英语作为中转语言
		langs.add('en');
		
		const langList = Array.from(langs).sort().join(',');
		
		return `libretranslate --host ${host} --port ${port} --load-only ${langList}`;
	} catch {
		return 'libretranslate --host 0.0.0.0 --port 5000 --load-only en,ja,zh';
	}
});

async function copyCommand() {
	if (!startCommand) return;
	try {
		await navigator.clipboard.writeText(startCommand);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	} catch (e) {
		console.error('复制失败:', e);
	}
}
</script>

<div class="space-y-4">
	<!-- 服务类型选择 - Tab 切换 -->
	<div class="space-y-2">
		<Label>翻译服务</Label>
		<div class="flex rounded-md border bg-muted/30 p-1">
			<button
				class="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors {config.type === 'disabled' ? 'bg-background shadow-sm' : 'hover:bg-muted'}"
				onclick={() => handleServiceTypeChange('disabled')}
			>
				<Ban class="h-3 w-3" />
				禁用
			</button>
			<button
				class="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors {config.type === 'libretranslate' ? 'bg-background shadow-sm' : 'hover:bg-muted'}"
				onclick={() => handleServiceTypeChange('libretranslate')}
			>
				<Server class="h-3 w-3" />
				LibreTranslate
			</button>
			<button
				class="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors {config.type === 'ollama' ? 'bg-background shadow-sm' : 'hover:bg-muted'}"
				onclick={() => handleServiceTypeChange('ollama')}
			>
				<Bot class="h-3 w-3" />
				Ollama
			</button>
		</div>
	</div>

	{#if config.type === 'libretranslate'}
		<!-- LibreTranslate 配置 -->
		<div class="space-y-3 rounded-md border bg-muted/20 p-3">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 text-sm font-medium">
					<Server class="h-4 w-4" />
					LibreTranslate 配置
				</div>
				<!-- 服务状态和操作 -->
				<div class="flex items-center gap-2">
					<!-- 状态指示器 -->
					<div class="flex items-center gap-1 text-xs" title={serviceOnline === null ? '未检测' : serviceOnline ? '服务在线' : '服务离线'}>
						{#if checkingStatus}
							<Loader2 class="h-3 w-3 animate-spin text-muted-foreground" />
						{:else if serviceOnline === true}
							<Circle class="h-2 w-2 fill-green-500 text-green-500" />
							<span class="text-green-600 dark:text-green-400">在线</span>
						{:else if serviceOnline === false}
							<Circle class="h-2 w-2 fill-red-500 text-red-500" />
							<span class="text-red-600 dark:text-red-400">离线</span>
						{/if}
					</div>
					<!-- 打开浏览器 -->
					<Button
						variant="ghost"
						size="sm"
						class="h-6 w-6 p-0"
						onclick={openInBrowser}
						title="在浏览器中打开"
					>
						<ExternalLink class="h-3 w-3" />
					</Button>
					<!-- 刷新状态 -->
					<Button
						variant="ghost"
						size="sm"
						class="h-6 w-6 p-0"
						onclick={checkServiceStatus}
						disabled={checkingStatus}
						title="刷新状态"
					>
						<Settings class="h-3 w-3 {checkingStatus ? 'animate-spin' : ''}" />
					</Button>
				</div>
			</div>
			<div class="space-y-2">
				<Label class="text-xs">API 地址</Label>
				<Input
					value={config.libreTranslateUrl}
					oninput={updateLibreTranslateUrl}
					placeholder="http://localhost:5000"
				/>
			</div>
			<div class="space-y-2">
				<Label class="text-xs">API Key (可选)</Label>
				<Input
					value={config.libreTranslateApiKey}
					oninput={updateLibreTranslateApiKey}
					type="password"
					placeholder="留空表示不使用"
				/>
			</div>

			<!-- 启动命令 -->
			<div class="space-y-2 border-t pt-3">
				<div class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
					<Terminal class="h-3 w-3" />
					启动命令
				</div>
				<div class="flex items-center gap-2">
					<code class="flex-1 rounded bg-muted px-2 py-1.5 text-xs font-mono break-all">
						{startCommand}
					</code>
					<Button
						variant="ghost"
						size="sm"
						class="h-8 w-8 shrink-0 p-0"
						onclick={copyCommand}
						title="复制命令"
					>
						{#if copied}
							<Check class="h-4 w-4 text-green-500" />
						{:else}
							<Copy class="h-4 w-4" />
						{/if}
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					在终端运行此命令启动 LibreTranslate 服务
				</p>
			</div>
		</div>
	{:else if config.type === 'ollama'}
		<!-- Ollama 配置 -->
		<div class="space-y-3 rounded-md border bg-muted/20 p-3">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 text-sm font-medium">
					<Bot class="h-4 w-4" />
					Ollama 配置
				</div>
				<!-- 预设选择 -->
				<div class="flex items-center gap-2">
					<BookOpen class="h-3 w-3 text-muted-foreground" />
					<select
						class="h-7 rounded border bg-background px-2 text-xs"
						value={config.activePreset}
						onchange={(e) => handlePresetChange((e.target as HTMLSelectElement).value)}
					>
						<option value="custom">自定义</option>
						{#each BUILTIN_PRESETS.filter(p => p.type === 'ollama') as preset}
							<option value={preset.id}>{preset.name}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="space-y-2">
				<Label class="text-xs">API 地址</Label>
				<Input
					value={config.ollamaUrl}
					oninput={updateOllamaUrl}
					placeholder="http://localhost:11434"
				/>
			</div>
			<div class="space-y-2">
				<Label class="text-xs">模型名称</Label>
				<Input
					value={config.ollamaModel}
					oninput={updateOllamaModel}
					placeholder="qwen2.5:7b"
				/>
				<p class="text-xs text-muted-foreground">推荐: qwen2.5:7b, llama3.2:3b</p>
			</div>
			<!-- Prompt 模板 -->
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<Label class="text-xs">Prompt 模板</Label>
					<span class="text-[10px] text-muted-foreground">变量: {'{'+'text}'} {'{'+'source_lang}'} {'{'+'target_lang}'} {'{'+'filename}'}</span>
				</div>
				<textarea
					class="w-full rounded border bg-background p-2 text-xs min-h-[60px] resize-y"
					value={promptTemplateText}
					oninput={(e) => promptTemplateText = (e.target as HTMLTextAreaElement).value}
					onblur={updatePromptTemplate}
					placeholder="请将以下{'{source_lang}'}文本翻译成{'{target_lang}'}，只返回翻译结果：{'{text}'}"
				></textarea>
			</div>
		</div>
	{/if}

	{#if config.type !== 'disabled'}
		<!-- 语言设置 -->
		<div class="space-y-3">
			<div class="space-y-2">
				<Label class="text-xs">源语言</Label>
				<div class="flex rounded-md border bg-muted/30 p-1">
					{#each languageOptions as option}
						<button
							class="flex-1 rounded px-2 py-1 text-xs transition-colors {config.sourceLanguage === option.value ? 'bg-background shadow-sm' : 'hover:bg-muted'}"
							onclick={() => updateSourceLanguage(option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
			<div class="space-y-2">
				<Label class="text-xs">目标语言</Label>
				<div class="flex rounded-md border bg-muted/30 p-1">
					{#each targetLanguageOptions as option}
						<button
							class="flex-1 rounded px-2 py-1 text-xs transition-colors {config.targetLanguage === option.value ? 'bg-background shadow-sm' : 'hover:bg-muted'}"
							onclick={() => updateTargetLanguage(option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- 标题裁剪规则 -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<Label class="text-xs">标题裁剪规则</Label>
				<div class="flex items-center gap-2">
					<button
						class="text-xs text-primary hover:underline"
						onclick={addRule}
					>
						+ 添加规则
					</button>
				</div>
			</div>
			
			<!-- 规则列表 -->
			<div class="space-y-2">
				{#each config.cleanupRules || [] as rule (rule.id)}
					<div class="flex items-start gap-2 rounded border bg-muted/20 p-2">
						<!-- 开关 -->
						<button
							class="mt-1 h-4 w-4 rounded border flex items-center justify-center text-xs {rule.enabled ? 'bg-primary text-primary-foreground' : 'bg-background'}"
							onclick={() => toggleRuleEnabled(rule.id)}
							title={rule.enabled ? '已启用' : '已禁用'}
						>
							{rule.enabled ? '✓' : ''}
						</button>
						
						<div class="flex-1 space-y-1">
							<!-- 正则表达式 -->
							<input
								type="text"
								class="w-full rounded border bg-background px-2 py-1 text-xs font-mono"
								value={rule.pattern}
								placeholder="正则表达式，如 \\[.*?\\]"
								oninput={(e) => updateRulePattern(rule.id, (e.target as HTMLInputElement).value)}
							/>
							
							<!-- 生效类型选择 -->
							<div class="flex flex-wrap gap-1">
								<button
									class="px-1.5 py-0.5 text-[10px] rounded border {rule.applyTo.includes('all') ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}"
									onclick={() => toggleRuleApplyTo(rule.id, 'all')}
								>
									全部
								</button>
								{#each Object.entries(FILE_TYPE_GROUPS) as [key, group]}
									<button
										class="px-1.5 py-0.5 text-[10px] rounded border {rule.applyTo.includes(key as FileTypeKey) ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}"
										onclick={() => toggleRuleApplyTo(rule.id, key as FileTypeKey)}
									>
										{group.icon} {group.label}
									</button>
								{/each}
							</div>
						</div>
						
						<!-- 删除按钮 -->
						<button
							class="mt-1 text-xs text-muted-foreground hover:text-destructive"
							onclick={() => removeRule(rule.id)}
							title="删除规则"
						>
							✕
						</button>
					</div>
				{/each}
				
				{#if !config.cleanupRules || config.cleanupRules.length === 0}
					<p class="text-xs text-muted-foreground text-center py-2">
						暂无裁剪规则，点击"添加规则"创建
					</p>
				{/if}
			</div>
			
			<p class="text-xs text-muted-foreground">
				翻译前去除匹配的内容。可按文件类型选择生效范围。
			</p>
		</div>

		<!-- 测试连接 -->
		<div class="space-y-2">
			<Button
				variant="outline"
				size="sm"
				onclick={handleTestConnection}
				disabled={isTesting}
				class="w-full"
			>
				{#if isTesting}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					测试中...
				{:else}
					<Settings class="mr-2 h-4 w-4" />
					测试连接
				{/if}
			</Button>

			{#if testResult}
				<div class="flex items-center gap-2 rounded-md p-2 text-xs {testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}">
					{#if testResult.success}
						<CheckCircle class="h-4 w-4" />
					{:else}
						<XCircle class="h-4 w-4" />
					{/if}
					<span class="flex-1">{testResult.message}</span>
				</div>
			{/if}
			
			<!-- 导出/导入配置 -->
			<div class="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					onclick={exportConfig}
					class="flex-1"
				>
					导出配置
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={handleImportClick}
					class="flex-1"
				>
					导入配置
				</Button>
				<input
					type="file"
					accept=".json"
					class="hidden"
					bind:this={importInput}
					onchange={handleImportFile}
				/>
			</div>
		</div>
	{/if}
</div>
