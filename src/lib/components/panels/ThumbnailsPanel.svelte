<script lang="ts">
	/**
	 * Thumbnails Panel
	 * 缩略图面板 - 网格显示所有页面缩略图
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Progress from '$lib/components/ui/progress';
	import { Image as ImageIcon, Grid3x3, Grid2x2, LayoutGrid, Loader2, AlertCircle, TestTube, CheckCircle, XCircle, Database, Play, FolderOpen } from '@lucide/svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import { onMount } from 'svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { runThumbnailTests } from '$lib/utils/thumbnail-test';

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
			const thumbnailUrl = await invoke('generate_file_thumbnail_new', { filePath });
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
			const results = await runThumbnailTests();
			testResults = results || [];
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
			}
		} catch (error) {
			console.error('选择文件夹失败:', error);
		}
	}

	async function startIndexing() {
		if (!selectedFolder) {
			console.error('请先选择要索引的文件夹');
			return;
		}

		isIndexing = true;
		showIndexingProgress = true;
		indexingProgress = 0;
		indexingTotal = 0;
		indexingCurrent = '准备中...';

		try {
			console.log('🚀 开始获取未索引文件列表...');
			indexingCurrent = '扫描文件中...';
			
			// 获取需要索引的文件和文件夹列表
			const result = await invoke('get_unindexed_files', {
				rootPath: selectedFolder // 使用选择的文件夹路径
			});
			
			console.log('📋 获取到索引结果:', result);
			
			const { files, folders } = result as { files: string[], folders: string[] };
			const allItems = [...files, ...folders];
			indexingTotal = allItems.length;
			
			console.log(`📁 找到 ${files.length} 个文件, ${folders.length} 个文件夹, 总计 ${indexingTotal} 个项目`);
			
			if (indexingTotal === 0) {
				indexingCurrent = '没有需要索引的项目';
				console.log('✅ 所有文件已索引完成');
				return;
			}

			indexingCurrent = '开始生成缩略图...';
			console.log('⚡ 开始批量生成缩略图...');

			// 批量处理 - 并发处理提高速度
			const batchSize = 5; // 每批处理5个
			let successCount = 0;
			let errorCount = 0;

			for (let i = 0; i < allItems.length; i += batchSize) {
				const batch = allItems.slice(i, i + batchSize);
				console.log(`📦 处理批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(allItems.length/batchSize)}, 包含 ${batch.length} 个项目`);
				
				// 并发处理当前批次
				const promises = batch.map(async (item) => {
					const fileName = item.split('\\').pop() || item;
					indexingCurrent = fileName;
					
					try {
						console.log(`🖼️ 生成缩略图: ${fileName}`);
						// 调用后端生成缩略图
						await invoke('generate_file_thumbnail_new', { filePath: item });
						console.log(`✅ 缩略图生成成功: ${fileName}`);
						return { success: true, item };
					} catch (error) {
						console.error(`❌ 索引失败 ${fileName}:`, error);
						return { success: false, item, error };
					}
				});

				// 等待当前批次完成
				const results = await Promise.all(promises);
				
				// 统计结果
				results.forEach(result => {
					if (result.success) {
						successCount++;
					} else {
						errorCount++;
					}
				});

				// 更新进度
				indexingProgress = Math.min(i + batchSize, allItems.length);
				
				// 添加小延迟避免界面卡顿
				await new Promise(resolve => setTimeout(resolve, 50));
			}

			console.log(`🎉 索引完成! 成功: ${successCount}, 失败: ${errorCount}`);
			indexingCurrent = `索引完成 (成功: ${successCount}, 失败: ${errorCount})`;
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
					disabled={isIndexing || !selectedFolder}
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
			<div class="text-[10px] text-muted-foreground truncate px-1">
				📁 {selectedFolder}
			</div>
		{/if}

		<!-- 索引进度条 -->
		{#if showIndexingProgress && isIndexing}
			<div class="space-y-1">
				<div class="flex items-center justify-between text-[10px] text-muted-foreground">
					<span>正在索引: {indexingCurrent}</span>
					<span>{indexingProgress}/{indexingTotal}</span>
				</div>
				<Progress.Root value={(indexingProgress / indexingTotal) * 100} class="h-2">
					<Progress.Indicator class="h-full bg-primary transition-all duration-300" />
				</Progress.Root>
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