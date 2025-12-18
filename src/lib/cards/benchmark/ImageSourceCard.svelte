<script lang="ts">
/**
 * 图像源模式基准测试卡片
 * 对比 Blob 模式和 ConvertFileSrc 模式的加载性能
 * 支持压缩包和普通文件，模拟真实场景，包含缓存测试
 */
import { apiPost, apiGet, getFileUrl as convertFileSrc } from '$lib/api/http-bridge';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FolderOpen, Play, Trash2, Copy, Check, RotateCcw, Archive } from '@lucide/svelte';

// 测试结果类型
interface TimingDetail {
	loadData: number;      // 后端加载数据时间
	blobCreate: number;    // Blob 创建时间
	urlCreate: number;     // URL 创建时间
	imgDecode: number;     // 图片解码时间
	total: number;         // 总时间
}

interface TestResult {
	mode: 'blob' | 'convertFileSrc';
	fileName: string;
	fileSize: number;
	dimensions: { width: number; height: number } | null;
	timing: TimingDetail;
	cached: boolean;       // 是否为缓存命中
	success: boolean;
	error: string | null;
}

interface TestSummary {
	mode: 'blob' | 'convertFileSrc';
	count: number;
	avgTotal: number;
	avgLoadData: number;
	avgBlobCreate: number;
	avgUrlCreate: number;
	avgImgDecode: number;
	minTotal: number;
	maxTotal: number;
	cacheHitRate: number;
}

// 图片信息（用于压缩包）
interface ImageInfo {
	archivePath: string;
	innerPath: string;
	displayName: string;
}

// 简单的内存缓存（模拟真实缓存场景）
class SimpleCache {
	private cache = new Map<string, { url: string; size: number }>();
	private maxSize = 100 * 1024 * 1024; // 100MB
	private currentSize = 0;

	has(key: string): boolean {
		return this.cache.has(key);
	}

	get(key: string): string | undefined {
		return this.cache.get(key)?.url;
	}

	set(key: string, url: string, size: number): void {
		// 简单 LRU：超出则清空
		if (this.currentSize + size > this.maxSize) {
			this.clear();
		}
		this.cache.set(key, { url, size });
		this.currentSize += size;
	}

	clear(): void {
		for (const [, item] of this.cache) {
			URL.revokeObjectURL(item.url);
		}
		this.cache.clear();
		this.currentSize = 0;
	}

	get size(): number {
		return this.cache.size;
	}
}

// 状态
let selectedArchive = $state<string>('');
let archiveImages = $state<ImageInfo[]>([]);
let results = $state<TestResult[]>([]);
let summary = $state<TestSummary[]>([]);
let isRunning = $state(false);
let iterations = $state<number>(3);
let testCacheHit = $state(true);
let copied = $state(false);
let progress = $state({ current: 0, total: 0 });
let testCount = $state<number>(5);

// 缓存实例
const blobCache = new SimpleCache();
const assetCache = new SimpleCache();

/**
 * 选择压缩包
 */
async function selectArchive() {
	const file = await open({
		multiple: false,
		filters: [
			{ name: '压缩包', extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr'] }
		]
	});

	if (file && typeof file === 'string') {
		selectedArchive = file;
		results = [];
		summary = [];
		
		// 获取压缩包内图片列表
		try {
			const images = await invoke<string[]>('get_images_from_archive', {
				archivePath: file
			});
			archiveImages = images.slice(0, testCount).map(innerPath => ({
				archivePath: file,
				innerPath,
				displayName: innerPath.split(/[/\\]/).pop() || innerPath
			}));
		} catch (err) {
			console.error('获取压缩包内容失败:', err);
			archiveImages = [];
		}
	}
}

function clearArchive() {
	selectedArchive = '';
	archiveImages = [];
	results = [];
	summary = [];
	blobCache.clear();
	assetCache.clear();
}

/**
 * Blob 模式测试（压缩包）
 * 通过 IPC 加载二进制数据，创建 Blob，再创建 ObjectURL
 */
async function testBlobMode(img: ImageInfo, useCache: boolean): Promise<TestResult> {
	const cacheKey = `${img.archivePath}:${img.innerPath}`;
	const timing: TimingDetail = { loadData: 0, blobCreate: 0, urlCreate: 0, imgDecode: 0, total: 0 };
	const totalStart = performance.now();

	try {
		let url: string;
		let fileSize = 0;
		let cached = false;

		// 检查缓存
		if (useCache && blobCache.has(cacheKey)) {
			url = blobCache.get(cacheKey)!;
			cached = true;
			timing.loadData = 0;
			timing.blobCreate = 0;
			timing.urlCreate = 0;
		} else {
			// 从压缩包加载原始数据
			const loadStart = performance.now();
			const rawData = await invoke<number[]>('load_image_from_archive', {
				archivePath: img.archivePath,
				filePath: img.innerPath
			});
			timing.loadData = performance.now() - loadStart;
			fileSize = rawData.length;

			// 创建 Blob
			const blobStart = performance.now();
			const blob = new Blob([new Uint8Array(rawData)]);
			timing.blobCreate = performance.now() - blobStart;

			// 创建 ObjectURL
			const urlStart = performance.now();
			url = URL.createObjectURL(blob);
			timing.urlCreate = performance.now() - urlStart;

			// 存入缓存
			if (useCache) {
				blobCache.set(cacheKey, url, fileSize);
			}
		}

		// 图片解码和加载
		const decodeStart = performance.now();
		const dimensions = await loadImageAndGetDimensions(url);
		timing.imgDecode = performance.now() - decodeStart;

		timing.total = performance.now() - totalStart;

		return {
			mode: 'blob',
			fileName: img.displayName,
			fileSize,
			dimensions,
			timing,
			cached,
			success: true,
			error: null
		};
	} catch (err) {
		timing.total = performance.now() - totalStart;
		return {
			mode: 'blob',
			fileName: img.displayName,
			fileSize: 0,
			dimensions: null,
			timing,
			cached: false,
			success: false,
			error: String(err)
		};
	}
}

/**
 * ConvertFileSrc 模式测试（压缩包）
 * 使用 extract_image_to_temp + asset:// 协议
 */
async function testConvertFileSrcMode(img: ImageInfo, useCache: boolean): Promise<TestResult> {
	const cacheKey = `${img.archivePath}:${img.innerPath}`;
	const timing: TimingDetail = { loadData: 0, blobCreate: 0, urlCreate: 0, imgDecode: 0, total: 0 };
	const totalStart = performance.now();

	try {
		let url: string;
		let cached = false;

		// 检查缓存
		if (useCache && assetCache.has(cacheKey)) {
			url = assetCache.get(cacheKey)!;
			cached = true;
			timing.loadData = 0;
			timing.urlCreate = 0;
		} else {
			// 解压到临时文件
			const extractStart = performance.now();
			const tempPath = await invoke<string>('extract_image_to_temp', {
				archivePath: img.archivePath,
				filePath: img.innerPath
			});
			timing.loadData = performance.now() - extractStart;

			// 创建 asset URL
			const urlStart = performance.now();
			url = convertFileSrc(tempPath);
			timing.urlCreate = performance.now() - urlStart;

			if (useCache) {
				assetCache.set(cacheKey, url, 0);
			}
		}

		// Blob 创建时间为 0（这种模式不创建 Blob）
		timing.blobCreate = 0;

		// 图片解码和加载
		const decodeStart = performance.now();
		const dimensions = await loadImageAndGetDimensions(url);
		timing.imgDecode = performance.now() - decodeStart;

		timing.total = performance.now() - totalStart;

		return {
			mode: 'convertFileSrc',
			fileName: img.displayName,
			fileSize: 0, // 临时文件模式不好获取大小
			dimensions,
			timing,
			cached,
			success: true,
			error: null
		};
	} catch (err) {
		timing.total = performance.now() - totalStart;
		return {
			mode: 'convertFileSrc',
			fileName: img.displayName,
			fileSize: 0,
			dimensions: null,
			timing,
			cached: false,
			success: false,
			error: String(err)
		};
	}
}

/**
 * 加载图片并获取尺寸
 */
function loadImageAndGetDimensions(url: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
		img.onerror = () => reject(new Error('图片加载失败'));
		img.src = url;
	});
}

/**
 * 计算统计摘要
 */
function calculateSummary(mode: 'blob' | 'convertFileSrc'): TestSummary {
	const modeResults = results.filter(r => r.mode === mode && r.success);
	if (modeResults.length === 0) {
		return {
			mode,
			count: 0,
			avgTotal: 0,
			avgLoadData: 0,
			avgBlobCreate: 0,
			avgUrlCreate: 0,
			avgImgDecode: 0,
			minTotal: 0,
			maxTotal: 0,
			cacheHitRate: 0
		};
	}

	const totals = modeResults.map(r => r.timing.total);
	const cachedCount = modeResults.filter(r => r.cached).length;

	return {
		mode,
		count: modeResults.length,
		avgTotal: totals.reduce((a, b) => a + b, 0) / totals.length,
		avgLoadData: modeResults.reduce((a, r) => a + r.timing.loadData, 0) / modeResults.length,
		avgBlobCreate: modeResults.reduce((a, r) => a + r.timing.blobCreate, 0) / modeResults.length,
		avgUrlCreate: modeResults.reduce((a, r) => a + r.timing.urlCreate, 0) / modeResults.length,
		avgImgDecode: modeResults.reduce((a, r) => a + r.timing.imgDecode, 0) / modeResults.length,
		minTotal: Math.min(...totals),
		maxTotal: Math.max(...totals),
		cacheHitRate: (cachedCount / modeResults.length) * 100
	};
}

/**
 * 运行基准测试
 */
async function runBenchmark() {
	if (archiveImages.length === 0) return;

	isRunning = true;
	results = [];
	summary = [];
	blobCache.clear();
	assetCache.clear();

	const totalTests = archiveImages.length * iterations * 2 * (testCacheHit ? 2 : 1);
	progress = { current: 0, total: totalTests };

	try {
		// 第一轮：冷启动测试（无缓存）
		for (let iter = 0; iter < iterations; iter++) {
			for (const img of archiveImages) {
				// Blob 模式
				const blobResult = await testBlobMode(img, false);
				results = [...results, blobResult];
				progress.current++;

				// ConvertFileSrc 模式
				const assetResult = await testConvertFileSrcMode(img, false);
				results = [...results, assetResult];
				progress.current++;

				// 清理缓存以确保每次都是冷启动
				blobCache.clear();
				assetCache.clear();
			}
		}

		// 第二轮：缓存命中测试
		if (testCacheHit) {
			// 先预热缓存
			for (const img of archiveImages) {
				await testBlobMode(img, true);
				await testConvertFileSrcMode(img, true);
			}

			// 测试缓存命中
			for (let iter = 0; iter < iterations; iter++) {
				for (const img of archiveImages) {
					const blobResult = await testBlobMode(img, true);
					results = [...results, blobResult];
					progress.current++;

					const assetResult = await testConvertFileSrcMode(img, true);
					results = [...results, assetResult];
					progress.current++;
				}
			}
		}

		// 计算摘要
		summary = [
			calculateSummary('blob'),
			calculateSummary('convertFileSrc')
		];
	} catch (err) {
		console.error('基准测试失败:', err);
	} finally {
		isRunning = false;
	}
}

function formatFileSize(bytes: number): string {
	if (bytes === 0) return '-';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ms: number): string {
	if (ms === 0) return '-';
	if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
	return `${ms.toFixed(1)}ms`;
}

function generateCopyText(): string {
	if (summary.length === 0) return '';

	const lines: string[] = [];
	lines.push('=== 图像源模式基准测试 ===');
	lines.push(`测试时间: ${new Date().toLocaleString()}`);
	lines.push(`测试文件: ${archiveImages.length} 个 (${selectedArchive.split(/[/\\]/).pop()})`);
	lines.push(`迭代次数: ${iterations}`);
	lines.push(`缓存测试: ${testCacheHit ? '启用' : '禁用'}`);
	lines.push('');

	for (const s of summary) {
		const modeName = s.mode === 'blob' ? 'Blob 模式 (IPC)' : 'ConvertFileSrc 模式 (asset://)';
		lines.push(`--- ${modeName} ---`);
		lines.push(`  测试数: ${s.count}`);
		lines.push(`  平均总时间: ${formatTime(s.avgTotal)}`);
		lines.push(`  平均加载数据: ${formatTime(s.avgLoadData)}`);
		lines.push(`  平均创建 Blob: ${formatTime(s.avgBlobCreate)}`);
		lines.push(`  平均创建 URL: ${formatTime(s.avgUrlCreate)}`);
		lines.push(`  平均图片解码: ${formatTime(s.avgImgDecode)}`);
		lines.push(`  最快: ${formatTime(s.minTotal)} / 最慢: ${formatTime(s.maxTotal)}`);
		if (testCacheHit) {
			lines.push(`  缓存命中率: ${s.cacheHitRate.toFixed(0)}%`);
		}
		lines.push('');
	}

	// 对比
	if (summary.length === 2) {
		const blobSum = summary.find(s => s.mode === 'blob')!;
		const assetSum = summary.find(s => s.mode === 'convertFileSrc')!;
		const ratio = blobSum.avgTotal / assetSum.avgTotal;
		lines.push('--- 对比 ---');
		if (ratio > 1) {
			lines.push(`  ConvertFileSrc 比 Blob 快 ${ratio.toFixed(2)}x`);
		} else {
			lines.push(`  Blob 比 ConvertFileSrc 快 ${(1/ratio).toFixed(2)}x`);
		}
	}

	return lines.join('\n');
}

async function copyResults() {
	const text = generateCopyText();
	if (text) {
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
}

function resetCaches() {
	blobCache.clear();
	assetCache.clear();
}
</script>

<div class="space-y-3">
	<p class="text-[10px] text-muted-foreground">
		对比 Blob (IPC) 和 ConvertFileSrc (asset://) 加载模式
	</p>

	<!-- 压缩包选择 -->
	<div class="flex gap-2">
		<Button onclick={selectArchive} variant="outline" size="sm" class="flex-1 text-xs">
			<Archive class="h-3 w-3 mr-1" />
			{selectedArchive ? `${archiveImages.length} 张` : '选择压缩包'}
		</Button>
		<Button
			onclick={runBenchmark}
			disabled={isRunning || archiveImages.length === 0}
			size="sm"
			class="flex-1 text-xs"
		>
			<Play class="h-3 w-3 mr-1" />
			{isRunning ? `${progress.current}/${progress.total}` : '运行测试'}
		</Button>
		{#if selectedArchive}
			<Button onclick={clearArchive} variant="ghost" size="sm" class="text-xs">
				<Trash2 class="h-3 w-3" />
			</Button>
		{/if}
	</div>

	<!-- 选项 -->
	<div class="flex flex-wrap items-center gap-3 text-[10px]">
		<div class="flex items-center gap-1">
			<span class="text-muted-foreground">图片:</span>
			<div class="flex gap-1">
				{#each [3, 5, 10, 20] as count}
					<button
						type="button"
						class="px-1.5 py-0.5 rounded {testCount === count ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}"
						onclick={() => testCount = count}
					>
						{count}
					</button>
				{/each}
			</div>
		</div>
		<div class="flex items-center gap-1">
			<span class="text-muted-foreground">迭代:</span>
			<div class="flex gap-1">
				{#each [1, 3, 5] as count}
					<button
						type="button"
						class="px-1.5 py-0.5 rounded {iterations === count ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}"
						onclick={() => iterations = count}
					>
						{count}
					</button>
				{/each}
			</div>
		</div>
		<label class="flex items-center gap-1 cursor-pointer">
			<input type="checkbox" bind:checked={testCacheHit} class="w-3 h-3" />
			<span class="text-muted-foreground">缓存</span>
		</label>
		<Button onclick={resetCaches} variant="ghost" size="sm" class="text-xs h-5 px-1">
			<RotateCcw class="h-3 w-3" />
		</Button>
	</div>

	<!-- 压缩包信息 -->
	{#if selectedArchive}
		<div class="text-[10px] text-muted-foreground">
			<div class="truncate font-medium">{selectedArchive.split(/[/\\]/).pop()}</div>
			<div class="max-h-16 overflow-auto space-y-0.5 mt-1">
				{#each archiveImages as img}
					<div class="truncate">{img.displayName}</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 摘要结果 -->
	{#if summary.length > 0}
		<div class="space-y-2">
			<div class="flex justify-between items-center">
				<span class="text-[10px] font-medium">测试摘要</span>
				<Button onclick={copyResults} variant="ghost" size="sm" class="h-6 px-2">
					{#if copied}
						<Check class="w-3 h-3 text-green-500" />
					{:else}
						<Copy class="w-3 h-3" />
					{/if}
				</Button>
			</div>

			{#each summary as s}
				<div class="border rounded p-2 space-y-1 text-[10px]">
					<div class="flex justify-between font-medium">
						<span class={s.mode === 'blob' ? 'text-blue-500' : 'text-green-500'}>
							{s.mode === 'blob' ? 'Blob (IPC)' : 'ConvertFileSrc (asset://)'}
						</span>
						<span class="font-mono text-primary">{formatTime(s.avgTotal)}</span>
					</div>
					<div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
						<div>加载: <span class="font-mono text-foreground">{formatTime(s.avgLoadData)}</span></div>
						<div>Blob: <span class="font-mono text-foreground">{formatTime(s.avgBlobCreate)}</span></div>
						<div>URL: <span class="font-mono text-foreground">{formatTime(s.avgUrlCreate)}</span></div>
						<div>解码: <span class="font-mono text-foreground">{formatTime(s.avgImgDecode)}</span></div>
					</div>
					<div class="flex justify-between text-muted-foreground pt-1 border-t">
						<span>范围: {formatTime(s.minTotal)} ~ {formatTime(s.maxTotal)}</span>
						{#if testCacheHit}
							<span>缓存: {s.cacheHitRate.toFixed(0)}%</span>
						{/if}
					</div>
				</div>
			{/each}

			<!-- 对比结论 -->
			{#if summary.length === 2}
				{@const blobSum = summary.find(s => s.mode === 'blob')}
				{@const assetSum = summary.find(s => s.mode === 'convertFileSrc')}
				{#if blobSum && assetSum && blobSum.avgTotal > 0 && assetSum.avgTotal > 0}
					{@const ratio = blobSum.avgTotal / assetSum.avgTotal}
					<div class="border rounded p-2 text-[10px] text-center">
						{#if ratio > 1}
							<span class="text-green-500 font-medium">ConvertFileSrc</span>
							<span class="text-muted-foreground"> 比 </span>
							<span class="text-blue-500 font-medium">Blob</span>
							<span class="text-muted-foreground"> 快 </span>
							<span class="font-mono text-primary font-medium">{ratio.toFixed(2)}x</span>
						{:else}
							<span class="text-blue-500 font-medium">Blob</span>
							<span class="text-muted-foreground"> 比 </span>
							<span class="text-green-500 font-medium">ConvertFileSrc</span>
							<span class="text-muted-foreground"> 快 </span>
							<span class="font-mono text-primary font-medium">{(1/ratio).toFixed(2)}x</span>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- 详细结果（可折叠） -->
	{#if results.length > 0}
		<details class="text-[10px]">
			<summary class="cursor-pointer text-muted-foreground hover:text-foreground">
				详细结果 ({results.length} 条)
			</summary>
			<div class="mt-2 max-h-40 overflow-auto space-y-1">
				{#each results as r}
					<div class="border rounded px-2 py-1 flex justify-between items-center">
						<span class={r.mode === 'blob' ? 'text-blue-500' : 'text-green-500'}>
							{r.mode === 'blob' ? 'B' : 'A'}
							{#if r.cached}<span class="text-yellow-500 ml-1">C</span>{/if}
						</span>
						<span class="truncate flex-1 mx-2">{r.fileName}</span>
						<span class="font-mono {r.success ? 'text-foreground' : 'text-red-500'}">
							{r.success ? formatTime(r.timing.total) : '失败'}
						</span>
					</div>
				{/each}
			</div>
		</details>
	{/if}
</div>
