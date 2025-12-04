<script lang="ts">
/**
 * 延迟分析卡片
 * 从 BenchmarkPanel 提取
 */
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FolderOpen, Play, Trash2 } from '@lucide/svelte';

interface DetailedLatencyResult {
	imagePath: string;
	imageSize: number;
	dimensions: { width: number; height: number } | null;
	loadMethod: 'ipc' | 'tempfile';
	extractTime: number;
	ipcTransferTime: number;
	blobCreateTime: number;
	urlCreateTime: number;
	decodeTime: number;
	renderTime: number;
	totalTime: number;
	success: boolean;
	error: string | null;
}

let selectedLatencyArchive = $state<string>('');
let latencyResults = $state<DetailedLatencyResult[]>([]);
let isLatencyTesting = $state(false);
let latencyTestCount = $state<number>(5);

async function selectLatencyArchive() {
	const file = await open({
		multiple: false,
		filters: [{ name: '压缩包', extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr'] }]
	});
	if (file && typeof file === 'string') {
		selectedLatencyArchive = file;
	}
}

async function runLatencyTest() {
	if (!selectedLatencyArchive) return;
	
	isLatencyTesting = true;
	latencyResults = [];
	
	const loadMethods: Array<'ipc' | 'tempfile'> = ['ipc', 'tempfile'];
	
	try {
		const imageList = await invoke<string[]>('get_images_from_archive', {
			archivePath: selectedLatencyArchive
		});
		
		if (imageList.length === 0) {
			isLatencyTesting = false;
			return;
		}
		
		const testImages = imageList.slice(0, latencyTestCount);
		
		const testContainer = document.createElement('div');
		testContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;';
		document.body.appendChild(testContainer);
		
		for (const loadMethod of loadMethods) {
			for (const imagePath of testImages) {
				const result: DetailedLatencyResult = {
					imagePath,
					imageSize: 0,
					dimensions: null,
					loadMethod,
					extractTime: 0,
					ipcTransferTime: 0,
					blobCreateTime: 0,
					urlCreateTime: 0,
					decodeTime: 0,
					renderTime: 0,
					totalTime: 0,
					success: false,
					error: null
				};
				
				const totalStart = performance.now();
				
				try {
					let url: string;
					
					if (loadMethod === 'ipc') {
						const extractStart = performance.now();
						const imageData = await invoke<number[]>('load_image_from_archive', {
							archivePath: selectedLatencyArchive,
							filePath: imagePath
						});
						const extractEnd = performance.now();
						result.extractTime = extractEnd - extractStart;
						result.imageSize = imageData.length;
						
						const blobStart = performance.now();
						const uint8Array = new Uint8Array(imageData);
						const blob = new Blob([uint8Array]);
						const blobEnd = performance.now();
						result.blobCreateTime = blobEnd - blobStart;
						
						const urlStart = performance.now();
						url = URL.createObjectURL(blob);
						const urlEnd = performance.now();
						result.urlCreateTime = urlEnd - urlStart;
					} else {
						const extractStart = performance.now();
						const tempPath = await invoke<string>('extract_image_to_temp', {
							archivePath: selectedLatencyArchive,
							filePath: imagePath
						});
						const extractEnd = performance.now();
						result.extractTime = extractEnd - extractStart;
						
						const urlStart = performance.now();
						url = convertFileSrc(tempPath);
						const urlEnd = performance.now();
						result.urlCreateTime = urlEnd - urlStart;
					}
					
					await new Promise<void>((resolve, reject) => {
						testContainer.innerHTML = '';
						const img = document.createElement('img');
						
						const decodeStart = performance.now();
						
						img.onload = () => {
							const decodeEnd = performance.now();
							result.decodeTime = decodeEnd - decodeStart;
							result.dimensions = { width: img.naturalWidth, height: img.naturalHeight };
							
							if (loadMethod === 'tempfile' && result.imageSize === 0) {
								result.imageSize = img.naturalWidth * img.naturalHeight * 0.1;
							}
							
							const renderStart = performance.now();
							testContainer.appendChild(img);
							void testContainer.offsetHeight;
							const renderEnd = performance.now();
							result.renderTime = renderEnd - renderStart;
							
							if (loadMethod === 'ipc') {
								URL.revokeObjectURL(url);
							}
							resolve();
						};
						
						img.onerror = () => {
							if (loadMethod === 'ipc') {
								URL.revokeObjectURL(url);
							}
							reject(new Error('图片加载失败'));
						};
						
						img.src = url;
					});
					
					result.totalTime = performance.now() - totalStart;
					result.success = true;
					
				} catch (err) {
					result.totalTime = performance.now() - totalStart;
					result.error = String(err);
				}
				
				latencyResults = [...latencyResults, result];
			}
		}
		
		testContainer.remove();
	} catch (err) {
		console.error('延迟测试失败:', err);
	}
	
	isLatencyTesting = false;
}

function clearLatencyArchive() {
	selectedLatencyArchive = '';
	latencyResults = [];
}

function getLatencyStats() {
	if (latencyResults.length === 0) return null;
	
	const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
	
	const ipcResults = latencyResults.filter(r => r.success && r.loadMethod === 'ipc');
	const tempResults = latencyResults.filter(r => r.success && r.loadMethod === 'tempfile');
	
	if (ipcResults.length === 0 && tempResults.length === 0) return null;
	
	const calcStats = (results: DetailedLatencyResult[]) => ({
		count: results.length,
		avgExtract: avg(results.map(r => r.extractTime)),
		avgBlob: avg(results.map(r => r.blobCreateTime)),
		avgUrl: avg(results.map(r => r.urlCreateTime)),
		avgDecode: avg(results.map(r => r.decodeTime)),
		avgRender: avg(results.map(r => r.renderTime)),
		avgTotal: avg(results.map(r => r.totalTime)),
		avgSize: avg(results.map(r => r.imageSize))
	});
	
	const ipc = ipcResults.length > 0 ? calcStats(ipcResults) : null;
	const temp = tempResults.length > 0 ? calcStats(tempResults) : null;
	
	const speedup = (ipc && temp && ipc.avgTotal > 0) 
		? (ipc.avgTotal / temp.avgTotal).toFixed(1) 
		: null;
	
	return { ipc, temp, speedup };
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const latencyStats = $derived(getLatencyStats());
</script>

<div class="space-y-3">
	<p class="text-[10px] text-muted-foreground">
		分析图片加载全流程延迟，定位性能瓶颈（目标: &lt;16ms）
	</p>
	
	<!-- 选择压缩包 -->
	<div class="flex gap-2">
		<Button onclick={selectLatencyArchive} variant="outline" size="sm" class="flex-1 text-xs">
			<FolderOpen class="h-3 w-3 mr-1" />
			{selectedLatencyArchive ? '已选择' : '选择压缩包'}
		</Button>
		<Button
			onclick={runLatencyTest}
			disabled={isLatencyTesting || !selectedLatencyArchive}
			size="sm"
			class="flex-1 text-xs"
		>
			<Play class="h-3 w-3 mr-1" />
			{isLatencyTesting ? '测试中...' : '分析延迟'}
		</Button>
		{#if selectedLatencyArchive}
			<Button onclick={clearLatencyArchive} variant="ghost" size="sm" class="text-xs">
				<Trash2 class="h-3 w-3" />
			</Button>
		{/if}
	</div>
	
	{#if selectedLatencyArchive}
		<div class="text-[10px] text-muted-foreground truncate">
			{selectedLatencyArchive.split(/[/\\]/).pop()}
		</div>
	{/if}
	
	<!-- 测试数量 -->
	<div class="flex items-center gap-2 text-[10px]">
		<span class="text-muted-foreground">测试图片数:</span>
		<div class="flex gap-1">
			{#each [3, 5, 10, 20] as count}
				<button
					type="button"
					class="px-2 py-0.5 rounded {latencyTestCount === count ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}"
					onclick={() => latencyTestCount = count}
				>
					{count}
				</button>
			{/each}
		</div>
	</div>
	
	<!-- 结果展示 -->
	{#if latencyStats}
		<div class="border rounded p-2 space-y-2 text-[10px]">
			<div class="font-medium">延迟分析结果</div>
			
			{#if latencyStats.ipc}
				<div class="space-y-1">
					<div class="font-medium text-blue-500">IPC 模式</div>
					<div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
						<div>提取: <span class="font-mono text-foreground">{latencyStats.ipc.avgExtract.toFixed(1)}ms</span></div>
						<div>Blob: <span class="font-mono text-foreground">{latencyStats.ipc.avgBlob.toFixed(1)}ms</span></div>
						<div>URL: <span class="font-mono text-foreground">{latencyStats.ipc.avgUrl.toFixed(2)}ms</span></div>
						<div>解码: <span class="font-mono text-foreground">{latencyStats.ipc.avgDecode.toFixed(1)}ms</span></div>
						<div>渲染: <span class="font-mono text-foreground">{latencyStats.ipc.avgRender.toFixed(2)}ms</span></div>
						<div>总计: <span class="font-mono text-primary font-medium">{latencyStats.ipc.avgTotal.toFixed(1)}ms</span></div>
					</div>
				</div>
			{/if}
			
			{#if latencyStats.temp}
				<div class="space-y-1 border-t pt-2">
					<div class="font-medium text-green-500">TempFile 模式</div>
					<div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
						<div>提取: <span class="font-mono text-foreground">{latencyStats.temp.avgExtract.toFixed(1)}ms</span></div>
						<div>URL: <span class="font-mono text-foreground">{latencyStats.temp.avgUrl.toFixed(2)}ms</span></div>
						<div>解码: <span class="font-mono text-foreground">{latencyStats.temp.avgDecode.toFixed(1)}ms</span></div>
						<div>渲染: <span class="font-mono text-foreground">{latencyStats.temp.avgRender.toFixed(2)}ms</span></div>
						<div class="col-span-2">总计: <span class="font-mono text-primary font-medium">{latencyStats.temp.avgTotal.toFixed(1)}ms</span></div>
					</div>
				</div>
			{/if}
			
			{#if latencyStats.speedup}
				<div class="border-t pt-2 text-center">
					<span class="text-muted-foreground">TempFile 比 IPC 快 </span>
					<span class="font-mono text-green-500 font-medium">{latencyStats.speedup}x</span>
				</div>
			{/if}
		</div>
	{/if}
</div>
