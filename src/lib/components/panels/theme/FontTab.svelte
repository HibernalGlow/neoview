<!--
  字体设置 Tab
  包含主字体和等宽字体的自定义设置
-->
<script lang="ts">
	import { Type, Plus, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import Switch from '$lib/components/ui/switch/switch.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import {
		applyFontSettings,
		broadcastFontSettings,
		type FontSettings
	} from '$lib/utils/fontManager';

	let fontSettings = $state<FontSettings>({
		enabled: false,
		fontFamilies: [],
		uiFontFamilies: [],
		monoFontFamilies: []
	});
	let newMainFont = $state('');
	let newMonoFont = $state('');

	// 初始化加载字体设置
	$effect(() => {
		const settings = settingsManager.getSettings().theme.customFont;
		fontSettings = { ...settings };
	});

	function saveFontSettings() {
		settingsManager.updateNestedSettings('theme', {
			customFont: { ...fontSettings }
		});
		applyFontSettings(fontSettings);
		broadcastFontSettings(fontSettings);
	}

	function toggleFontEnabled(enabled: boolean) {
		fontSettings.enabled = enabled;
		saveFontSettings();
	}

	function addMainFont() {
		if (newMainFont.trim() && !fontSettings.fontFamilies.includes(newMainFont.trim())) {
			fontSettings.fontFamilies = [...fontSettings.fontFamilies, newMainFont.trim()];
			newMainFont = '';
			saveFontSettings();
		}
	}

	function removeMainFont(font: string) {
		fontSettings.fontFamilies = fontSettings.fontFamilies.filter((f) => f !== font);
		saveFontSettings();
	}

	function addMonoFont() {
		if (newMonoFont.trim() && !fontSettings.monoFontFamilies.includes(newMonoFont.trim())) {
			fontSettings.monoFontFamilies = [...fontSettings.monoFontFamilies, newMonoFont.trim()];
			newMonoFont = '';
			saveFontSettings();
		}
	}

	function removeMonoFont(font: string) {
		fontSettings.monoFontFamilies = fontSettings.monoFontFamilies.filter((f) => f !== font);
		saveFontSettings();
	}
</script>

<div class="space-y-4">
	<!-- 启用自定义字体 -->
	<div class="flex items-center justify-between">
		<Label class="flex items-center gap-2 text-sm font-semibold">
			<Type class="h-4 w-4" />
			自定义字体
		</Label>
		<Switch checked={fontSettings.enabled} onCheckedChange={toggleFontEnabled} />
	</div>

	{#if fontSettings.enabled}
		<!-- 主字体 -->
		<div class="space-y-2">
			<Label class="text-muted-foreground text-xs">主字体（按优先级排序）</Label>
			<div class="flex gap-2">
				<Input
					bind:value={newMainFont}
					placeholder="输入字体名称，如 Microsoft YaHei"
					class="flex-1"
					onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && addMainFont()}
				/>
				<Button size="sm" variant="outline" onclick={addMainFont}>
					<Plus class="h-4 w-4" />
				</Button>
			</div>
			{#if fontSettings.fontFamilies.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each fontSettings.fontFamilies as font}
						<span class="bg-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs">
							{font}
							<button onclick={() => removeMainFont(font)} class="hover:text-destructive">
								<X class="h-3 w-3" />
							</button>
						</span>
					{/each}
				</div>
			{/if}
		</div>

		<!-- 等宽字体 -->
		<div class="space-y-2">
			<Label class="text-muted-foreground text-xs">等宽字体（代码等）</Label>
			<div class="flex gap-2">
				<Input
					bind:value={newMonoFont}
					placeholder="输入字体名称，如 Cascadia Code"
					class="flex-1"
					onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && addMonoFont()}
				/>
				<Button size="sm" variant="outline" onclick={addMonoFont}>
					<Plus class="h-4 w-4" />
				</Button>
			</div>
			{#if fontSettings.monoFontFamilies.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each fontSettings.monoFontFamilies as font}
						<span
							class="bg-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs"
						>
							{font}
							<button onclick={() => removeMonoFont(font)} class="hover:text-destructive">
								<X class="h-3 w-3" />
							</button>
						</span>
					{/each}
				</div>
			{/if}
		</div>

		<!-- 提示信息 -->
		<div class="border-primary/20 bg-primary/5 rounded-lg border p-3">
			<p class="text-muted-foreground text-xs">
				<strong>💡 提示:</strong> 字体按列表顺序优先使用，如果第一个字体不可用则使用下一个。
			</p>
		</div>
	{:else}
		<p class="text-muted-foreground text-sm">启用后可自定义应用使用的字体</p>
	{/if}
</div>
