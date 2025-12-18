<script lang="ts">
/**
 * 文件选择卡片
 * 从 BenchmarkPanel 提取
 */
import { invoke } from '$lib/api/adapter';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FolderOpen, Play, Trash2 } from '@lucide/svelte';

interface BenchmarkReport {
	file_path: string;
	file_size: number;
	results: Array<{
		method: string;
		format: string;
		duration_ms: number;
		success: boolean;
		error: string | null;
		image_size: [number, number] | null;
		output_size: number | null;
	}>;
}

let selectedFiles = $state<string[]>([]);
let reports = $state<BenchmarkReport[]>([]);
let isRunning = $state(false);

async function selectFiles() {
	const files = await open({
		multiple: true,
		filters: [{
			name: '图像文件',
			extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'jxl', 'heic', 'heif']
		}]
	});

	if (files) {
		selectedFiles = Array.isArray(files) ? files : [files];
	}
}

async function runBenchmark() {
	if (selectedFiles.length === 0) return;

	isRunning = true;
	reports = [];

	try {
		const results = await invoke<BenchmarkReport[]>('run_batch_benchmark', {
			filePaths: selectedFiles
		});
		reports = results;
	} catch (err) {
		console.error('基准测试失败:', err);
	} finally {
		isRunning = false;
	}
}

function clearFiles() {
	selectedFiles = [];
	reports = [];
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
</script>

<div class="space-y-2">
	<div class="flex gap-2">
		<Button onclick={selectFiles} variant="outline" size="sm" class="flex-1 text-xs">
			<FolderOpen class="h-3 w-3 mr-1" />
			选择图像 ({selectedFiles.length})
		</Button>
		<Button
			onclick={runBenchmark}
			disabled={isRunning || selectedFiles.length === 0}
			size="sm"
			class="flex-1 text-xs"
		>
			<Play class="h-3 w-3 mr-1" />
			{isRunning ? '测试中...' : '开始测试'}
		</Button>
		{#if selectedFiles.length > 0}
			<Button onclick={clearFiles} variant="ghost" size="sm" class="text-xs">
				<Trash2 class="h-3 w-3" />
			</Button>
		{/if}
	</div>

	{#if selectedFiles.length > 0}
		<div class="text-[10px] text-muted-foreground max-h-16 overflow-auto space-y-0.5">
			{#each selectedFiles as file}
				<div class="truncate">{file.split(/[/\\]/).pop()}</div>
			{/each}
		</div>
	{/if}

	<!-- 测试结果 -->
	{#if reports.length > 0}
		<div class="border-t pt-2 mt-2 space-y-2 text-[10px]">
			<div class="font-medium">测试结果</div>
			{#each reports as report}
				<div class="border rounded p-2 space-y-1">
					<div class="flex justify-between font-medium">
						<span class="truncate" title={report.file_path}>
							{report.file_path.split(/[/\\]/).pop()}
						</span>
						<span class="text-muted-foreground">{formatFileSize(report.file_size)}</span>
					</div>
					{#each report.results as result}
						<div class="flex justify-between items-center text-muted-foreground">
							<span class:text-blue-500={result.method.includes('WIC')}
								  class:text-green-500={result.method.includes('image')}>
								{result.method}
							</span>
							<span class="flex gap-2">
								{#if result.output_size}
									<span>{formatFileSize(result.output_size)}</span>
								{/if}
								{#if result.success}
									<span class="text-green-600 font-mono">{result.duration_ms.toFixed(1)}ms</span>
								{:else}
									<span class="text-red-500">失败</span>
								{/if}
							</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
