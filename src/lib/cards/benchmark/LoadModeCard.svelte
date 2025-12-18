<script lang="ts">
/**
 * 加载模式测试卡片
 * 从 BenchmarkPanel 提取
 */
import { invoke } from '$lib/api/adapter';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FolderOpen, Play, Trash2 } from '@lucide/svelte';

interface LoadModeTestResult {
	mode: string;
	format: string;
	input_size: number;
	output_size: number;
	decode_ms: number;
	width: number | null;
	height: number | null;
	success: boolean;
	error: string | null;
}

let selectedLoadModeFile = $state<string>('');
let loadModeResults = $state<LoadModeTestResult[]>([]);
let isRunning = $state(false);

async function selectLoadModeFile() {
	const file = await open({
		multiple: false,
		filters: [{ name: '图像', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'jxl', 'gif', 'bmp'] }]
	});

	if (file && typeof file === 'string') {
		selectedLoadModeFile = file;
	}
}

async function runLoadModeTest() {
	if (!selectedLoadModeFile) return;

	isRunning = true;
	loadModeResults = [];

	try {
		// 后端测试
		const backendResults = await invoke<LoadModeTestResult[]>('test_load_modes', {
			filePath: selectedLoadModeFile
		});

		// 前端测试
		const frontendResults: LoadModeTestResult[] = [];

		// Raw 模式测试
		try {
			const startTotal = performance.now();
			const rawData = await invoke<number[]>('load_image', { path: selectedLoadModeFile });
			
			const blob = new Blob([new Uint8Array(rawData)]);
			const url = URL.createObjectURL(blob);
			
			const imgSize = await new Promise<{w: number, h: number}>((resolve, reject) => {
				const img = new Image();
				img.onload = () => {
					const size = {w: img.naturalWidth, h: img.naturalHeight};
					URL.revokeObjectURL(url);
					resolve(size);
				};
				img.onerror = () => reject(new Error('图片加载失败'));
				img.src = url;
			});
			const totalTime = performance.now() - startTotal;

			frontendResults.push({
				mode: 'Raw→Blob→img (完整)',
				format: selectedLoadModeFile.split('.').pop() || '',
				input_size: rawData.length,
				output_size: rawData.length,
				decode_ms: totalTime,
				width: imgSize.w,
				height: imgSize.h,
				success: true,
				error: null
			});
		} catch (e) {
			frontendResults.push({
				mode: 'Raw→Blob→img (完整)',
				format: selectedLoadModeFile.split('.').pop() || '',
				input_size: 0,
				output_size: 0,
				decode_ms: 0,
				width: null,
				height: null,
				success: false,
				error: String(e)
			});
		}

		loadModeResults = [...backendResults, ...frontendResults];
	} catch (err) {
		console.error('加载模式测试失败:', err);
	} finally {
		isRunning = false;
	}
}

function clearLoadModeFile() {
	selectedLoadModeFile = '';
	loadModeResults = [];
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
</script>

<div class="space-y-2">
	<p class="text-[10px] text-muted-foreground">
		对比 Raw/Bitmap/缩放 等加载模式性能
	</p>
	<div class="flex gap-2">
		<Button onclick={selectLoadModeFile} variant="outline" size="sm" class="flex-1 text-xs">
			<FolderOpen class="h-3 w-3 mr-1" />
			{selectedLoadModeFile ? '已选择' : '选择图像'}
		</Button>
		<Button
			onclick={runLoadModeTest}
			disabled={isRunning || !selectedLoadModeFile}
			size="sm"
			class="flex-1 text-xs"
		>
			<Play class="h-3 w-3 mr-1" />
			{isRunning ? '测试中...' : '测试加载'}
		</Button>
		{#if selectedLoadModeFile}
			<Button onclick={clearLoadModeFile} variant="ghost" size="sm" class="text-xs">
				<Trash2 class="h-3 w-3" />
			</Button>
		{/if}
	</div>
	
	{#if selectedLoadModeFile}
		<div class="text-[10px] text-muted-foreground truncate">
			{selectedLoadModeFile.split(/[/\\]/).pop()}
		</div>
	{/if}
	
	{#if loadModeResults.length > 0}
		<div class="space-y-2 text-[10px]">
			{#each loadModeResults as result}
				<div class="border rounded p-2 space-y-1">
					<div class="flex justify-between font-medium">
						<span class:text-blue-500={result.mode === 'Raw'}
							  class:text-green-500={result.mode === 'Bitmap'}
							  class:text-purple-500={result.mode.includes('1920')}>
							{result.mode}
						</span>
						<span class="font-mono {result.success ? 'text-green-600' : 'text-red-500'}">
							{result.success ? `${result.decode_ms.toFixed(1)}ms` : '失败'}
						</span>
					</div>
					{#if result.success}
						<div class="flex justify-between text-muted-foreground mt-1">
							<span>输入: {formatFileSize(result.input_size)}</span>
							<span>输出: {formatFileSize(result.output_size)}</span>
						</div>
						{#if result.width && result.height}
							<div class="text-muted-foreground">
								尺寸: {result.width}×{result.height}
							</div>
						{/if}
					{:else if result.error}
						<div class="text-red-500 text-[9px]">{result.error}</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
