<script lang="ts">
/**
 * 真实场景测试卡片
 * 从 BenchmarkPanel 提取
 */
import { apiPost, apiGet } from '$lib/api/http-bridge';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FolderOpen, Play } from '@lucide/svelte';

interface RealWorldTestResult {
	viewport_size: number;
	total_files: number;
	total_time_ms: number;
	avg_time_ms: number;
	cached_count: number;
	generated_count: number;
	failed_count: number;
	throughput: number;
}

let selectedRealWorldFolder = $state<string>('');
let realWorldResult = $state<RealWorldTestResult | null>(null);
let viewportSize = $state<number>(20);
let isRunning = $state(false);

async function selectRealWorldFolder() {
	const folder = await open({
		multiple: false,
		directory: true
	});

	if (folder && typeof folder === 'string') {
		selectedRealWorldFolder = folder;
	}
}

async function runRealWorldTest() {
	if (!selectedRealWorldFolder) return;

	isRunning = true;
	realWorldResult = null;

	try {
		const result = await invoke<RealWorldTestResult>('run_realworld_benchmark', {
			folderPath: selectedRealWorldFolder,
			viewportSize: viewportSize
		});
		realWorldResult = result;
	} catch (err) {
		console.error('真实场景测试失败:', err);
	} finally {
		isRunning = false;
	}
}
</script>

<div class="space-y-2">
	<p class="text-[10px] text-muted-foreground">
		模拟虚拟列表的可见区域，测试缩略图加载性能
	</p>
	<div class="flex gap-2">
		<Button onclick={selectRealWorldFolder} variant="outline" size="sm" class="flex-1 text-xs">
			<FolderOpen class="h-3 w-3 mr-1" />
			{selectedRealWorldFolder ? '重选' : '选择文件夹'}
		</Button>
		<Button
			onclick={runRealWorldTest}
			disabled={isRunning || !selectedRealWorldFolder}
			size="sm"
			class="flex-1 text-xs"
		>
			<Play class="h-3 w-3 mr-1" />
			{isRunning ? '测试中...' : '开始测试'}
		</Button>
	</div>
	{#if selectedRealWorldFolder}
		<div class="text-[10px] text-muted-foreground truncate" title={selectedRealWorldFolder}>
			📁 {selectedRealWorldFolder}
		</div>
	{/if}
	<div class="flex items-center gap-2">
		<span class="text-[10px] text-muted-foreground">可见区域大小:</span>
		<div class="flex gap-1">
			{#each [10, 20, 50, 100] as size}
				<button
					type="button"
					class="px-2 py-0.5 rounded text-[10px] {viewportSize === size ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}"
					onclick={() => viewportSize = size}
				>
					{size}
				</button>
			{/each}
		</div>
	</div>
	{#if realWorldResult}
		<div class="border rounded p-2 space-y-1 text-[10px]">
			<div class="grid grid-cols-2 gap-x-4 gap-y-1">
				<div>文件数: <span class="font-mono">{realWorldResult.total_files}</span></div>
				<div>可见区域: <span class="font-mono">{realWorldResult.viewport_size}</span></div>
				<div>总用时: <span class="font-mono text-blue-500">{realWorldResult.total_time_ms.toFixed(0)}ms</span></div>
				<div>平均: <span class="font-mono text-green-500">{realWorldResult.avg_time_ms.toFixed(1)}ms</span></div>
				<div>缓存命中: <span class="font-mono text-purple-500">{realWorldResult.cached_count}</span></div>
				<div>新生成: <span class="font-mono text-orange-500">{realWorldResult.generated_count}</span></div>
				<div>失败: <span class="font-mono text-red-500">{realWorldResult.failed_count}</span></div>
				<div>吞吐量: <span class="font-mono text-cyan-500">{realWorldResult.throughput.toFixed(1)}/s</span></div>
			</div>
		</div>
	{/if}
</div>
