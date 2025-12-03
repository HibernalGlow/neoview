<script lang="ts">
	/**
	 * 基准测试面板
	 * 用于测试不同图像解码方法的性能
	 * 参考 UpscalePanel 的可折叠卡片结构
	 */
	import { invoke } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Timer, ChevronUp, ChevronDown, ArrowUp, ArrowDown, FolderOpen, Copy, Check, Play, Trash2 } from '@lucide/svelte';

	// ==================== 类型定义 ====================
	interface BenchmarkResult {
		method: string;
		format: string;
		duration_ms: number;
		success: boolean;
		error: string | null;
		image_size: [number, number] | null;
		output_size: number | null;
	}

	interface BenchmarkReport {
		file_path: string;
		file_size: number;
		results: BenchmarkResult[];
	}

	type CardId = 'files' | 'detailed' | 'loadmode' | 'archives' | 'realworld' | 'results' | 'summary';

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

	interface RealWorldTestResult {
		viewport_size: number;
		total_files: number;
		total_time_ms: number;
		avg_time_ms: number;
		cached_count: number;
		generated_count: number;
		failed_count: number;
		throughput: number; // files per second
	}

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

	// ==================== 状态管理 ====================
	let cardOrder = $state<CardId[]>(['files', 'detailed', 'loadmode', 'archives', 'realworld', 'results', 'summary']);
	let showCards = $state<Record<CardId, boolean>>({
		files: true,
		detailed: true,
		loadmode: true,
		archives: true,
		realworld: true,
		results: true,
		summary: true
	});

	interface ArchiveScanResult {
		total_count: number;
		folder_path: string;
	}

	let reports = $state<BenchmarkReport[]>([]);
	let detailedResults = $state<DetailedBenchmarkResult[]>([]);
	let loadModeResults = $state<LoadModeTestResult[]>([]);
	let realWorldResult = $state<RealWorldTestResult | null>(null);
	let selectedLoadModeFile = $state<string>('');
	let isRunning = $state(false);
	let isScanning = $state(false);
	let selectedFiles = $state<string[]>([]);
	let selectedDetailedFile = $state<string>('');
	let selectedArchiveFolder = $state<string>('');
	let selectedRealWorldFolder = $state<string>('');
	let archiveScanResult = $state<ArchiveScanResult | null>(null);
	let archiveTier = $state<20 | 50 | 100 | 300>(20);
	let viewportSize = $state<number>(20); // 模拟可见区域大小
	let copied = $state(false);

	// ==================== 卡片操作 ====================
	function getCardOrder(cardId: CardId): number {
		return cardOrder.indexOf(cardId);
	}

	function canMoveCard(cardId: CardId, direction: 'up' | 'down'): boolean {
		const idx = cardOrder.indexOf(cardId);
		if (direction === 'up') return idx > 0;
		return idx < cardOrder.length - 1;
	}

	function moveCard(cardId: CardId, direction: 'up' | 'down') {
		const idx = cardOrder.indexOf(cardId);
		if (direction === 'up' && idx > 0) {
			[cardOrder[idx - 1], cardOrder[idx]] = [cardOrder[idx], cardOrder[idx - 1]];
		} else if (direction === 'down' && idx < cardOrder.length - 1) {
			[cardOrder[idx], cardOrder[idx + 1]] = [cardOrder[idx + 1], cardOrder[idx]];
		}
	}

	// ==================== 文件操作 ====================
	async function selectFiles() {
		const files = await open({
			multiple: true,
			filters: [
				{
					name: '图像',
					extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'jxl', 'gif', 'bmp', 'tiff']
				}
			]
		});

		if (files) {
			selectedFiles = Array.isArray(files) ? files : [files];
		}
	}

	async function selectArchiveFolder() {
		const folder = await open({
			directory: true,
			multiple: false
		});

		if (folder && typeof folder === 'string') {
			selectedArchiveFolder = folder;
			archiveScanResult = null;
			// 自动扫描
			isScanning = true;
			try {
				const result = await invoke<ArchiveScanResult>('scan_archive_folder', {
					folderPath: folder
				});
				archiveScanResult = result;
			} catch (err) {
				console.error('扫描失败:', err);
			} finally {
				isScanning = false;
			}
		}
	}

	function clearFiles() {
		selectedFiles = [];
		reports = [];
	}

	function clearArchives() {
		selectedArchiveFolder = '';
		archiveScanResult = null;
		reports = [];
	}

	async function selectDetailedFile() {
		const file = await open({
			multiple: false,
			filters: [
				{
					name: '压缩包/图像',
					extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'jxl', 'gif', 'bmp']
				}
			]
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
		} catch (err) {
			console.error('详细测试失败:', err);
		} finally {
			isRunning = false;
		}
	}

	// ==================== 加载模式测试 ====================
	async function selectLoadModeFile() {
		const file = await open({
			multiple: false,
			filters: [
				{
					name: '图像',
					extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'jxl', 'gif', 'bmp']
				}
			]
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
			// 后端测试（解码时间）
			const backendResults = await invoke<LoadModeTestResult[]>('test_load_modes', {
				filePath: selectedLoadModeFile
			});

			// 前端真实渲染测试
			const frontendResults: LoadModeTestResult[] = [];

			// 测试 Raw 模式：传输原始字节 → Blob → img 加载
			try {
				const startTotal = performance.now();
				const rawData = await invoke<number[]>('load_image', { path: selectedLoadModeFile });
				const transferTime = performance.now() - startTotal;

				const startRender = performance.now();
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

			// 测试 Bitmap 模式：传输像素 → Canvas 渲染
			try {
				interface BitmapResult { data: number[]; width: number; height: number; decode_ms: number; }
				const startTotal = performance.now();
				const bitmapResult = await invoke<BitmapResult>('load_image_as_bitmap', { filePath: selectedLoadModeFile });
				const transferTime = performance.now() - startTotal;

				// Canvas 渲染
				const startRender = performance.now();
				const canvas = document.createElement('canvas');
				canvas.width = bitmapResult.width;
				canvas.height = bitmapResult.height;
				const ctx = canvas.getContext('2d')!;
				const imageData = new ImageData(
					new Uint8ClampedArray(bitmapResult.data),
					bitmapResult.width,
					bitmapResult.height
				);
				ctx.putImageData(imageData, 0, 0);
				const renderTime = performance.now() - startRender;
				const totalTime = performance.now() - startTotal;

				frontendResults.push({
					mode: 'Bitmap→Canvas (完整)',
					format: selectedLoadModeFile.split('.').pop() || '',
					input_size: bitmapResult.data.length,
					output_size: bitmapResult.data.length,
					decode_ms: totalTime,
					width: bitmapResult.width,
					height: bitmapResult.height,
					success: true,
					error: null
				});
			} catch (e) {
				frontendResults.push({
					mode: 'Bitmap→Canvas (完整)',
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

	// ==================== 真实场景测试 ====================
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

	// ==================== 测试操作 ====================
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

	async function runArchiveBenchmark() {
		if (!selectedArchiveFolder) return;

		isRunning = true;
		reports = [];

		try {
			const results = await invoke<BenchmarkReport[]>('run_archive_folder_benchmark', {
				folderPath: selectedArchiveFolder,
				tier: archiveTier
			});
			reports = results;
		} catch (err) {
			console.error('压缩包基准测试失败:', err);
		} finally {
			isRunning = false;
		}
	}

	// ==================== 工具函数 ====================
	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	function generateCopyText(): string {
		if (reports.length === 0) return '';
		
		const lines: string[] = [];
		lines.push('=== 图像解码基准测试结果 ===');
		lines.push(`测试时间: ${new Date().toLocaleString()}`);
		lines.push(`测试文件数: ${reports.length}`);
		lines.push('');
		
		for (const report of reports) {
			const fileName = report.file_path.split(/[/\\]/).pop() || report.file_path;
			lines.push(`📁 ${fileName}`);
			lines.push(`   源文件大小: ${formatFileSize(report.file_size)}`);
			
			const sortedResults = [...report.results].sort((a, b) => {
				if (!a.success) return 1;
				if (!b.success) return -1;
				return a.duration_ms - b.duration_ms;
			});
			
			for (const result of sortedResults) {
				const status = result.success ? '✅' : '❌';
				const time = result.success ? `${result.duration_ms.toFixed(1)}ms` : 'FAILED';
				const size = result.output_size ? ` → ${formatFileSize(result.output_size)}` : '';
				const dims = result.image_size ? ` [${result.image_size[0]}×${result.image_size[1]}]` : '';
				const err = result.error ? ` (${result.error})` : '';
				lines.push(`   ${status} ${result.method}: ${time}${size}${dims}${err}`);
			}
			lines.push('');
		}
		
		// 性能统计
		if (reports.length > 0) {
			lines.push('--- 性能排名 (解码) ---');
			const decodeStats = getDecodeStats();
			for (const stat of decodeStats) {
				lines.push(`   ${stat.method}: 平均 ${stat.avg.toFixed(1)}ms (${stat.count}次)`);
			}
			
			lines.push('');
			lines.push('--- 性能排名 (完整缩略图) ---');
			const thumbStats = getThumbStats();
			for (const stat of thumbStats) {
				lines.push(`   ${stat.method}: 平均 ${stat.avg.toFixed(1)}ms (${stat.count}次)`);
			}
		}
		
		return lines.join('\n');
	}

	function getDecodeStats() {
		const decodeMethods = ['image crate', 'WIC (Windows)', 'jxl-oxide'];
		const decodeStats = new Map<string, number[]>();
		
		for (const report of reports) {
			for (const result of report.results) {
				if (decodeMethods.includes(result.method) && result.success) {
					if (!decodeStats.has(result.method)) {
						decodeStats.set(result.method, []);
					}
					decodeStats.get(result.method)!.push(result.duration_ms);
				}
			}
		}
		
		return [...decodeStats.entries()]
			.map(([method, times]) => ({
				method,
				avg: times.reduce((a, b) => a + b, 0) / times.length,
				count: times.length
			}))
			.sort((a, b) => a.avg - b.avg);
	}

	function getThumbStats() {
		const thumbMethods = ['thumbnail/image→webp', 'thumbnail/WIC→webp', 'thumbnail/WIC→jpg', 'thumbnail/WIC→png'];
		const thumbStats = new Map<string, number[]>();
		
		for (const report of reports) {
			for (const result of report.results) {
				if (thumbMethods.includes(result.method) && result.success) {
					if (!thumbStats.has(result.method)) {
						thumbStats.set(result.method, []);
					}
					thumbStats.get(result.method)!.push(result.duration_ms);
				}
			}
		}
		
		return [...thumbStats.entries()]
			.map(([method, times]) => ({
				method,
				avg: times.reduce((a, b) => a + b, 0) / times.length,
				count: times.length
			}))
			.sort((a, b) => a.avg - b.avg);
	}

	async function copyResults() {
		const text = generateCopyText();
		if (text) {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}
</script>

<div class="flex h-full flex-col">
	<!-- 面板头部 -->
	<header class="flex items-center justify-between px-4 py-3">
		<div class="flex items-center gap-2">
			<Timer class="h-5 w-5" />
			<div>
				<p class="text-sm font-semibold">基准测试</p>
				<p class="text-xs text-muted-foreground">解码性能 · 缩略图生成</p>
			</div>
		</div>
		{#if reports.length > 0}
			<Button variant="ghost" size="sm" class="gap-1 text-xs" onclick={copyResults}>
				{#if copied}
					<Check class="h-3.5 w-3.5 text-green-500" />
					已复制
				{:else}
					<Copy class="h-3.5 w-3.5" />
					复制结果
				{/if}
			</Button>
		{/if}
	</header>

	<!-- 渐变过渡 -->
	<div class="h-4 bg-linear-to-b from-transparent to-background"></div>

	<!-- 可滚动内容区 -->
	<div class="flex-1 overflow-y-auto px-3 py-2 bg-background">
		<div class="flex flex-col gap-3">
			<!-- 文件选择卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3"
				style={`order: ${getCardOrder('files')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">测试文件</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => (showCards.files = !showCards.files)}
							title={showCards.files ? '收起' : '展开'}
						>
							{#if showCards.files}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('files', 'up')}
							disabled={!canMoveCard('files', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('files', 'down')}
							disabled={!canMoveCard('files', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.files}
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
					</div>
				{/if}
			</div>

			<!-- 详细对比测试卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3"
				style={`order: ${getCardOrder('detailed')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">详细对比测试</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => (showCards.detailed = !showCards.detailed)}
							title={showCards.detailed ? '收起' : '展开'}
						>
							{#if showCards.detailed}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('detailed', 'up')}
							disabled={!canMoveCard('detailed', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('detailed', 'down')}
							disabled={!canMoveCard('detailed', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.detailed}
					<div class="space-y-2">
						<p class="text-[10px] text-muted-foreground">
							比较 WIC 内置缩放 vs 全尺寸解码，显示提取/解码/缩放/编码各步骤耗时
						</p>
						<div class="flex gap-2">
							<Button onclick={selectDetailedFile} variant="outline" size="sm" class="flex-1 text-xs">
								<FolderOpen class="h-3 w-3 mr-1" />
								{selectedDetailedFile ? '已选择' : '选择压缩包/图像'}
							</Button>
							<Button
								onclick={runDetailedBenchmark}
								disabled={isRunning || !selectedDetailedFile}
								size="sm"
								class="flex-1 text-xs"
							>
								<Play class="h-3 w-3 mr-1" />
								{isRunning ? '测试中...' : '对比测试'}
							</Button>
						</div>

						{#if selectedDetailedFile}
							<div class="text-[10px] text-muted-foreground truncate">
								{selectedDetailedFile.split(/[/\\]/).pop()}
							</div>
						{/if}

						{#if detailedResults.length > 0}
							<div class="space-y-2 text-[10px]">
								{#each detailedResults as result}
									<div class="border rounded p-2 space-y-1 {result.method.includes('推荐') ? 'border-green-500/50 bg-green-500/5' : ''}">
										<div class="font-medium flex justify-between">
											<span class:text-green-500={result.method.includes('推荐')}>
												{result.method}
											</span>
											<span class="font-mono">{result.total_ms.toFixed(0)}ms</span>
										</div>
										<div class="grid grid-cols-4 gap-1 text-muted-foreground">
											<div>
												<span class="block text-[8px]">读取</span>
												<span class="font-mono">{result.extract_ms.toFixed(0)}ms</span>
											</div>
											<div>
												<span class="block text-[8px]">解码</span>
												<span class="font-mono">{result.decode_ms.toFixed(0)}ms</span>
											</div>
											<div>
												<span class="block text-[8px]">缩放</span>
												<span class="font-mono">{result.scale_ms.toFixed(0)}ms</span>
											</div>
											<div>
												<span class="block text-[8px]">编码</span>
												<span class="font-mono">{result.encode_ms.toFixed(0)}ms</span>
											</div>
										</div>
										{#if result.original_dims}
											<div class="text-muted-foreground">
												{result.original_dims[0]}×{result.original_dims[1]} → {result.output_dims?.[0]}×{result.output_dims?.[1]}
											</div>
										{/if}
										{#if result.output_size}
											<div class="text-muted-foreground">
												输出: {formatFileSize(result.output_size)}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- 加载模式对比卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3"
				style={`order: ${getCardOrder('loadmode')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">Raw vs Bitmap</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => (showCards.loadmode = !showCards.loadmode)}
							title={showCards.loadmode ? '收起' : '展开'}
						>
							{#if showCards.loadmode}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('loadmode', 'up')}
							disabled={!canMoveCard('loadmode', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('loadmode', 'down')}
							disabled={!canMoveCard('loadmode', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.loadmode}
					<div class="space-y-2">
						<p class="text-[10px] text-muted-foreground">
							对比原始字节传输 vs WIC解码后传输像素
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
								{isRunning ? '测试中...' : '对比测试'}
							</Button>
						</div>
						{#if selectedLoadModeFile}
							<div class="text-[10px] text-muted-foreground truncate" title={selectedLoadModeFile}>
								📄 {selectedLoadModeFile.split(/[/\\]/).pop()}
							</div>
						{/if}
						{#if loadModeResults.length > 0}
							<div class="space-y-1">
								{#each loadModeResults as result}
									<div class="border rounded p-2 text-[10px] {result.success ? '' : 'border-red-500/50'}">
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
				{/if}
			</div>

			<!-- 压缩包批量测试卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3"
				style={`order: ${getCardOrder('archives')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">压缩包测试</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => (showCards.archives = !showCards.archives)}
							title={showCards.archives ? '收起' : '展开'}
						>
							{#if showCards.archives}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('archives', 'up')}
							disabled={!canMoveCard('archives', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('archives', 'down')}
							disabled={!canMoveCard('archives', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.archives}
					<div class="space-y-2">
						<div class="flex gap-2">
							<Button onclick={selectArchiveFolder} variant="outline" size="sm" class="flex-1 text-xs" disabled={isScanning}>
								<FolderOpen class="h-3 w-3 mr-1" />
								{isScanning ? '扫描中...' : selectedArchiveFolder ? '重选文件夹' : '选择文件夹'}
							</Button>
							<Button
								onclick={runArchiveBenchmark}
								disabled={isRunning || !archiveScanResult || archiveScanResult.total_count === 0}
								size="sm"
								class="flex-1 text-xs"
							>
								<Play class="h-3 w-3 mr-1" />
								{isRunning ? '测试中...' : '开始测试'}
							</Button>
							{#if selectedArchiveFolder}
								<Button onclick={clearArchives} variant="ghost" size="sm" class="text-xs">
									<Trash2 class="h-3 w-3" />
								</Button>
							{/if}
						</div>

						<!-- 扫描结果显示 -->
						{#if archiveScanResult}
							<div class="text-[10px] p-2 bg-muted/50 rounded space-y-1">
								<div class="flex justify-between">
									<span class="text-muted-foreground">找到压缩包:</span>
									<span class="font-medium text-primary">{archiveScanResult.total_count} 个</span>
								</div>
								<div class="truncate text-muted-foreground" title={archiveScanResult.folder_path}>
									📁 {archiveScanResult.folder_path}
								</div>
							</div>
						{/if}

						<!-- 档位选择 -->
						{#if archiveScanResult && archiveScanResult.total_count > 0}
							<div class="flex gap-1 text-[10px] items-center">
								<span class="text-muted-foreground mr-1">抽样数:</span>
								{#each [20, 50, 100, 300] as tier}
									<button
										type="button"
										class="px-2 py-0.5 rounded {archiveTier === tier ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}"
										onclick={() => archiveTier = tier as 20 | 50 | 100 | 300}
										disabled={tier > archiveScanResult.total_count}
									>
										{Math.min(tier, archiveScanResult.total_count)}
									</button>
								{/each}
							</div>
							<div class="text-[10px] text-muted-foreground">
								将随机抽取 {Math.min(archiveTier, archiveScanResult.total_count)} 个压缩包测试
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- 真实场景测试卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3"
				style={`order: ${getCardOrder('realworld')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">真实场景测试</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => (showCards.realworld = !showCards.realworld)}
							title={showCards.realworld ? '收起' : '展开'}
						>
							{#if showCards.realworld}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('realworld', 'up')}
							disabled={!canMoveCard('realworld', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('realworld', 'down')}
							disabled={!canMoveCard('realworld', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.realworld}
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
				{/if}
			</div>

			<!-- 测试结果卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3"
				style={`order: ${getCardOrder('results')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">测试结果</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => (showCards.results = !showCards.results)}
							title={showCards.results ? '收起' : '展开'}
						>
							{#if showCards.results}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('results', 'up')}
							disabled={!canMoveCard('results', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('results', 'down')}
							disabled={!canMoveCard('results', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.results}
					{#if reports.length === 0}
						<p class="text-xs text-muted-foreground text-center py-4">暂无测试结果</p>
					{:else}
						<div class="space-y-2 max-h-60 overflow-auto">
							{#each reports as report}
								<div class="border rounded p-2 space-y-1 text-[10px]">
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
				{/if}
			</div>

			<!-- 性能统计卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3"
				style={`order: ${getCardOrder('summary')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">性能统计</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => (showCards.summary = !showCards.summary)}
							title={showCards.summary ? '收起' : '展开'}
						>
							{#if showCards.summary}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('summary', 'up')}
							disabled={!canMoveCard('summary', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('summary', 'down')}
							disabled={!canMoveCard('summary', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.summary}
					{#if reports.length === 0}
						<p class="text-xs text-muted-foreground text-center py-4">运行测试后显示统计</p>
					{:else}
						{@const decodeStats = getDecodeStats()}
						{@const thumbStats = getThumbStats()}
						<div class="space-y-3 text-[10px]">
							{#if decodeStats.length > 0}
								<div>
									<div class="font-medium text-xs mb-1">解码性能排名</div>
									{#each decodeStats as stat, i}
										<div class="flex justify-between">
											<span class:text-green-500={i === 0}>
												{i + 1}. {stat.method}
											</span>
											<span class="font-mono">{stat.avg.toFixed(1)}ms</span>
										</div>
									{/each}
								</div>
							{/if}
							
							{#if thumbStats.length > 0}
								<div>
									<div class="font-medium text-xs mb-1">缩略图生成排名</div>
									{#each thumbStats as stat, i}
										<div class="flex justify-between">
											<span class:text-green-500={i === 0}>
												{i + 1}. {stat.method}
											</span>
											<span class="font-mono">{stat.avg.toFixed(1)}ms</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>
