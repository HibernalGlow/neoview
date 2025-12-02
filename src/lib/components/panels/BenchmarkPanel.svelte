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

	type CardId = 'files' | 'results' | 'summary';

	// ==================== 状态管理 ====================
	let cardOrder = $state<CardId[]>(['files', 'results', 'summary']);
	let showCards = $state<Record<CardId, boolean>>({
		files: true,
		results: true,
		summary: true
	});

	let reports = $state<BenchmarkReport[]>([]);
	let isRunning = $state(false);
	let selectedFiles = $state<string[]>([]);
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

	function clearFiles() {
		selectedFiles = [];
		reports = [];
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
								选择文件 ({selectedFiles.length})
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
