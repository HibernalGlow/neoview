<script lang="ts">
/**
 * 启动配置面板
 * 用于显示和编辑启动配置文件
 */
import { onMount } from 'svelte';
import { Database, Download, Upload, RefreshCcw, ChevronDown } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Label } from '$lib/components/ui/label';
import { getStartupConfig, saveStartupConfig, type StartupConfig } from '$lib/config/startupConfig';
import { appDataDir } from '@tauri-apps/api/path';
import { settingsManager } from '$lib/settings/settingsManager';

let configPath = $state('');
let configJson = $state('{}');
let importEl: HTMLInputElement | null = $state(null);
let message = $state('');
let isExpanded = $state(false);

onMount(async () => {
	try {
		const dataDir = await appDataDir();
		configPath = `${dataDir}startup_config.json`;
		await refresh();
	} catch (err) {
		console.error('获取应用数据目录失败:', err);
	}
});

async function refresh() {
	try {
		const config = await getStartupConfig();
		
		// 如果 cacheDir 为空，从 settingsManager 获取 thumbnailDirectory
		if (!config.cacheDir) {
			const settings = settingsManager.getSettings();
			const thumbnailDir = settings.system?.thumbnailDirectory?.trim();
			if (thumbnailDir) {
				config.cacheDir = thumbnailDir;
				config.cacheUpscaleDir = `${thumbnailDir}\\pyo3-upscale`;
			}
		}
		
		configJson = JSON.stringify(config, null, 2);
		message = '';
	} catch (err) {
		console.error('刷新启动配置失败:', err);
		message = '刷新失败';
	}
}

async function save() {
	try {
		const config = JSON.parse(configJson) as StartupConfig;
		await saveStartupConfig(config);
		message = '✅ 已保存';
	} catch (err) {
		console.error('保存启动配置失败:', err);
		message = '❌ 保存失败: ' + (err instanceof Error ? err.message : String(err));
	}
}

async function exportConfig() {
	try {
		const config = await getStartupConfig();
		const json = JSON.stringify(config, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `neoview-startup-config-${Date.now()}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		message = '✅ 已导出';
	} catch (err) {
		console.error('导出启动配置失败:', err);
		message = '❌ 导出失败';
	}
}

async function handleImport(e: Event) {
	const file = (e.currentTarget as HTMLInputElement).files?.[0];
	if (!file) return;
	try {
		const text = await file.text();
		const config = JSON.parse(text) as StartupConfig;
		await saveStartupConfig(config);
		await refresh();
		message = '✅ 已导入';
	} catch (err) {
		console.error('导入启动配置失败:', err);
		message = '❌ 导入失败: ' + (err instanceof Error ? err.message : String(err));
	}
}
</script>

<div class="space-y-4 border-t pt-4">
	<div class="flex items-center gap-2">
		<Database class="h-4 w-4 text-muted-foreground" />
		<Label class="text-sm font-semibold">启动配置</Label>
	</div>
	
	<p class="text-xs text-muted-foreground">
		启动配置文件用于存储缓存目录、超分条件等启动时需要的设置。
	</p>
	
	<div class="space-y-2">
		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">配置文件:</span>
			<code class="bg-muted px-1 py-0.5 rounded text-[10px] truncate max-w-[300px]" title={configPath}>
				{configPath}
			</code>
			<Button variant="ghost" size="sm" class="h-6 px-2" onclick={refresh}>
				<RefreshCcw class="h-3 w-3" />
			</Button>
		</div>
		
		<details class="group" bind:open={isExpanded}>
			<summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
				<ChevronDown class="h-3 w-3 group-open:rotate-180 transition-transform" />
				查看/编辑 JSON
			</summary>
			<div class="mt-2 space-y-2">
				<textarea
					class="w-full h-48 text-[10px] font-mono bg-muted rounded p-2 resize-y border"
					bind:value={configJson}
				></textarea>
				<div class="flex gap-2">
					<Button variant="outline" size="sm" class="text-xs" onclick={save}>
						保存
					</Button>
					<Button variant="ghost" size="sm" class="text-xs" onclick={refresh}>
						刷新
					</Button>
				</div>
			</div>
		</details>
	</div>
	
	<div class="flex gap-2">
		<Button variant="outline" size="sm" class="gap-1" onclick={exportConfig}>
			<Download class="h-3 w-3" />
			导出
		</Button>
		<Button variant="outline" size="sm" class="gap-1" onclick={() => importEl?.click()}>
			<Upload class="h-3 w-3" />
			导入
		</Button>
		<input
			bind:this={importEl}
			type="file"
			class="hidden"
			accept="application/json"
			onchange={handleImport}
		/>
	</div>
	
	{#if message}
		<p class="text-xs text-muted-foreground">{message}</p>
	{/if}
</div>
