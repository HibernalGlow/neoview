<script lang="ts">
	/**
	 * 基准测试面板
	 * 用于测试不同图像解码方法的性能
	 * 参考 UpscalePanel 的可折叠卡片结构
	 */
	import { invoke } from '@tauri-apps/api/core';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Timer, ChevronUp, ChevronDown, ArrowUp, ArrowDown, FolderOpen, Copy, Check, Play, Trash2, Eye, Layers, ImageIcon } from '@lucide/svelte';
	import { settingsManager, type RendererMode } from '$lib/settings/settingsManager';
	import Viewer from 'viewerjs';
	import 'viewerjs/dist/viewer.css';
	import { visibilityMonitor, setMonitorEnabled } from '$lib/stores/visibilityMonitor.svelte';
	import { cardConfigStore } from '$lib/stores/cardConfig.svelte';

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

	type CardId = 'visibility' | 'latency' | 'renderer' | 'files' | 'detailed' | 'loadmode' | 'archives' | 'realworld' | 'results' | 'summary';

	interface RendererTestResult {
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
	
	/** 详细延迟分析结果 */
	interface DetailedLatencyResult {
		imagePath: string;
		imageSize: number; // bytes
		dimensions: { width: number; height: number } | null;
		loadMethod: 'ipc' | 'tempfile'; // 加载方式
		// 分步延迟 (ms)
		extractTime: number;      // 后端提取 / 临时文件提取
		ipcTransferTime: number;  // IPC 传输 (tempfile 模式为 0)
		blobCreateTime: number;   // Blob 创建 (tempfile 模式为 0)
		urlCreateTime: number;    // ObjectURL/convertFileSrc 创建
		decodeTime: number;       // 浏览器解码
		renderTime: number;       // DOM 渲染
		totalTime: number;        // 总时间
		success: boolean;
		error: string | null;
	}

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
	// 从 cardConfigStore 读取卡片配置
	const benchmarkCards = $derived(cardConfigStore.getPanelCards('benchmark'));
	
	// 获取卡片可见状态
	function isCardVisible(cardId: CardId): boolean {
		const card = benchmarkCards.find(c => c.id === cardId);
		return card?.visible ?? true;
	}
	
	// 获取卡片展开状态
	function isCardExpanded(cardId: CardId): boolean {
		const card = benchmarkCards.find(c => c.id === cardId);
		return card?.expanded ?? true;
	}
	
	// 切换卡片展开状态
	function toggleCardExpanded(cardId: CardId) {
		const card = benchmarkCards.find(c => c.id === cardId);
		if (card) {
			cardConfigStore.setCardExpanded('benchmark', cardId, !card.expanded);
		}
	}
	
	// showCards 兼容层（从 cardConfig 派生）
	const showCards = $derived.by(() => {
		const result: Record<CardId, boolean> = {} as Record<CardId, boolean>;
		for (const card of benchmarkCards) {
			result[card.id as CardId] = card.expanded;
		}
		return result;
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
	
	// 渲染模式测试状态
	let selectedRendererArchive = $state<string>('');
	let rendererTestResults = $state<RendererTestResult[]>([]);
	let isRendererTesting = $state(false);
	let rendererTestCount = $state<number>(10); // 测试图片数量
	
	// 详细延迟分析状态
	let selectedLatencyArchive = $state<string>('');
	let latencyResults = $state<DetailedLatencyResult[]>([]);
	let isLatencyTesting = $state(false);
	let latencyTestCount = $state<number>(5);
	
	// 设置状态
	let settings = $state(settingsManager.getSettings());
	settingsManager.addListener((s) => { settings = s; });
	let currentRendererMode = $derived(settings.view.renderer?.mode ?? 'stack');
	let viewerJSEnabled = $derived(settings.view.renderer?.useViewerJS ?? false);
	
	// ==================== 渲染模式测试 ====================
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
	
	async function runRendererTest() {
		if (!selectedRendererArchive) return;
		
		isRendererTesting = true;
		rendererTestResults = [];
		
		// 测试模式：原生渲染 和 ViewerJS 渲染
		const testModes = ['native', 'viewerjs'];
		
		try {
			// 获取压缩包中的图片列表
			const imageList = await invoke<string[]>('get_images_from_archive', {
				archivePath: selectedRendererArchive
			});
			
			if (imageList.length === 0) {
				for (const mode of testModes) {
					rendererTestResults = [...rendererTestResults, {
						mode,
						totalImages: 0,
						loadTimes: [],
						avgLoadTime: 0,
						switchTimes: [],
						avgSwitchTime: 0,
						fps: 0,
						success: false,
						error: '压缩包中没有图片'
					}];
				}
				isRendererTesting = false;
				return;
			}
			
			// 截取测试数量
			const testImages = imageList.slice(0, rendererTestCount);
			
			// 创建隐藏的测试容器
			const testContainer = document.createElement('div');
			testContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;overflow:hidden;';
			document.body.appendChild(testContainer);
			
			for (const mode of testModes) {
				try {
					const loadTimes: number[] = [];
					const switchTimes: number[] = [];
					
					// 测试每张图片的加载和渲染时间
					for (let i = 0; i < testImages.length; i++) {
						const startLoad = performance.now();
						
						// 从压缩包提取图片数据
						const imageData = await invoke<number[]>('load_image_from_archive', {
							archivePath: selectedRendererArchive,
							filePath: testImages[i]
						});
						
						// 创建 Blob 和 ObjectURL
						const blob = new Blob([new Uint8Array(imageData)]);
						const url = URL.createObjectURL(blob);
						
						if (mode === 'viewerjs') {
							// ViewerJS 渲染测试
							await new Promise<void>((resolve, reject) => {
								testContainer.innerHTML = '';
								const img = document.createElement('img');
								img.style.display = 'none';
								img.src = url;
								testContainer.appendChild(img);
								
								img.onload = () => {
									try {
										const viewer = new Viewer(img, {
											inline: true,
											navbar: false,
											toolbar: false,
											title: false,
											button: false,
											backdrop: false,
											transition: false,
											container: testContainer,
											ready: () => {
												viewer.destroy();
												URL.revokeObjectURL(url);
												resolve();
											}
										});
										viewer.show();
									} catch (e) {
										URL.revokeObjectURL(url);
										reject(e);
									}
								};
								img.onerror = () => {
									URL.revokeObjectURL(url);
									reject(new Error('图片加载失败'));
								};
							});
						} else {
							// 原生 img 渲染测试
							await new Promise<void>((resolve, reject) => {
								testContainer.innerHTML = '';
								const img = document.createElement('img');
								img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
								testContainer.appendChild(img);
								
								img.onload = () => {
									URL.revokeObjectURL(url);
									resolve();
								};
								img.onerror = () => {
									URL.revokeObjectURL(url);
									reject(new Error('图片加载失败'));
								};
								img.src = url;
							});
						}
						
						const loadTime = performance.now() - startLoad;
						loadTimes.push(loadTime);
						
						// 切换时间（从第二张开始记录）
						if (i > 0) {
							switchTimes.push(loadTime);
						}
					}
					
					const avgLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
					const avgSwitchTime = switchTimes.length > 0 
						? switchTimes.reduce((a, b) => a + b, 0) / switchTimes.length 
						: 0;
					const fps = 1000 / avgLoadTime;
					
					rendererTestResults = [...rendererTestResults, {
						mode,
						totalImages: loadTimes.length,
						loadTimes,
						avgLoadTime,
						switchTimes,
						avgSwitchTime,
						fps,
						success: true,
						error: null
					}];
					
				} catch (err) {
					rendererTestResults = [...rendererTestResults, {
						mode,
						totalImages: 0,
						loadTimes: [],
						avgLoadTime: 0,
						switchTimes: [],
						avgSwitchTime: 0,
						fps: 0,
						success: false,
						error: String(err)
					}];
				}
			}
			
			// 清理测试容器
			testContainer.remove();
		} catch (err) {
			// 获取图片列表失败
			for (const mode of testModes) {
				rendererTestResults = [...rendererTestResults, {
					mode,
					totalImages: 0,
					loadTimes: [],
					avgLoadTime: 0,
					switchTimes: [],
					avgSwitchTime: 0,
					fps: 0,
					success: false,
					error: `获取图片列表失败: ${err}`
				}];
			}
		}
		
		isRendererTesting = false;
	}
	
	function setRendererMode(mode: RendererMode) {
		const currentSettings = settingsManager.getSettings();
		settingsManager.updateSettings({
			view: {
				...currentSettings.view,
				renderer: {
					...currentSettings.view.renderer,
					mode
				}
			}
		});
	}
	
	function toggleViewerJS() {
		const currentSettings = settingsManager.getSettings();
		settingsManager.updateSettings({
			view: {
				...currentSettings.view,
				renderer: {
					mode: currentSettings.view.renderer?.mode ?? 'stack',
					useViewerJS: !viewerJSEnabled
				}
			}
		});
	}
	
	// ==================== 详细延迟分析 ====================
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
			// 获取图片列表
			const imageList = await invoke<string[]>('get_images_from_archive', {
				archivePath: selectedLatencyArchive
			});
			
			if (imageList.length === 0) {
				isLatencyTesting = false;
				return;
			}
			
			const testImages = imageList.slice(0, latencyTestCount);
			
			// 创建隐藏测试容器
			const testContainer = document.createElement('div');
			testContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;';
			document.body.appendChild(testContainer);
			
			// 对每种加载方式测试
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
							// IPC 方式：通过 invoke 传输数据
							const extractStart = performance.now();
							const imageData = await invoke<number[]>('load_image_from_archive', {
								archivePath: selectedLatencyArchive,
								filePath: imagePath
							});
							const extractEnd = performance.now();
							result.extractTime = extractEnd - extractStart;
							result.imageSize = imageData.length;
							
							// Blob 创建
							const blobStart = performance.now();
							const uint8Array = new Uint8Array(imageData);
							const blob = new Blob([uint8Array]);
							const blobEnd = performance.now();
							result.blobCreateTime = blobEnd - blobStart;
							
							// ObjectURL 创建
							const urlStart = performance.now();
							url = URL.createObjectURL(blob);
							const urlEnd = performance.now();
							result.urlCreateTime = urlEnd - urlStart;
						} else {
							// TempFile 方式：解压到临时文件，用 convertFileSrc 访问
							const extractStart = performance.now();
							const tempPath = await invoke<string>('extract_image_to_temp', {
								archivePath: selectedLatencyArchive,
								filePath: imagePath
							});
							const extractEnd = performance.now();
							result.extractTime = extractEnd - extractStart;
							
							// convertFileSrc（几乎无开销）
							const urlStart = performance.now();
							url = convertFileSrc(tempPath);
							const urlEnd = performance.now();
							result.urlCreateTime = urlEnd - urlStart;
						}
						
						// 浏览器解码 + DOM 渲染
						await new Promise<void>((resolve, reject) => {
							testContainer.innerHTML = '';
							const img = document.createElement('img');
							
							const decodeStart = performance.now();
							
							img.onload = () => {
								const decodeEnd = performance.now();
								result.decodeTime = decodeEnd - decodeStart;
								result.dimensions = { width: img.naturalWidth, height: img.naturalHeight };
								
								// 获取文件大小（tempfile 模式）
								if (loadMethod === 'tempfile' && result.imageSize === 0) {
									// 近似用解码后的数据估算
									result.imageSize = img.naturalWidth * img.naturalHeight * 0.1; // 粗略估计
								}
								
								// 触发渲染
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
	
	// 计算延迟统计（分方法统计）
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
		
		// 计算加速比
		const speedup = (ipc && temp && ipc.avgTotal > 0) 
			? (ipc.avgTotal / temp.avgTotal).toFixed(1) 
			: null;
		
		return { ipc, temp, speedup };
	}

	// ==================== 卡片操作 ====================
	function getCardOrder(cardId: CardId): number {
		const card = benchmarkCards.find(c => c.id === cardId);
		return card?.order ?? 0;
	}

	function canMoveCard(cardId: CardId, direction: 'up' | 'down'): boolean {
		const card = benchmarkCards.find(c => c.id === cardId);
		if (!card) return false;
		if (direction === 'up') return card.order > 0;
		return card.order < benchmarkCards.length - 1;
	}

	function moveCard(cardId: CardId, direction: 'up' | 'down') {
		const card = benchmarkCards.find(c => c.id === cardId);
		if (!card) return;
		const newOrder = direction === 'up' ? card.order - 1 : card.order + 1;
		cardConfigStore.moveCard('benchmark', cardId, newOrder);
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
			<!-- 可见范围监控卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('visibility')}`}
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Eye class="h-4 w-4 text-blue-500" />
						<div class="font-semibold text-sm">可见范围监控</div>
					</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('visibility')}
							title={showCards.visibility ? '收起' : '展开'}
						>
							{#if showCards.visibility}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('visibility', 'up')}
							disabled={!canMoveCard('visibility', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('visibility', 'down')}
							disabled={!canMoveCard('visibility', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.visibility}
					<div class="space-y-2">
						<!-- 开关按钮 -->
						<div class="flex items-center justify-between">
							<p class="text-[10px] text-muted-foreground">
								实时监控 VirtualizedFileListV2 的可见条目范围
							</p>
							<Button 
								variant={visibilityMonitor.enabled ? "default" : "outline"} 
								size="sm" 
								class="h-6 text-[10px] px-2"
								onclick={() => setMonitorEnabled(!visibilityMonitor.enabled)}
							>
								{visibilityMonitor.enabled ? '关闭监控' : '开启监控'}
							</Button>
						</div>
						
						{#if !visibilityMonitor.enabled}
							<div class="text-[10px] text-muted-foreground text-center py-4 border rounded bg-muted/20">
								⏸️ 监控已关闭，点击上方按钮开启
							</div>
						{:else if visibilityMonitor.info.totalItems > 0}
							<div class="border rounded p-2 space-y-2 text-[10px]">
								<!-- 当前路径 -->
								<div class="text-muted-foreground truncate" title={visibilityMonitor.info.currentPath}>
									📁 {visibilityMonitor.info.currentPath.split(/[/\\]/).pop() || '根目录'}
								</div>
								
								<!-- 基本信息网格 -->
								<div class="grid grid-cols-2 gap-x-4 gap-y-1">
									<div>总条目: <span class="font-mono text-blue-500">{visibilityMonitor.info.totalItems}</span></div>
									<div>选中: <span class="font-mono text-green-500">{visibilityMonitor.info.selectedIndex >= 0 ? visibilityMonitor.info.selectedIndex : '-'}</span></div>
									<div>列数: <span class="font-mono">{visibilityMonitor.info.columns}</span></div>
									<div>行数: <span class="font-mono">{visibilityMonitor.info.rowCount}</span></div>
								</div>
								
								<!-- 可见范围 -->
								<div class="border-t pt-2 mt-2">
									<div class="font-medium mb-1">可见范围</div>
									<div class="grid grid-cols-2 gap-x-4 gap-y-1">
										<div>条目: <span class="font-mono text-purple-500">{visibilityMonitor.info.visibleStart}</span> - <span class="font-mono text-purple-500">{visibilityMonitor.info.visibleEnd}</span></div>
										<div>数量: <span class="font-mono text-orange-500">{visibilityMonitor.info.visibleCount}</span></div>
										<div>行: <span class="font-mono text-cyan-500">{visibilityMonitor.info.visibleRowStart}</span> - <span class="font-mono text-cyan-500">{visibilityMonitor.info.visibleRowEnd}</span></div>
										<div>进度: <span class="font-mono text-pink-500">{(visibilityMonitor.info.scrollProgress * 100).toFixed(1)}%</span></div>
									</div>
								</div>

								<!-- 进度条可视化 -->
								<div class="border-t pt-2 mt-2">
									<div class="font-medium mb-1">滚动位置</div>
									<div class="relative h-4 bg-muted rounded overflow-hidden">
										<!-- 可见区域指示器 -->
										<div 
											class="absolute h-full bg-blue-500/50 transition-all duration-100"
											style="left: {(visibilityMonitor.info.visibleStart / Math.max(visibilityMonitor.info.totalItems, 1)) * 100}%; width: {Math.max((visibilityMonitor.info.visibleCount / Math.max(visibilityMonitor.info.totalItems, 1)) * 100, 2)}%"
										></div>
										<!-- 选中位置指示器 -->
										{#if visibilityMonitor.info.selectedIndex >= 0}
											<div 
												class="absolute h-full w-0.5 bg-green-500 transition-all duration-100"
												style="left: {(visibilityMonitor.info.selectedIndex / Math.max(visibilityMonitor.info.totalItems, 1)) * 100}%"
											></div>
										{/if}
									</div>
									<div class="flex justify-between text-[8px] text-muted-foreground mt-0.5">
										<span>0</span>
										<span>{visibilityMonitor.info.totalItems - 1}</span>
									</div>
								</div>
								
								<!-- 更新频率 -->
								<div class="text-[9px] text-muted-foreground text-right">
									更新频率: {visibilityMonitor.updateFrequency.toFixed(1)} 次/秒
								</div>
							</div>
						{:else}
							<div class="text-[10px] text-muted-foreground text-center py-4 border rounded">
								📭 暂无数据，请在文件夹面板中浏览文件
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- 延迟分析卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('latency')}`}
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Timer class="h-4 w-4 text-red-500" />
						<div class="font-semibold text-sm">延迟分析</div>
					</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('latency')}
							title={showCards.latency ? '收起' : '展开'}
						>
							{#if showCards.latency}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('latency', 'up')}
							disabled={!canMoveCard('latency', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('latency', 'down')}
							disabled={!canMoveCard('latency', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.latency}
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
						</div>
						
						{#if selectedLatencyArchive}
							<div class="text-[10px] text-muted-foreground truncate">
								{selectedLatencyArchive.split(/[/\\]/).pop()}
							</div>
						{/if}
						
						<!-- 测试数量 -->
						<div class="flex items-center gap-2 text-[10px]">
							<span class="text-muted-foreground">测试图片数:</span>
							<select class="h-6 px-2 rounded border bg-background text-[10px]" bind:value={latencyTestCount}>
								<option value={3}>3张</option>
								<option value={5}>5张</option>
								<option value={10}>10张</option>
							</select>
						</div>
						
						<!-- 统计结果 -->
						{#if latencyResults.length > 0}
						{@const stats = getLatencyStats()}
						{#if stats}
							<!-- 对比总结 -->
							{#if stats.ipc && stats.temp}
								<div class="border-2 border-green-500/50 rounded p-2 bg-green-500/5">
									<div class="flex items-center justify-between text-[10px]">
										<span class="font-medium">🚀 TempFile 加速比:</span>
										<span class="font-mono text-green-500 font-bold text-sm">{stats.speedup}x</span>
									</div>
									<div class="text-[9px] text-muted-foreground mt-1">
										IPC: {stats.ipc.avgTotal.toFixed(0)}ms → TempFile: {stats.temp.avgTotal.toFixed(0)}ms
									</div>
								</div>
							{/if}
							
							<!-- IPC 方式统计 -->
							{#if stats.ipc}
								<div class="border rounded p-2 space-y-2 border-red-500/30">
									<div class="flex items-center justify-between text-[10px]">
										<span class="font-medium text-red-500">📦 IPC 传输</span>
										<span class="font-mono {stats.ipc.avgTotal <= 16 ? 'text-green-500' : 'text-red-500'}">
											{stats.ipc.avgTotal.toFixed(0)}ms
											{#if stats.ipc.avgTotal > 16}
												❌ {(stats.ipc.avgTotal / 16).toFixed(1)}x
											{/if}
										</span>
									</div>
									<div class="grid grid-cols-3 gap-1 text-[9px]">
										<div>提取+IPC: <span class="font-mono text-red-500">{stats.ipc.avgExtract.toFixed(0)}ms</span></div>
										<div>Blob: <span class="font-mono">{stats.ipc.avgBlob.toFixed(1)}ms</span></div>
										<div>解码: <span class="font-mono">{stats.ipc.avgDecode.toFixed(0)}ms</span></div>
									</div>
								</div>
							{/if}
							
							<!-- TempFile 方式统计 -->
							{#if stats.temp}
								<div class="border rounded p-2 space-y-2 border-green-500/30">
									<div class="flex items-center justify-between text-[10px]">
										<span class="font-medium text-green-500">📁 TempFile + convertFileSrc</span>
										<span class="font-mono {stats.temp.avgTotal <= 16 ? 'text-green-500' : stats.temp.avgTotal <= 33 ? 'text-yellow-500' : 'text-red-500'}">
											{stats.temp.avgTotal.toFixed(0)}ms
											{#if stats.temp.avgTotal <= 16}
												✅ 达标
											{:else if stats.temp.avgTotal <= 33}
												⚠️ 30fps
											{:else}
												❌ {(stats.temp.avgTotal / 16).toFixed(1)}x
											{/if}
										</span>
									</div>
									<div class="grid grid-cols-3 gap-1 text-[9px]">
										<div>提取: <span class="font-mono text-orange-500">{stats.temp.avgExtract.toFixed(0)}ms</span></div>
										<div>URL: <span class="font-mono">{stats.temp.avgUrl.toFixed(2)}ms</span></div>
										<div>解码: <span class="font-mono text-blue-500">{stats.temp.avgDecode.toFixed(0)}ms</span></div>
									</div>
								</div>
							{/if}
						{/if}
						{/if}
						
						<!-- 详细结果列表 -->
						{#if latencyResults.length > 0}
							<div class="space-y-1">
								<div class="text-[9px] text-muted-foreground">详细结果:</div>
								<div class="max-h-32 overflow-auto space-y-1">
									{#each latencyResults as result, i}
										<div class="border rounded p-1.5 text-[9px] {result.success ? '' : 'border-red-500/50'}">
											<div class="flex justify-between">
												<span class="truncate max-w-[120px]" title={result.imagePath}>
													{i + 1}. {result.imagePath.split(/[/\\]/).pop()}
												</span>
												<span class="font-mono {result.totalTime <= 16 ? 'text-green-500' : 'text-red-500'}">
													{result.totalTime.toFixed(0)}ms
												</span>
											</div>
											{#if result.success && result.dimensions}
												<div class="text-muted-foreground">
													{result.dimensions.width}×{result.dimensions.height} · {(result.imageSize / 1024).toFixed(0)}KB
												</div>
											{:else if result.error}
												<div class="text-red-400 truncate">{result.error}</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- 渲染模式测试卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('renderer')}`}
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Layers class="h-4 w-4 text-purple-500" />
						<div class="font-semibold text-sm">渲染模式测试</div>
					</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('renderer')}
							title={showCards.renderer ? '收起' : '展开'}
						>
							{#if showCards.renderer}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('renderer', 'up')}
							disabled={!canMoveCard('renderer', 'up')}
						>
							<ArrowUp class="h-3 w-3" />
						</button>
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
							onclick={() => moveCard('renderer', 'down')}
							disabled={!canMoveCard('renderer', 'down')}
						>
							<ArrowDown class="h-3 w-3" />
						</button>
					</div>
				</div>

				{#if showCards.renderer}
					<div class="space-y-3">
						<!-- 说明 -->
						<p class="text-[10px] text-muted-foreground">
							对比原生 IMG 渲染 vs ViewerJS 渲染的加载性能
						</p>
						
						<!-- 应用设置 -->
						<div class="border rounded p-2 space-y-2">
							<div class="text-[10px] text-muted-foreground">应用渲染设置:</div>
							<div class="flex items-center justify-between">
								<div class="flex gap-1">
									<Button 
										variant={currentRendererMode === 'standard' ? 'default' : 'outline'}
										size="sm"
										class="h-6 text-[10px] px-2"
										onclick={() => setRendererMode('standard')}
									>
										Standard
									</Button>
									<Button 
										variant={currentRendererMode === 'stack' ? 'default' : 'outline'}
										size="sm"
										class="h-6 text-[10px] px-2"
										onclick={() => setRendererMode('stack')}
									>
										Stack
									</Button>
								</div>
								<Button 
									variant={viewerJSEnabled ? 'default' : 'outline'}
									size="sm"
									class="h-6 text-[10px] px-2"
									onclick={toggleViewerJS}
								>
									{viewerJSEnabled ? '✓ ViewerJS' : 'ViewerJS'}
								</Button>
							</div>
						</div>
						
						<!-- 选择压缩包 -->
						<div class="flex gap-2">
							<Button onclick={selectRendererArchive} variant="outline" size="sm" class="flex-1 text-xs">
								<FolderOpen class="h-3 w-3 mr-1" />
								{selectedRendererArchive ? '已选择' : '选择压缩包'}
							</Button>
							<Button
								onclick={runRendererTest}
								disabled={isRendererTesting || !selectedRendererArchive}
								size="sm"
								class="flex-1 text-xs"
							>
								<Play class="h-3 w-3 mr-1" />
								{isRendererTesting ? '测试中...' : '开始测试'}
							</Button>
						</div>
						
						{#if selectedRendererArchive}
							<div class="text-[10px] text-muted-foreground truncate">
								{selectedRendererArchive.split(/[/\\]/).pop()}
							</div>
						{/if}
						
						<!-- 测试数量选择 -->
						<div class="flex items-center gap-2 text-[10px]">
							<span class="text-muted-foreground">测试图片数:</span>
							<select 
								class="h-6 px-2 rounded border bg-background text-[10px]"
								bind:value={rendererTestCount}
							>
								<option value={5}>5张</option>
								<option value={10}>10张</option>
								<option value={20}>20张</option>
								<option value={50}>50张</option>
							</select>
						</div>
						
						<!-- 测试结果 -->
						{#if rendererTestResults.length > 0}
							<div class="space-y-2">
								<div class="font-medium text-[10px] text-muted-foreground">测试结果:</div>
								{#each rendererTestResults as result}
									<div class="border rounded p-2 space-y-1 text-[10px]">
										<div class="flex items-center justify-between">
											<span class="font-medium {result.mode === 'viewerjs' ? 'text-purple-500' : 'text-blue-500'}">
												{result.mode === 'native' ? '原生 IMG' : 'ViewerJS'}
											</span>
											{#if result.success}
												<span class="text-green-500">✅</span>
											{:else}
												<span class="text-red-500">❌</span>
											{/if}
										</div>
										
										{#if result.success}
											<div class="grid grid-cols-2 gap-x-4 gap-y-1">
												<div>图片数: <span class="font-mono text-purple-500">{result.totalImages}</span></div>
												<div>FPS: <span class="font-mono text-orange-500">{result.fps.toFixed(1)}</span></div>
												<div>平均加载: <span class="font-mono text-cyan-500">{result.avgLoadTime.toFixed(1)}ms</span></div>
												<div>平均切换: <span class="font-mono text-pink-500">{result.avgSwitchTime.toFixed(1)}ms</span></div>
											</div>
											
											<!-- 加载时间分布 -->
											<div class="mt-1">
												<div class="text-[9px] text-muted-foreground mb-1">加载时间分布:</div>
												<div class="flex gap-0.5 h-4">
													{#each result.loadTimes as time, i}
														{@const maxTime = Math.max(...result.loadTimes)}
														{@const height = (time / maxTime) * 100}
														<div 
															class="flex-1 bg-blue-500/50 rounded-t"
															style="height: {height}%"
															title="{i+1}: {time.toFixed(1)}ms"
														></div>
													{/each}
												</div>
											</div>
										{:else}
											<div class="text-red-400">{result.error}</div>
										{/if}
									</div>
								{/each}
								
								<!-- 对比结论 -->
								{#if rendererTestResults.length >= 2 && rendererTestResults.every(r => r.success)}
									{@const native = rendererTestResults.find(r => r.mode === 'native')}
									{@const viewerjs = rendererTestResults.find(r => r.mode === 'viewerjs')}
									{#if native && viewerjs}
										{@const faster = native.avgLoadTime < viewerjs.avgLoadTime ? 'native' : 'viewerjs'}
										{@const diff = Math.abs(native.avgLoadTime - viewerjs.avgLoadTime)}
										{@const percent = ((diff / Math.max(native.avgLoadTime, viewerjs.avgLoadTime)) * 100).toFixed(1)}
										<div class="border-t pt-2 mt-2 text-[10px]">
											<div class="font-medium text-muted-foreground">结论:</div>
											<div class="mt-1">
												<span class="{faster === 'viewerjs' ? 'text-purple-500' : 'text-blue-500'} font-medium">
													{faster === 'native' ? '原生 IMG' : 'ViewerJS'}
												</span>
												更快，领先 
												<span class="font-mono text-orange-500">{diff.toFixed(1)}ms</span>
												({percent}%)
											</div>
											<div class="mt-1 text-muted-foreground">
												ViewerJS 开销: <span class="font-mono text-orange-500">+{(viewerjs.avgLoadTime - native.avgLoadTime).toFixed(1)}ms</span>
												({((viewerjs.avgLoadTime / native.avgLoadTime - 1) * 100).toFixed(1)}%)
											</div>
										</div>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- 文件选择卡片 -->
			<div
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('files')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">测试文件</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('files')}
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
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('detailed')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">详细对比测试</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('detailed')}
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
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('loadmode')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">Raw vs Bitmap</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('loadmode')}
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
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('archives')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">压缩包测试</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('archives')}
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
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('realworld')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">真实场景测试</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('realworld')}
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
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('results')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">测试结果</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('results')}
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
				class="rounded-lg border bg-muted/10 p-3 space-y-3 transition-all hover:border-primary/60"
				style={`order: ${getCardOrder('summary')}`}
			>
				<div class="flex items-center justify-between">
					<div class="font-semibold text-sm">性能统计</div>
					<div class="flex items-center gap-1 text-[10px]">
						<button
							type="button"
							class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							onclick={() => toggleCardExpanded('summary')}
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
