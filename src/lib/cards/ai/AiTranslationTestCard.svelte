<script lang="ts">
/**
 * AI 翻译测试卡片
 * 允许用户手动测试翻译功能
 */
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import { aiTranslationStore } from '$lib/stores/ai/translationStore.svelte';
import { translateText, containsJapanese, detectLanguage } from '$lib/services/translationService';
import { Languages, ArrowRight, Loader2, CheckCircle, XCircle, Info } from '@lucide/svelte';

let inputText = $state('');
let translatedText = $state('');
let isTranslating = $state(false);
let error = $state<string | null>(null);
let detectedLang = $state<string | null>(null);
let hasJapanese = $state(false);

// 检测语言
$effect(() => {
	if (inputText.trim()) {
		hasJapanese = containsJapanese(inputText);
		detectedLang = detectLanguage(inputText);
	} else {
		hasJapanese = false;
		detectedLang = null;
	}
});

async function handleTranslate() {
	if (!inputText.trim()) return;

	isTranslating = true;
	error = null;
	translatedText = '';

	try {
		const result = await translateText(inputText.trim());
		if (result.success && result.translated) {
			translatedText = result.translated;
		} else {
			error = result.error || '翻译失败';
		}
	} catch (e) {
		error = `翻译出错: ${e}`;
	} finally {
		isTranslating = false;
	}
}

function handleClear() {
	inputText = '';
	translatedText = '';
	error = null;
	detectedLang = null;
}

function getLangLabel(lang: string | null): string {
	switch (lang) {
		case 'ja': return '日语';
		case 'zh': return '中文';
		case 'en': return '英语';
		case 'unknown': return '未知';
		default: return '未检测';
	}
}
</script>

<div class="space-y-4">
	<!-- 输入区域 -->
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<Label class="text-xs">输入文本</Label>
			{#if detectedLang}
				<span class="flex items-center gap-1 text-xs text-muted-foreground">
					<Info class="h-3 w-3" />
					检测: {getLangLabel(detectedLang)}
					{#if hasJapanese}
						<span class="text-amber-500">(含日文)</span>
					{/if}
				</span>
			{/if}
		</div>
		<Input
			bind:value={inputText}
			placeholder="输入要翻译的文本，如：【かぐや様】四宮かぐや"
			class="text-sm"
		/>
	</div>

	<!-- 翻译按钮 -->
	<div class="flex gap-2">
		<Button
			variant="default"
			size="sm"
			onclick={handleTranslate}
			disabled={!inputText.trim() || isTranslating}
			class="flex-1"
		>
			{#if isTranslating}
				<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				翻译中...
			{:else}
				<Languages class="mr-2 h-4 w-4" />
				翻译
			{/if}
		</Button>
		<Button
			variant="outline"
			size="sm"
			onclick={handleClear}
			disabled={!inputText && !translatedText}
		>
			清空
		</Button>
	</div>

	<!-- 结果区域 -->
	{#if translatedText || error}
		<div class="space-y-2">
			<Label class="text-xs">翻译结果</Label>
			{#if error}
				<div class="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
					<XCircle class="mt-0.5 h-4 w-4 shrink-0" />
					<span>{error}</span>
				</div>
			{:else if translatedText}
				<div class="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
					<CheckCircle class="mt-0.5 h-4 w-4 shrink-0" />
					<span class="break-all">{translatedText}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- 示例 -->
	<div class="space-y-1">
		<Label class="text-xs text-muted-foreground">快速测试示例</Label>
		<div class="flex flex-wrap gap-1">
			{#each ['こんにちは', '【東方】霊夢', 'お兄ちゃん大好き', '魔法少女まどか'] as example}
				<Button
					variant="outline"
					size="sm"
					class="h-6 px-2 text-xs"
					onclick={() => {
						inputText = example;
					}}
				>
					{example}
				</Button>
			{/each}
		</div>
	</div>
</div>
