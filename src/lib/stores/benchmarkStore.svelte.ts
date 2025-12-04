/**
 * Benchmark Panel Store
 * 共享基准测试面板的状态和操作
 */
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { settingsManager } from '$lib/settings/settingsManager';

// ==================== 类型定义 ====================
export interface BenchmarkResult {
	method: string;
	format: string;
	duration_ms: number;
	success: boolean;
	error: string | null;
	image_size: [number, number] | null;
	output_size: number | null;
}

export interface BenchmarkReport {
	file_path: string;
	file_size: number;
	results: BenchmarkResult[];
}

export interface RendererTestResult {
	mode: string;
	totalImages: number;
	loadTimes: number[];
	avgLoadTime: number;
	switchTimes: number[];
	avgSwitchTime: number;
	fps: number;
	success: boolean;
	error: string | null;
}

export interface DetailedLatencyResult {
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

export interface LoadModeTestResult {
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

export interface RealWorldTestResult {
	viewport_size: number;
	total_files: number;
	total_time_ms: number;
	avg_time_ms: number;
	cached_count: number;
	generated_count: number;
	failed_count: number;
	throughput: number;
}

export interface DetailedBenchmarkResult {
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

export interface ArchiveScanResult {
	total_count: number;
	folder_path: string;
}

// ==================== Store 创建 ====================
function createBenchmarkStore() {
	// 状态
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
	let viewportSize = $state<number>(20);
	let copied = $state(false);
	
	// 渲染模式测试状态
	let selectedRendererArchive = $state<string>('');
	let rendererTestResults = $state<RendererTestResult[]>([]);
	let isRendererTesting = $state(false);
	let rendererTestCount = $state<number>(10);
	
	// 详细延迟分析状态
	let selectedLatencyArchive = $state<string>('');
	let latencyResults = $state<DetailedLatencyResult[]>([]);
	let isLatencyTesting = $state(false);
	let latencyTestCount = $state<number>(5);
	
	// 设置状态
	let settings = $state(settingsManager.getSettings());
	settingsManager.addListener((s) => { settings = s; });

	// ==================== 工具函数 ====================
	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	// ==================== 文件选择 ====================
	async function selectFiles() {
		const files = await open({
			multiple: true,
			filters: [
				{
					name: '图像文件',
					extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'jxl', 'heic', 'heif']
				}
			]
		});

		if (files) {
			selectedFiles = Array.isArray(files) ? files : [files];
		}
	}

	async function selectDetailedFile() {
		const file = await open({
			multiple: false,
			filters: [
				{
					name: '压缩包',
					extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr']
				}
			]
		});

		if (file && typeof file === 'string') {
			selectedDetailedFile = file;
		}
	}

	async function selectLoadModeFile() {
		const file = await open({
			multiple: false,
			filters: [
				{
					name: '压缩包',
					extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr']
				}
			]
		});

		if (file && typeof file === 'string') {
			selectedLoadModeFile = file;
		}
	}

	async function selectArchiveFolder() {
		const folder = await open({
			directory: true,
			multiple: false
		});

		if (folder && typeof folder === 'string') {
			selectedArchiveFolder = folder;
			isScanning = true;

			try {
				const result = await invoke<ArchiveScanResult>('scan_archives_in_folder', {
					folderPath: folder
				});
				archiveScanResult = result;
			} catch (e) {
				console.error('扫描压缩包失败:', e);
				archiveScanResult = null;
			} finally {
				isScanning = false;
			}
		}
	}

	async function selectRealWorldFolder() {
		const folder = await open({
			directory: true,
			multiple: false
		});

		if (folder && typeof folder === 'string') {
			selectedRealWorldFolder = folder;
		}
	}

	async function selectRendererArchive() {
		const file = await open({
			multiple: false,
			filters: [
				{
					name: '压缩包',
					extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr']
				}
			]
		});

		if (file && typeof file === 'string') {
			selectedRendererArchive = file;
		}
	}

	async function selectLatencyArchive() {
		const file = await open({
			multiple: false,
			filters: [
				{
					name: '压缩包',
					extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr']
				}
			]
		});

		if (file && typeof file === 'string') {
			selectedLatencyArchive = file;
		}
	}

	// ==================== 清理函数 ====================
	function clearFiles() {
		selectedFiles = [];
		reports = [];
	}

	function clearDetailedFile() {
		selectedDetailedFile = '';
		detailedResults = [];
	}

	function clearLoadModeFile() {
		selectedLoadModeFile = '';
		loadModeResults = [];
	}

	function clearArchives() {
		selectedArchiveFolder = '';
		archiveScanResult = null;
	}

	function clearRealWorld() {
		selectedRealWorldFolder = '';
		realWorldResult = null;
	}

	function clearRendererArchive() {
		selectedRendererArchive = '';
		rendererTestResults = [];
	}

	function clearLatencyArchive() {
		selectedLatencyArchive = '';
		latencyResults = [];
	}

	// ==================== 测试运行 ====================
	async function runBenchmark() {
		if (selectedFiles.length === 0) return;
		isRunning = true;
		reports = [];

		for (const filePath of selectedFiles) {
			try {
				const result = await invoke<BenchmarkReport>('run_benchmark', {
					filePath
				});
				reports = [...reports, result];
			} catch (e) {
				console.error(`测试 ${filePath} 失败:`, e);
			}
		}

		isRunning = false;
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

	async function runLoadModeTest() {
		if (!selectedLoadModeFile) return;
		isRunning = true;
		loadModeResults = [];

		try {
			const results = await invoke<LoadModeTestResult[]>('run_load_mode_test', {
				archivePath: selectedLoadModeFile
			});
			loadModeResults = results;
		} catch (e) {
			console.error('加载模式测试失败:', e);
		}

		isRunning = false;
	}

	async function runArchiveBenchmark() {
		if (!archiveScanResult) return;
		isRunning = true;

		try {
			const results = await invoke<BenchmarkReport[]>('run_archive_batch_benchmark', {
				folderPath: selectedArchiveFolder,
				sampleCount: archiveTier
			});
			reports = results;
		} catch (e) {
			console.error('压缩包批量测试失败:', e);
		}

		isRunning = false;
	}

	async function runRealWorldTest() {
		if (!selectedRealWorldFolder) return;
		isRunning = true;
		realWorldResult = null;

		try {
			const result = await invoke<RealWorldTestResult>('run_real_world_test', {
				folderPath: selectedRealWorldFolder,
				viewportSize: viewportSize
			});
			realWorldResult = result;
		} catch (e) {
			console.error('真实场景测试失败:', e);
		}

		isRunning = false;
	}

	// ==================== 统计计算 ====================
	function getDecodeStats() {
		const methodStats: Record<string, number[]> = {};
		for (const report of reports) {
			for (const result of report.results) {
				if (result.success && result.method.includes('decode')) {
					if (!methodStats[result.method]) {
						methodStats[result.method] = [];
					}
					methodStats[result.method].push(result.duration_ms);
				}
			}
		}
		return Object.entries(methodStats)
			.map(([method, times]) => ({
				method,
				avg: times.reduce((a, b) => a + b, 0) / times.length,
				count: times.length
			}))
			.sort((a, b) => a.avg - b.avg);
	}

	function getThumbStats() {
		const methodStats: Record<string, number[]> = {};
		for (const report of reports) {
			for (const result of report.results) {
				if (result.success && result.method.includes('thumb')) {
					if (!methodStats[result.method]) {
						methodStats[result.method] = [];
					}
					methodStats[result.method].push(result.duration_ms);
				}
			}
		}
		return Object.entries(methodStats)
			.map(([method, times]) => ({
				method,
				avg: times.reduce((a, b) => a + b, 0) / times.length,
				count: times.length
			}))
			.sort((a, b) => a.avg - b.avg);
	}

	function copyResults() {
		const text = JSON.stringify({ reports, detailedResults, loadModeResults, realWorldResult }, null, 2);
		navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}

	return {
		// 状态 getters
		get reports() { return reports; },
		get detailedResults() { return detailedResults; },
		get loadModeResults() { return loadModeResults; },
		get realWorldResult() { return realWorldResult; },
		get selectedLoadModeFile() { return selectedLoadModeFile; },
		get isRunning() { return isRunning; },
		get isScanning() { return isScanning; },
		get selectedFiles() { return selectedFiles; },
		get selectedDetailedFile() { return selectedDetailedFile; },
		get selectedArchiveFolder() { return selectedArchiveFolder; },
		get selectedRealWorldFolder() { return selectedRealWorldFolder; },
		get archiveScanResult() { return archiveScanResult; },
		get archiveTier() { return archiveTier; },
		get viewportSize() { return viewportSize; },
		get copied() { return copied; },
		get selectedRendererArchive() { return selectedRendererArchive; },
		get rendererTestResults() { return rendererTestResults; },
		get isRendererTesting() { return isRendererTesting; },
		get rendererTestCount() { return rendererTestCount; },
		get selectedLatencyArchive() { return selectedLatencyArchive; },
		get latencyResults() { return latencyResults; },
		get isLatencyTesting() { return isLatencyTesting; },
		get latencyTestCount() { return latencyTestCount; },
		get settings() { return settings; },
		get currentRendererMode() { return settings.view.renderer?.mode ?? 'stack'; },
		get viewerJSEnabled() { return settings.view.renderer?.useViewerJS ?? false; },

		// 状态 setters
		setArchiveTier(tier: 20 | 50 | 100 | 300) { archiveTier = tier; },
		setViewportSize(size: number) { viewportSize = size; },
		setRendererTestCount(count: number) { rendererTestCount = count; },
		setLatencyTestCount(count: number) { latencyTestCount = count; },

		// 选择函数
		selectFiles,
		selectDetailedFile,
		selectLoadModeFile,
		selectArchiveFolder,
		selectRealWorldFolder,
		selectRendererArchive,
		selectLatencyArchive,

		// 清理函数
		clearFiles,
		clearDetailedFile,
		clearLoadModeFile,
		clearArchives,
		clearRealWorld,
		clearRendererArchive,
		clearLatencyArchive,

		// 测试运行
		runBenchmark,
		runDetailedBenchmark,
		runLoadModeTest,
		runArchiveBenchmark,
		runRealWorldTest,

		// 统计
		getDecodeStats,
		getThumbStats,
		copyResults,

		// 工具
		formatFileSize
	};
}

export const benchmarkStore = createBenchmarkStore();
