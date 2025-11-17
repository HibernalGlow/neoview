<script lang="ts">
	/**
	 * Thumbnails Panel
	 * 缩略图面板 - 网格显示所有页面缩略图
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Progress from '$lib/components/ui/progress';
import { Image as ImageIcon, Grid3x3, Grid2x2, LayoutGrid, Loader2, AlertCircle, TestTube, CheckCircle, XCircle, Database, FolderOpen } from '@lucide/svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import { onMount } from 'svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	// TODO: 缩略图测试功能已移除，待重新实现
	// import { runThumbnailTests } from '$lib/utils/thumbnail-test';

	interface Thumbnail {
		index: number;
		name: string;
		imageUrl: string; // file:// URL or base64
		loading: boolean;
		error: boolean;
		pagePath: string; // 页面路径
	}

	// 缩略图数据 - 从 store 获取并动态生成缩略图
	let thumbnails = $state<Thumbnail[]>([]);
	let currentPath = $state<string>(''); // 当前查看的路径

	let currentPage = $state(1);
	let gridSize = $state<'small' | 'medium' | 'large'>('medium');

	// 测试相关状态
	let isTesting = $state(false);
	let testResults = $state<any[]>([]);
	let showTestResults = $state(false);

	// 索引相关状态
	let isIndexing = $state(false);
	let indexingProgress = $state(0);
	let indexingTotal = $state(0);
	let indexingCurrent = $state('');
	let showIndexingProgress = $state(false);
	let selectedFolder = $state(''); // 选择的文件夹路径

	// 自动扫描状态
	let isScanningFolder = $state(false);
	let scanError = $state('');
	let unindexedFiles = $state<string[]>([]);
	let unindexedFolders = $state<string[]>([]);
	let unindexedArchives = $state<string[]>([]);

	const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'avif', 'jxl', 'tiff', 'tif'];

	function getFileExtension(path: string): string {
		const parts = path.toLowerCase().split('.');
		return parts.length > 1 ? parts.pop() || '' : '';
	}

	function getTotalUnindexedItems() {
		return unindexedFiles.length + unindexedFolders.length + unindexedArchives.length;
	}

	// 缩略图尺寸
	const gridSizes = {
		small: 'w-20 h-28',
		medium: 'w-28 h-40',
		large: 'w-36 h-52'
	};

	async function loadThumbnails(path: string) {
		currentPath = path;
		
		if (!bookStore.currentBook || !bookStore.currentBook.pages) {
			thumbnails = [];
			return;
		}
		
		try {
			// 从当前书籍获取页面列表
			const pages = bookStore.currentBook.pages;
			
			thumbnails = pages.map((page: any, index: number) => ({
				index: index + 1,
				name: page.name || `Page ${index + 1}`,
				imageUrl: '', // 将在 loadThumbnail 中加载
				loading: true,
				error: false,
				pagePath: page.path
			}));
			
			// 并行加载缩略图
			loadAllThumbnails();
		} catch (error) {
			console.error('加载缩略图失败:', error);
		}
	}

	async function loadThumbnail(thumb: Thumbnail, filePath: string) {
		thumb.loading = true;
		thumb.error = false;
		
		try {
			// 调用 Tauri 命令生成缩略图
			const thumbnailUrl = await invoke<string>('generate_file_thumbnail_new', { filePath });
			thumb.imageUrl = thumbnailUrl;
		} catch (error) {
			console.error(`生成缩略图失败 ${filePath}:`, error);
			thumb.error = true;
		} finally {
			thumb.loading = false;
		}
	}

	async function loadAllThumbnails() {
		// 限制并发加载的缩略图数量
		const concurrency = 6;
		const chunks = [];
		
		for (let i = 0; i < thumbnails.length; i += concurrency) {
			chunks.push(thumbnails.slice(i, i + concurrency));
		}
		
		for (const chunk of chunks) {
			await Promise.all(
				chunk.map((thumb) => {
					return loadThumbnail(thumb, thumb.pagePath);
				})
			);
		}
	}

	function goToPage(index: number) {
		currentPage = index;
		// 跳转到指定页面
		bookStore.navigateToPage(index - 1);
	}

	function setGridSize(size: 'small' | 'medium' | 'large') {
		gridSize = size;
	}

	async function runTests() {
		isTesting = true;
		showTestResults = true;
		testResults = []; // 重置结果

		try {
			// TODO: 缩略图测试功能已移除，待重新实现
			// const results = await runThumbnailTests();
			testResults = [];
			console.warn('缩略图测试功能已移除，待重新实现');
		} catch (error) {
			console.error('测试运行失败:', error);
			testResults = [{
				name: '测试执行失败',
				success: false,
				message: error instanceof Error ? error.message : '未知错误',
				duration: 0
			}];
		} finally {
			isTesting = false;
		}
	}

	async function selectFolder() {
		try {
			const selected = await open({
				directory: true,
				multiple: false,
				title: '选择要索引的文件夹'
			});
			
		if (selected) {
			selectedFolder = selected;
			console.log('选择的文件夹:', selectedFolder);
			unindexedFiles = [];
			unindexedFolders = [];
			unindexedArchives = [];
			await scanSelectedFolder(selected);
		}
		} catch (error) {
			console.error('选择文件夹失败:', error);
		}
	}

	async function scanSelectedFolder(path: string) {
		isScanningFolder = true;
		scanError = '';
		try {
			console.log('🔍 自动扫描未索引项目:', path);
			const result = await invoke('get_unindexed_files', {
				rootPath: path
			});

			const { files = [], folders = [], archives = [] } = result as {
				files?: string[];
				folders?: string[];
				archives?: string[];
			};

			unindexedFiles = files;
			unindexedFolders = folders;
			unindexedArchives = archives;

			console.log(
				`📊 扫描完成: 文件 ${files.length}, 文件夹 ${folders.length}, 压缩包 ${archives.length}`
			);
		} catch (error) {
			console.error('扫描未索引项目失败:', error);
			scanError = error instanceof Error ? error.message : String(error);
			unindexedFiles = [];
			unindexedFolders = [];
			unindexedArchives = [];
		} finally {
			isScanningFolder = false;
		}
	}

	async function startIndexing() {
		if (!selectedFolder) {
			console.error('请先选择要索引的文件夹');
			return;
		}

		if (isScanningFolder) {
			console.warn('正在扫描未索引项目，请稍后重试');
			return;
		}

		if (getTotalUnindexedItems() === 0) {
			await scanSelectedFolder(selectedFolder);
			if (getTotalUnindexedItems() === 0) {
				indexingCurrent = '没有需要索引的项目';
				console.log('✅ 所有项目均已索引');
				return;
			}
		}

		isIndexing = true;
		showIndexingProgress = true;
		indexingProgress = 0;
		indexingTotal = 0;
		indexingCurrent = '准备中...';

		try {
			const imageFiles = [...unindexedFiles];
			const archiveFiles = [...unindexedArchives];
			const folders = [...unindexedFolders];

			indexingTotal = imageFiles.length + archiveFiles.length + folders.length;

			console.log(
				`📁 待处理 => 图片: ${imageFiles.length}, 压缩包: ${archiveFiles.length}, 文件夹: ${folders.length}`
			);

			if (indexingTotal === 0) {
				indexingCurrent = '没有需要索引的项目';
				console.log('✅ 所有项目已索引完成');
				return;
			}

			indexingCurrent = '开始生成缩略图...';
			console.log('⚡ 开始批量生成缩略图...');

			let processedCount = 0;
			const batchSize = 20; // 每批处理20个，充分利用CPU
			let successCount = 0;
			let errorCount = 0;

			const processBatch = async (
				items: string[],
				label: string,
				handler: (path: string) => Promise<boolean>
			) => {
				for (let i = 0; i < items.length; i += batchSize) {
					const batch = items.slice(i, i + batchSize);
					const displayName = batch[0]?.split('\\').pop() || `批次 ${Math.floor(i / batchSize) + 1}`;
					indexingCurrent = `处理${label}: ${displayName}... (${Math.min(i + 1, items.length)}/${items.length})`;

					const results = await Promise.all(
						batch.map(async (item) => {
							try {
								return await handler(item);
							} catch (error) {
								console.error(`处理${label}失败 ${item}:`, error);
								return false;
							}
						})
					);

					results.forEach((success) => {
						if (success) successCount++;
						else errorCount++;
					});

					processedCount += batch.length;
					indexingProgress = processedCount;
				}
			};

			await processBatch(archiveFiles, '压缩包', async (item) => {
				await invoke('generate_archive_thumbnail_new', { archivePath: item });
				return true;
			});

			await processBatch(imageFiles, '图片', async (item) => {
				const ext = getFileExtension(item);
				if (!imageExtensions.includes(ext)) {
					console.warn('跳过非图片文件:', item);
					return true;
				}
				await invoke('generate_file_thumbnail_new', { filePath: item });
				return true;
			});

			// 处理文件夹（复用内部文件缩略图逻辑）
			for (let i = 0; i < folders.length; i++) {
				const folder = folders[i];
				const fileName = folder.split('\\').pop() || folder;
				indexingCurrent = `处理文件夹: ${fileName}... (${i + 1}/${folders.length})`;

				try {
					await invoke('load_thumbnail_from_db', {
						path: folder,
						size: 0,
						ghash: 0,
						category: 'folder'
					});
					successCount++;
				} catch (error) {
					console.error('处理文件夹失败:', error);
					errorCount++;
				}

				processedCount += 1;
				indexingProgress = processedCount;
			}

			console.log(`🎉 索引完成! 成功: ${successCount}, 失败: ${errorCount}`);
			indexingCurrent = `索引完成 (成功: ${successCount}, 失败: ${errorCount})`;

			// 索引完成后自动重新扫描
			await scanSelectedFolder(selectedFolder);
		} catch (error) {
			console.error('💥 索引过程出错:', error);
			indexingCurrent = `索引出错: ${error instanceof Error ? error.message : '未知错误'}`;
		} finally {
			isIndexing = false;
			// 3秒后隐藏进度条
			setTimeout(() => {
				showIndexingProgress = false;
			}, 3000);
		}
	}

	// 初始化缩略图管理器
	onMount(async () => {
		try {
			// 初始化缩略图管理器
			await invoke('init_thumbnail_manager', {
				thumbnailPath: 'D:\\temp\\neoview_thumbnails',
				rootPath: 'D:\\',
				size: 256
			});
		} catch (error) {
			console.error('初始化缩略图管理器失败:', error);
		}
	});

	// 监听当前书籍变化
	$effect(() => {
		if (bookStore.currentBook && bookStore.currentBook.path) {
			loadThumbnails(bookStore.currentBook.path);
		}
	});
</script>

<div class="h-full flex flex-col bg-background">
	<!-- 头部 -->
	<div class="p-3 border-b space-y-2">
		<div class="flex items-center justify-between">
			<h3 class="text-sm font-semibold flex items-center gap-2">
				<LayoutGrid class="h-4 w-4" />
				缩略图 ({thumbnails.length})
			</h3>
			<div class="flex items-center gap-1">
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2 text-xs"
					onclick={selectFolder}
					disabled={isIndexing}
					title="选择要索引的文件夹"
				>
					<FolderOpen class="h-3 w-3 mr-1" />
					选择文件夹
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2 text-xs"
					onclick={startIndexing}
					disabled={isIndexing || !selectedFolder || isScanningFolder}
				>
					{#if isIndexing}
						<Loader2 class="h-3 w-3 mr-1 animate-spin" />
						索引中...
					{:else}
						<Database class="h-3 w-3 mr-1" />
						一键索引
					{/if}
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2 text-xs"
					onclick={runTests}
					disabled={isTesting}
				>
					{#if isTesting}
						<Loader2 class="h-3 w-3 mr-1 animate-spin" />
						测试中...
					{:else}
						<TestTube class="h-3 w-3 mr-1" />
						测试
					{/if}
				</Button>
			</div>
		</div>

		<!-- 选择的文件夹显示 -->
		{#if selectedFolder}
			<div class="text-[10px] text-muted-foreground px-1 space-y-1">
				<div class="truncate">📁 {selectedFolder}</div>
				{#if isScanningFolder}
					<div class="flex items-center gap-1 text-primary">
						<Loader2 class="h-3 w-3 animate-spin" />
						<span>扫描未索引项目中...</span>
					</div>
				{:else if scanError}
					<div class="text-destructive">扫描失败: {scanError}</div>
				{:else}
					<div class="flex items-center gap-2 flex-wrap">
						<span>
							未索引 - 图片 {unindexedFiles.length} | 压缩包 {unindexedArchives.length} | 文件夹 {unindexedFolders.length}
						</span>
						<Button
							variant="ghost"
							size="sm"
							class="h-5 px-2 text-[10px]"
							onclick={() => selectedFolder && scanSelectedFolder(selectedFolder)}
							disabled={isIndexing || isScanningFolder}
						>
							重新扫描
						</Button>
					</div>
					{#if getTotalUnindexedItems() === 0}
						<div class="text-muted-foreground">所有项目已索引</div>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- 索引进度条 -->
		{#if showIndexingProgress && isIndexing}
			<div class="space-y-1">
				<div class="flex items-center justify-between text-[10px] text-muted-foreground">
					<span>正在索引: {indexingCurrent}</span>
					<span>{indexingProgress}/{indexingTotal}</span>
				</div>
				<Progress.Root
					value={indexingTotal ? (indexingProgress / indexingTotal) * 100 : 0}
					class="h-2"
				/>
			</div>
		{/if}

		<!-- 网格尺寸控制 -->
		<div class="flex items-center gap-1">
			<Label class="text-[10px] text-muted-foreground mr-1">尺寸</Label>
			<Button
				variant={gridSize === 'small' ? 'default' : 'outline'}
				size="icon"
				class="h-6 w-6"
				onclick={() => setGridSize('small')}
				title="小"
			>
				<Grid3x3 class="h-3 w-3" />
			</Button>
			<Button
				variant={gridSize === 'medium' ? 'default' : 'outline'}
				size="icon"
				class="h-6 w-6"
				onclick={() => setGridSize('medium')}
				title="中"
			>
				<Grid2x2 class="h-3 w-3" />
			</Button>
			<Button
				variant={gridSize === 'large' ? 'default' : 'outline'}
				size="icon"
				class="h-6 w-6"
				onclick={() => setGridSize('large')}
				title="大"
			>
				<LayoutGrid class="h-3 w-3" />
			</Button>
		</div>
	</div>

	<!-- 测试结果 -->
	{#if showTestResults && testResults.length > 0}
		<div class="px-3 pb-2 border-b">
			<div class="flex items-center justify-between mb-2">
				<h4 class="text-xs font-semibold">测试结果</h4>
				<Button
					variant="ghost"
					size="sm"
					class="h-5 px-2 text-xs"
					onclick={() => showTestResults = false}
				>
					关闭
				</Button>
			</div>
			<div class="space-y-1 max-h-32 overflow-y-auto">
				{#each testResults as result}
					<div class="flex items-center gap-2 text-xs">
						{#if result.success}
							<CheckCircle class="h-3 w-3 text-green-500 flex-shrink-0" />
						{:else}
							<XCircle class="h-3 w-3 text-red-500 flex-shrink-0" />
						{/if}
						<span class="truncate">{result.name}</span>
						{#if result.duration}
							<span class="text-muted-foreground ml-auto">({result.duration}ms)</span>
						{/if}
					</div>
					{#if !result.success && result.message}
						<div class="text-xs text-red-600 ml-5 truncate">
							{result.message}
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	<!-- 缩略图网格 -->
	<div class="flex-1 overflow-y-auto p-2">
		<div
			class="grid gap-2 {gridSize === 'small'
				? 'grid-cols-3'
				: gridSize === 'medium'
					? 'grid-cols-2'
					: 'grid-cols-1'}"
		>
			{#each thumbnails as thumb}
				<button
					class="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-accent transition-colors {currentPage ===
					thumb.index
						? 'bg-primary/10 border-2 border-primary'
						: 'border border-transparent'}"
					onclick={() => goToPage(thumb.index)}
				>
					<!-- 缩略图 -->
					<div
						class="{gridSizes[
							gridSize
						]} rounded bg-muted flex items-center justify-center overflow-hidden relative"
					>
						{#if thumb.loading}
							<Loader2 class="h-6 w-6 text-muted-foreground animate-spin" />
						{:else if thumb.error}
							<AlertCircle class="h-6 w-6 text-destructive" />
						{:else if thumb.imageUrl}
							<img 
								src={thumb.imageUrl} 
								alt={thumb.name} 
								class="absolute inset-0 w-full h-full object-contain" 
								onerror={() => {
									thumb.error = true;
									thumb.loading = false;
								}}
							/>
						{:else}
							<!-- 占位图标 -->
							<ImageIcon class="h-8 w-8 text-muted-foreground" />
						{/if}
					</div>

					<!-- 页面编号 -->
					<div class="text-[10px] font-mono font-semibold text-primary">#{thumb.index}</div>

					<!-- 文件名（仅大尺寸显示） -->
					{#if gridSize === 'large'}
						<div class="text-[9px] text-muted-foreground truncate w-full text-center">
							{thumb.name}
						</div>
					{/if}

					<!-- 当前页标记 -->
					{#if currentPage === thumb.index}
						<div
							class="absolute top-1 right-1 px-1.5 py-0.5 text-[9px] font-semibold bg-primary text-primary-foreground rounded"
						>
							当前
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- 底部提示 -->
	<div class="p-2 border-t text-[10px] text-muted-foreground text-center">
		点击缩略图跳转到对应页面
	</div>
</div>

<style>
	button {
		position: relative;
	}
</style>