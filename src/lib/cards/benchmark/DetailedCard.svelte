<script lang="ts">
/**
 * 详细对比测试卡片
 * 从 BenchmarkPanel 提取
 */
import { apiPost, apiGet } from '$lib/api/http-bridge';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FolderOpen, Play, Trash2 } from '@lucide/svelte';

interface DetailedBenchmarkResult {
	method: string;
	format: string;
	extract_ms: number;
	decode_ms: number;
	scale_ms: number;
	encode_ms: number;
	total_ms: number;
	success: boolean;
	error: string | null;
	input_size: number;
	output_size: number | null;
	original_dims: [number, number] | null;
	output_dims: [number, number] | null;
}

let selectedDetailedFile = $state<string>('');
let detailedResults = $state<DetailedBenchmarkResult[]>([]);
let isRunning = $state(false);

async function selectDetailedFile() {
	const file = await open({
		multiple: false,
		filters: [{ name: '压缩包', extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr'] }]
	});

	if (file && typeof file === 'string') {
		selectedDetailedFile = file;
	}
}

async function runDetailedBenchmark() {
	if (!selectedDetailedFile) return;
	isRunning = true;
	detailedResults = [];

	try {
		const results = await invoke<DetailedBenchmarkResult[]>('run_detailed_benchmark', {
			archivePath: selectedDetailedFile
		});
		detailedResults = results;
	} catch (e) {
		console.error('详细测试失败:', e);
	}

	isRunning = false;
}

function clearDetailedFile() {
	selectedDetailedFile = '';
	detailedResults = [];
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
</script>

<div class="space-y-2">
	<p class="text-[10px] text-muted-foreground">
		对比不同解码方法在各步骤的性能表现
	</p>
	<div class="flex gap-2">
		<Button onclick={selectDetailedFile} variant="outline" size="sm" class="flex-1 text-xs">
			<FolderOpen class="h-3 w-3 mr-1" />
			{selectedDetailedFile ? '已选择' : '选择压缩包'}
		</Button>
		<Button
			onclick={runDetailedBenchmark}
			disabled={isRunning || !selectedDetailedFile}
			size="sm"
			class="flex-1 text-xs"
		>
			<Play class="h-3 w-3 mr-1" />
			{isRunning ? '测试中...' : '详细对比'}
		</Button>
		{#if selectedDetailedFile}
			<Button onclick={clearDetailedFile} variant="ghost" size="sm" class="text-xs">
				<Trash2 class="h-3 w-3" />
			</Button>
		{/if}
	</div>
	
	{#if selectedDetailedFile}
		<div class="text-[10px] text-muted-foreground truncate">
			{selectedDetailedFile.split(/[/\\]/).pop()}
		</div>
	{/if}
	
	{#if detailedResults.length > 0}
		<div class="space-y-2 text-[10px] max-h-60 overflow-auto">
			{#each detailedResults as result}
				<div class="border rounded p-2 space-y-1">
					<div class="flex justify-between font-medium">
						<span class:text-blue-500={result.method.includes('WIC')}
							  class:text-green-500={result.method.includes('image')}
							  class:text-purple-500={result.method.includes('1920')}>
							{result.method}
						</span>
						<span class="font-mono {result.success ? 'text-green-600' : 'text-red-500'}">
							{result.success ? `${result.total_ms.toFixed(1)}ms` : '失败'}
						</span>
					</div>
					{#if result.success}
						<div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
							<div>提取: <span class="font-mono">{result.extract_ms.toFixed(1)}ms</span></div>
							<div>解码: <span class="font-mono">{result.decode_ms.toFixed(1)}ms</span></div>
							<div>缩放: <span class="font-mono">{result.scale_ms.toFixed(1)}ms</span></div>
							<div>编码: <span class="font-mono">{result.encode_ms.toFixed(1)}ms</span></div>
							{#if result.original_dims}
								<div>原尺寸: <span class="font-mono">{result.original_dims[0]}×{result.original_dims[1]}</span></div>
							{/if}
							{#if result.output_dims}
								<div>输出: <span class="font-mono">{result.output_dims[0]}×{result.output_dims[1]}</span></div>
							{/if}
						</div>
					{:else if result.error}
						<div class="text-red-500 text-[9px]">{result.error}</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
