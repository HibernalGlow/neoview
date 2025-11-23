<script lang="ts">
	import { Database, Download } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { settingsManager } from '$lib/stores/settingsManager.svelte';

	let includeNativeSettings = $state(true);
	let includeExtendedData = $state(true);
	let isExporting = $state(false);
	let lastMessage = $state('');

	async function handleExport() {
		if (!includeNativeSettings && !includeExtendedData) {
			lastMessage = '请至少选择一种要导出的数据类型。';
			return;
		}
		isExporting = true;
		lastMessage = '';
		try {
			await settingsManager.exportFullToFile({
				includeNativeSettings,
				includeExtendedData
			});
			lastMessage = '数据已导出为 JSON 文件。';
		} catch (error) {
			console.error('导出数据失败:', error);
			lastMessage = '导出失败，请检查控制台日志。';
		} finally {
			isExporting = false;
		}
	}
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Database class="h-5 w-5" />
			数据与备份
		</h3>
		<p class="text-muted-foreground text-sm">
			导出 NeoView 的完整配置数据，包括原生设置、自定义主题以及各个面板的持久化数据。
		</p>
	</div>

	<div class="space-y-4">
		<div class="space-y-2">
			<Label class="text-sm font-semibold">导出内容</Label>
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						class="rounded"
						bind:checked={includeNativeSettings}
					/>
					<span>原生设置（NeoViewSettings / neoview-settings）</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						class="rounded"
						bind:checked={includeExtendedData}
					/>
					<span>扩展数据与面板配置（快捷键、EMM、历史、书签、边栏布局、自定义主题等）</span>
				</label>
			</div>
			<p class="text-muted-foreground text-xs">
				建议在迁移或备份前开启两个选项，以获得完整的数据快照。
			</p>
		</div>

		<div class="space-y-3">
			<Label class="text-sm font-semibold">导出操作</Label>
			<div class="flex items-center gap-3">
				<Button
					class="gap-2"
					onclick={handleExport}
					disabled={isExporting || (!includeNativeSettings && !includeExtendedData)}
				>
					<Download class="h-4 w-4" />
					{isExporting ? '正在导出…' : '导出为 JSON'}
				</Button>
				{#if lastMessage}
					<p class="text-xs text-muted-foreground">{lastMessage}</p>
				{/if}
			</div>
			<p class="text-muted-foreground text-xs">
				导出结果会保存为 <code>neoview-data-时间戳.json</code> 文件，可在其他环境中手动拆分或用于诊断。
			</p>
		</div>
	</div>
</div>
