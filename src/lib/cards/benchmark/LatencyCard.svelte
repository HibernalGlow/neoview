<script lang="ts">
/**
 * 延迟分析卡片
 * 从 BenchmarkPanel 提取
 * 新增: WIC + LZ4 压缩传输测试
 */
import { apiPost, apiGet, getFileUrl as convertFileSrc } from '$lib/api/http-bridge';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FolderOpen, Play, Trash2, Zap } from '@lucide/svelte';

interface DetailedLatencyResult {
	imagePath: string;
	imageSize: number;
	dimensions: { width: number; height: number } | null;
	loadMethod: 'ipc' | 'tempfile' | 'wic-lz4';
	extractTime: number;
	ipcTransferTime: number;
	blobCreateTime: number;
	urlCreateTime: number;
	decodeTime: number;
	renderTime: number;
	totalTime: number;
	success: boolean;
	error: string | null;
	// WIC+LZ4 特有字段
	wicDecodeTime?: number;
	lz4CompressTime?: number;
	lz4DecompressTime?: number;
	originalSize?: number;
	compressedSize?: number;
	compressionRatio?: number;
}

interface WicLz4Result {
	width: number;
	height: number;
	original_size: number;
	compressed_size: number;
	compression_ratio: number;
	wic_decode_ms: number;
	lz4_compress_ms: number;
	total_ms: number;
	success: boolean;
	error: string | null;
	compressed_data: number[];
}

let selectedLatencyArchive = $state<string>('');
let latencyResults = $state<DetailedLatencyResult[]>([]);
let isLatencyTesting = $state(false);
let latencyTestCount = $state<number>(5);
let includeWicLz4 = $state(true);

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
		
		// WIC + LZ4 测试（如果启用）
		if (includeWicLz4) {
			for (const imagePath of testImages) {
				const result: DetailedLatencyResult = {
					imagePath,
					imageSize: 0,
					dimensions: null,
					loadMethod: 'wic-lz4',
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
					// 调用后端 WIC + LZ4 命令
					const wicResult = await invoke<WicLz4Result>('load_image_wic_lz4_cached', {
						archivePath: selectedLatencyArchive,
						filePath: imagePath
					});
					
					result.wicDecodeTime = wicResult.wic_decode_ms;
					result.lz4CompressTime = wicResult.lz4_compress_ms;
					result.originalSize = wicResult.original_size;
					result.compressedSize = wicResult.compressed_size;
					result.compressionRatio = wicResult.compression_ratio;
					result.imageSize = wicResult.compressed_size;
					result.dimensions = { width: wicResult.width, height: wicResult.height };
					
					// 前端解压 LZ4
					const decompressStart = performance.now();
					const compressedData = new Uint8Array(wicResult.compressed_data);
					// 简单的 LZ4 解压 (使用 lz4js 或手动实现)
					// 由于没有 lz4js，我们测量 IPC 传输时间作为替代
					const bgraData = await decompressLz4(compressedData, wicResult.original_size);
					const decompressEnd = performance.now();
					result.lz4DecompressTime = decompressEnd - decompressStart;
					
					// 从 BGRA 创建 ImageData 并渲染到 canvas
					const renderStart = performance.now();
					const canvas = document.createElement('canvas');
					canvas.width = wicResult.width;
					canvas.height = wicResult.height;
					const ctx = canvas.getContext('2d');
					if (ctx && bgraData) {
						// BGRA -> RGBA
						const rgbaData = new Uint8ClampedArray(bgraData.length);
						for (let i = 0; i < bgraData.length; i += 4) {
							rgbaData[i] = bgraData[i + 2];     // R <- B
							rgbaData[i + 1] = bgraData[i + 1]; // G
							rgbaData[i + 2] = bgraData[i];     // B <- R
							rgbaData[i + 3] = bgraData[i + 3]; // A
						}
						const imageData = new ImageData(rgbaData, wicResult.width, wicResult.height);
						ctx.putImageData(imageData, 0, 0);
					}
					const renderEnd = performance.now();
					result.renderTime = renderEnd - renderStart;
					
					result.totalTime = performance.now() - totalStart;
					result.success = true;
					
				} catch (err) {
					result.totalTime = performance.now() - totalStart;
					result.error = String(err);
				}
				
				latencyResults = [...latencyResults, result];
			}
		}
		
	} catch (err) {
		console.error('延迟测试失败:', err);
	}
	
	isLatencyTesting = false;
}

/**
 * 简单的 LZ4 解压实现
 * lz4_flex 使用 prepend_size 格式：前4字节是解压后大小（小端序）
 */
async function decompressLz4(compressed: Uint8Array, expectedSize: number): Promise<Uint8Array> {
	// 跳过前4字节的大小头
	const data = compressed.slice(4);
	const output = new Uint8Array(expectedSize);
	
	let srcIdx = 0;
	let dstIdx = 0;
	
	while (srcIdx < data.length && dstIdx < expectedSize) {
		const token = data[srcIdx++];
		
		// 字面量长度
		let literalLength = (token >> 4) & 0x0F;
		if (literalLength === 15) {
			let byte;
			do {
				byte = data[srcIdx++];
				literalLength += byte;
			} while (byte === 255);
		}
		
		// 复制字面量
		for (let i = 0; i < literalLength && dstIdx < expectedSize; i++) {
			output[dstIdx++] = data[srcIdx++];
		}
		
		if (srcIdx >= data.length) break;
		
		// 匹配偏移（2字节小端序）
		const offset = data[srcIdx++] | (data[srcIdx++] << 8);
		if (offset === 0) break;
		
		// 匹配长度
		let matchLength = (token & 0x0F) + 4;
		if ((token & 0x0F) === 15) {
			let byte;
			do {
				byte = data[srcIdx++];
				matchLength += byte;
			} while (byte === 255);
		}
		
		// 复制匹配数据
		const matchStart = dstIdx - offset;
		for (let i = 0; i < matchLength && dstIdx < expectedSize; i++) {
			output[dstIdx] = output[matchStart + i];
			dstIdx++;
		}
	}
	
	return output;
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
	const wicLz4Results = latencyResults.filter(r => r.success && r.loadMethod === 'wic-lz4');
	
	if (ipcResults.length === 0 && tempResults.length === 0 && wicLz4Results.length === 0) return null;
	
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
	
	const calcWicLz4Stats = (results: DetailedLatencyResult[]) => ({
		count: results.length,
		avgWicDecode: avg(results.map(r => r.wicDecodeTime ?? 0)),
		avgLz4Compress: avg(results.map(r => r.lz4CompressTime ?? 0)),
		avgLz4Decompress: avg(results.map(r => r.lz4DecompressTime ?? 0)),
		avgRender: avg(results.map(r => r.renderTime)),
		avgTotal: avg(results.map(r => r.totalTime)),
		avgOriginalSize: avg(results.map(r => r.originalSize ?? 0)),
		avgCompressedSize: avg(results.map(r => r.compressedSize ?? 0)),
		avgCompressionRatio: avg(results.map(r => r.compressionRatio ?? 1))
	});
	
	const ipc = ipcResults.length > 0 ? calcStats(ipcResults) : null;
	const temp = tempResults.length > 0 ? calcStats(tempResults) : null;
	const wicLz4 = wicLz4Results.length > 0 ? calcWicLz4Stats(wicLz4Results) : null;
	
	const speedup = (ipc && temp && ipc.avgTotal > 0) 
		? (ipc.avgTotal / temp.avgTotal).toFixed(1) 
		: null;
	
	return { ipc, temp, wicLz4, speedup };
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
	
	<!-- 测试设置 -->
	<div class="flex items-center gap-2 text-[10px] flex-wrap">
		<span class="text-muted-foreground">测试数:</span>
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
		<label class="flex items-center gap-1 ml-2 cursor-pointer">
			<input type="checkbox" bind:checked={includeWicLz4} class="w-3 h-3" />
			<Zap class="h-3 w-3 text-yellow-500" />
			<span>WIC+LZ4</span>
		</label>
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
			
			{#if latencyStats.wicLz4}
				<div class="space-y-1 border-t pt-2">
					<div class="font-medium text-yellow-500 flex items-center gap-1">
						<Zap class="h-3 w-3" />
						WIC + LZ4 模式
					</div>
					<div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
						<div>WIC解码: <span class="font-mono text-foreground">{latencyStats.wicLz4.avgWicDecode.toFixed(1)}ms</span></div>
						<div>LZ4压缩: <span class="font-mono text-foreground">{latencyStats.wicLz4.avgLz4Compress.toFixed(1)}ms</span></div>
						<div>LZ4解压: <span class="font-mono text-foreground">{latencyStats.wicLz4.avgLz4Decompress.toFixed(1)}ms</span></div>
						<div>渲染: <span class="font-mono text-foreground">{latencyStats.wicLz4.avgRender.toFixed(1)}ms</span></div>
						<div>压缩率: <span class="font-mono text-foreground">{(latencyStats.wicLz4.avgCompressionRatio * 100).toFixed(0)}%</span></div>
						<div>总计: <span class="font-mono text-primary font-medium">{latencyStats.wicLz4.avgTotal.toFixed(1)}ms</span></div>
					</div>
					<div class="text-muted-foreground">
						原始: {formatFileSize(latencyStats.wicLz4.avgOriginalSize)} → 
						压缩: {formatFileSize(latencyStats.wicLz4.avgCompressedSize)}
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
