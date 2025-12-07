<script lang="ts">
/**
 * AI 标题翻译卡片
 * 控制标题自动翻译功能
 */
import { Switch } from '$lib/components/ui/switch';
import { Label } from '$lib/components/ui/label';
import { aiTranslationStore } from '$lib/stores/ai/translationStore.svelte';
import { Languages, Info } from '@lucide/svelte';
import * as Tooltip from '$lib/components/ui/tooltip';

let config = $state(aiTranslationStore.getConfig());
let stats = $state(aiTranslationStore.getCacheStats());

// 订阅 store 更新
$effect(() => {
	const unsubscribe = aiTranslationStore.subscribe((state) => {
		config = state.config;
		stats = {
			size: state.cache.size,
			...state.stats,
		};
	});
	return unsubscribe;
});

function toggleEnabled() {
	aiTranslationStore.setEnabled(!config.enabled);
}

function toggleAutoTranslate() {
	aiTranslationStore.updateConfig({ autoTranslate: !config.autoTranslate });
}
</script>

<div class="space-y-4">
	<!-- 功能开关 -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Languages class="h-4 w-4 text-muted-foreground" />
			<Label>启用 AI 标题翻译</Label>
		</div>
		<Switch checked={config.enabled} onCheckedChange={toggleEnabled} />
	</div>

	{#if config.enabled}
		<!-- 自动翻译开关 -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Label class="text-sm">自动翻译无 EMM 翻译的标题</Label>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Info class="h-3 w-3 text-muted-foreground" />
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p class="max-w-xs text-xs">当文件没有 EMM 数据库中的翻译标题时，自动使用 AI 翻译日文标题</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
			<Switch checked={config.autoTranslate} onCheckedChange={toggleAutoTranslate} />
		</div>

		<!-- 当前服务状态 -->
		<div class="rounded-md border bg-muted/30 p-3 text-sm">
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground">当前服务:</span>
				<span class="font-medium">
					{#if config.type === 'libretranslate'}
						LibreTranslate
					{:else if config.type === 'ollama'}
						Ollama ({config.ollamaModel})
					{:else}
						未配置
					{/if}
				</span>
			</div>
			<div class="mt-1 flex items-center justify-between">
				<span class="text-muted-foreground">缓存数量:</span>
				<span class="font-medium">{stats.size}</span>
			</div>
			<div class="mt-1 flex items-center justify-between">
				<span class="text-muted-foreground">API 调用:</span>
				<span class="font-medium">{stats.apiCalls}</span>
			</div>
		</div>

		{#if config.type === 'disabled'}
			<p class="text-xs text-amber-600 dark:text-amber-400">
				请在"翻译服务配置"卡片中配置翻译服务
			</p>
		{/if}
	{/if}
</div>
