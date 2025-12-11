<script lang="ts">
/**
 * AiApiConfigCard - AI API 配置卡片
 * 统一管理 AI 提供商配置，供 AI 标签、翻译等功能使用
 * 支持导入/导出，与 EMM 的 api_config.json 格式兼容
 */
import { Settings, Plus, Trash2, Check, X, Loader2, ChevronDown, ChevronUp, Download, Upload } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import * as Select from '$lib/components/ui/select';
import { aiApiConfigStore, AI_PROVIDER_PRESETS, type AiProvider, type AiApiConfigJson } from '$lib/stores/aiApiConfig.svelte';

// 状态
let providers = $state<AiProvider[]>([]);
let activeIndex = $state(0);
let showAddForm = $state(false);
let testingIndex = $state<number | null>(null);
let testResult = $state<{ success: boolean; message: string } | null>(null);
let editingIndex = $state<number | null>(null);

// 新提供商表单
let newPreset = $state('deepseek');
let newApiKey = $state('');

// 订阅 store
$effect(() => {
	const unsub = aiApiConfigStore.subscribe(state => {
		providers = state.providers;
		activeIndex = state.activeIndex;
	});
	return unsub;
});

// 添加提供商
function handleAdd() {
	if (!newPreset) return;
	aiApiConfigStore.addFromPreset(newPreset, newApiKey);
	newApiKey = '';
	showAddForm = false;
}

// 删除提供商
function handleRemove(index: number) {
	aiApiConfigStore.removeProvider(index);
	if (editingIndex === index) editingIndex = null;
}

// 设置活动提供商
function handleSetActive(index: number) {
	aiApiConfigStore.setActiveIndex(index);
}

// 测试连接
async function handleTest(index: number, provider: AiProvider) {
	testingIndex = index;
	testResult = null;
	
	const result = await aiApiConfigStore.testConnection(provider);
	testResult = result;
	testingIndex = null;
	
	setTimeout(() => { testResult = null; }, 3000);
}

// 更新提供商字段
function handleUpdate(index: number, field: keyof AiProvider, value: string) {
	aiApiConfigStore.updateProvider(index, { [field]: value });
}

// 切换编辑
function toggleEdit(index: number) {
	editingIndex = editingIndex === index ? null : index;
}

// 导出配置
function handleExport() {
	const config = aiApiConfigStore.exportConfig();
	const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'api_config.json';
	a.click();
	URL.revokeObjectURL(url);
}

// 导入配置
function handleImport() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';
	input.onchange = async (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const config: AiApiConfigJson = JSON.parse(text);
			aiApiConfigStore.importConfig(config);
			testResult = { success: true, message: `导入成功: ${config.providers?.length || 0} 个提供商` };
			setTimeout(() => { testResult = null; }, 3000);
		} catch (err) {
			testResult = { success: false, message: `导入失败: ${err instanceof Error ? err.message : '无效的 JSON'}` };
			setTimeout(() => { testResult = null; }, 3000);
		}
	};
	input.click();
}
</script>

<div class="space-y-3">
	<!-- 头部 -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Settings class="h-4 w-4 text-blue-500" />
			<span class="text-sm font-medium">AI API 配置</span>
		</div>
		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleImport} title="导入配置">
				<Upload class="h-3.5 w-3.5" />
			</Button>
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleExport} title="导出配置" disabled={providers.length === 0}>
				<Download class="h-3.5 w-3.5" />
			</Button>
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => { showAddForm = !showAddForm; }} title="添加提供商">
				{#if showAddForm}
					<X class="h-3.5 w-3.5" />
				{:else}
					<Plus class="h-3.5 w-3.5" />
				{/if}
			</Button>
		</div>
	</div>

	<!-- 添加表单 -->
	{#if showAddForm}
		<div class="space-y-2 p-2 rounded border bg-muted/30">
			<Select.Root type="single" bind:value={newPreset}>
				<Select.Trigger class="h-8 text-xs">
					<span>{AI_PROVIDER_PRESETS[newPreset]?.name || '选择提供商'}</span>
				</Select.Trigger>
				<Select.Content>
					{#each Object.entries(AI_PROVIDER_PRESETS) as [id, preset]}
						<Select.Item value={id}>{preset.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Input
				bind:value={newApiKey}
				placeholder="API Key (Ollama 可留空)"
				type="password"
				class="h-8 text-xs"
			/>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" class="flex-1 h-7" onclick={() => { showAddForm = false; }}>
					取消
				</Button>
				<Button variant="default" size="sm" class="flex-1 h-7" onclick={handleAdd}>
					添加
				</Button>
			</div>
		</div>
	{/if}

	<!-- 提供商列表 -->
	{#if providers.length === 0}
		<div class="text-xs text-muted-foreground text-center py-4">
			<p>暂无配置</p>
			<p class="mt-1">点击 + 添加提供商，或导入 api_config.json</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each providers as provider, index (index)}
				{@const isActive = index === activeIndex}
				{@const isEditing = index === editingIndex}
				{@const isTesting = index === testingIndex}
				
				<div class="rounded border {isActive ? 'border-primary bg-primary/5' : 'border-border'}">
					<!-- 头部 -->
					<div class="flex items-center gap-2 p-2">
						<button
							type="button"
							class="flex-1 flex items-center gap-2 text-left"
							onclick={() => handleSetActive(index)}
						>
							<div class="w-2 h-2 rounded-full {isActive ? 'bg-green-500' : 'bg-muted-foreground/30'}"></div>
							<span class="text-xs font-medium">{provider.name}</span>
							<span class="text-[10px] text-muted-foreground">{provider.model}</span>
						</button>
						<Button
							variant="ghost"
							size="icon"
							class="h-6 w-6"
							onclick={() => toggleEdit(index)}
						>
							{#if isEditing}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</Button>
					</div>

					<!-- 展开详情 -->
					{#if isEditing}
						<div class="px-2 pb-2 space-y-2 border-t">
							<Input
								value={provider.apiKey}
								placeholder="API Key"
								type="password"
								class="h-7 text-xs mt-2"
								oninput={(e) => handleUpdate(index, 'apiKey', (e.target as HTMLInputElement).value)}
							/>
							<Input
								value={provider.baseUrl}
								placeholder="API URL"
								class="h-7 text-xs"
								oninput={(e) => handleUpdate(index, 'baseUrl', (e.target as HTMLInputElement).value)}
							/>
							<Input
								value={provider.model}
								placeholder="模型"
								class="h-7 text-xs"
								oninput={(e) => handleUpdate(index, 'model', (e.target as HTMLInputElement).value)}
							/>
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									class="flex-1 h-7 text-xs"
									disabled={isTesting}
									onclick={() => handleTest(index, provider)}
								>
									{#if isTesting}
										<Loader2 class="h-3 w-3 mr-1 animate-spin" />
										测试中
									{:else}
										测试连接
									{/if}
								</Button>
								<Button
									variant="destructive"
									size="icon"
									class="h-7 w-7"
									onclick={() => handleRemove(index)}
								>
									<Trash2 class="h-3 w-3" />
								</Button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- 测试结果 -->
	{#if testResult}
		<div class="text-xs px-2 py-1 rounded {testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}">
			{#if testResult.success}
				<Check class="h-3 w-3 inline mr-1" />
			{:else}
				<X class="h-3 w-3 inline mr-1" />
			{/if}
			{testResult.message}
		</div>
	{/if}

	<!-- 使用说明 -->
	<div class="text-[10px] text-muted-foreground space-y-1">
		<p>💡 推荐 DeepSeek (约¥0.001/次) 或 Ollama (免费本地)</p>
		<p>🔗 此配置供 AI 标签推断、翻译等功能共享使用</p>
		<p>📁 支持导入/导出 EMM 的 api_config.json 格式</p>
	</div>
</div>
