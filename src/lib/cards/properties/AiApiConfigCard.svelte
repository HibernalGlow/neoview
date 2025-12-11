<script lang="ts">
/**
 * AiApiConfigCard - AI API 配置卡片
 * 统一管理 AI 提供商配置，供 AI 标签、翻译等功能使用
 */
import { Settings, Plus, Trash2, Check, X, Loader2, ChevronDown, ChevronUp } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import * as Select from '$lib/components/ui/select';
import { aiApiConfigStore, AI_PROVIDER_PRESETS, type AiProvider } from '$lib/stores/aiApiConfig.svelte';

// 状态
let providers = $state<AiProvider[]>([]);
let activeProviderId = $state<string | null>(null);
let showAddForm = $state(false);
let testingId = $state<string | null>(null);
let testResult = $state<{ success: boolean; message: string } | null>(null);
let editingId = $state<string | null>(null);

// 新提供商表单
let newPreset = $state('deepseek');
let newApiKey = $state('');

// 订阅 store
$effect(() => {
	const unsub = aiApiConfigStore.subscribe(state => {
		providers = state.providers;
		activeProviderId = state.activeProviderId;
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
function handleRemove(id: string) {
	aiApiConfigStore.removeProvider(id);
}

// 设置活动提供商
function handleSetActive(id: string) {
	aiApiConfigStore.setActiveProvider(id);
}

// 测试连接
async function handleTest(provider: AiProvider) {
	testingId = provider.id;
	testResult = null;
	
	const result = await aiApiConfigStore.testConnection(provider);
	testResult = result;
	testingId = null;
	
	// 3秒后清除结果
	setTimeout(() => { testResult = null; }, 3000);
}

// 更新 API Key
function handleUpdateApiKey(id: string, apiKey: string) {
	aiApiConfigStore.updateProvider(id, { apiKey });
}

// 切换编辑
function toggleEdit(id: string) {
	editingId = editingId === id ? null : id;
}
</script>

<div class="space-y-3">
	<!-- 头部 -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Settings class="h-4 w-4 text-blue-500" />
			<span class="text-sm font-medium">AI API 配置</span>
		</div>
		<Button 
			variant="ghost" 
			size="icon" 
			class="h-6 w-6"
			onclick={() => { showAddForm = !showAddForm; }}
		>
			{#if showAddForm}
				<X class="h-3.5 w-3.5" />
			{:else}
				<Plus class="h-3.5 w-3.5" />
			{/if}
		</Button>
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
			<p class="mt-1">点击 + 添加 AI 提供商</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each providers as provider (provider.id)}
				{@const isActive = provider.id === activeProviderId}
				{@const isEditing = provider.id === editingId}
				{@const isTesting = provider.id === testingId}
				
				<div class="rounded border {isActive ? 'border-primary bg-primary/5' : 'border-border'}">
					<!-- 头部 -->
					<div class="flex items-center gap-2 p-2">
						<button
							type="button"
							class="flex-1 flex items-center gap-2 text-left"
							onclick={() => handleSetActive(provider.id)}
						>
							<div class="w-2 h-2 rounded-full {isActive ? 'bg-green-500' : 'bg-muted-foreground/30'}"></div>
							<span class="text-xs font-medium">{provider.name}</span>
							<span class="text-[10px] text-muted-foreground">{provider.model}</span>
						</button>
						<Button
							variant="ghost"
							size="icon"
							class="h-6 w-6"
							onclick={() => toggleEdit(provider.id)}
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
								oninput={(e) => handleUpdateApiKey(provider.id, (e.target as HTMLInputElement).value)}
							/>
							<Input
								value={provider.baseUrl}
								placeholder="API URL"
								class="h-7 text-xs"
								oninput={(e) => aiApiConfigStore.updateProvider(provider.id, { baseUrl: (e.target as HTMLInputElement).value })}
							/>
							<Input
								value={provider.model}
								placeholder="模型"
								class="h-7 text-xs"
								oninput={(e) => aiApiConfigStore.updateProvider(provider.id, { model: (e.target as HTMLInputElement).value })}
							/>
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									class="flex-1 h-7 text-xs"
									disabled={isTesting}
									onclick={() => handleTest(provider)}
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
									onclick={() => handleRemove(provider.id)}
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
	</div>
</div>
