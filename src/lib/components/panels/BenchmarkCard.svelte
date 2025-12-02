<script lang="ts">
	/**
	 * 基准测试卡片
	 * 用于测试不同图像解码方法的性能
	 */
	import { invoke } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Copy, Check, Timer, FolderOpen } from '@lucide/svelte';

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

	let reports = $state<BenchmarkReport[]>([]);
	let isRunning = $state(false);
	let copied = $state(false);
	let selectedFiles = $state<string[]>([]);

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
			lines.push('');
			
			// 按耗时排序
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
		
		// 添加最快方法统计
		if (reports.length > 0) {
			lines.push('--- 性能排名 (解码) ---');
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
			
			const avgStats = [...decodeStats.entries()]
				.map(([method, times]) => ({
					method,
					avg: times.reduce((a, b) => a + b, 0) / times.length,
					count: times.length
				}))
				.sort((a, b) => a.avg - b.avg);
			
			for (const stat of avgStats) {
				lines.push(`   ${stat.method}: 平均 ${stat.avg.toFixed(1)}ms (${stat.count}次)`);
			}
			
			lines.push('');
			lines.push('--- 性能排名 (完整缩略图) ---');
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
			
			const avgThumbStats = [...thumbStats.entries()]
				.map(([method, times]) => ({
					method,
					avg: times.reduce((a, b) => a + b, 0) / times.length,
					count: times.length
				}))
				.sort((a, b) => a.avg - b.avg);
			
			for (const stat of avgThumbStats) {
				lines.push(`   ${stat.method}: 平均 ${stat.avg.toFixed(1)}ms (${stat.count}次)`);
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
</script>

<Card class="w-full">
	<CardHeader class="pb-2">
		<CardTitle class="text-sm flex items-center gap-2">
			<Timer class="w-4 h-4" />
			图像解码基准测试
		</CardTitle>
	</CardHeader>
	<CardContent class="space-y-3">
		<p class="text-xs text-muted-foreground">
			测试 image crate、WIC 对各种格式的解码性能
		</p>

		<div class="flex gap-2">
			<Button onclick={selectFiles} variant="outline" size="sm" class="flex-1">
				<FolderOpen class="w-3 h-3 mr-1" />
				选择 ({selectedFiles.length})
			</Button>
			<Button
				onclick={runBenchmark}
				disabled={isRunning || selectedFiles.length === 0}
				size="sm"
				class="flex-1"
			>
				{isRunning ? '测试中...' : '运行'}
			</Button>
		</div>

		{#if reports.length > 0}
			<div class="flex justify-end">
				<Button onclick={copyResults} variant="ghost" size="sm">
					{#if copied}
						<Check class="w-3 h-3 mr-1 text-green-500" />
						已复制
					{:else}
						<Copy class="w-3 h-3 mr-1" />
						复制结果
					{/if}
				</Button>
			</div>

			<div class="max-h-60 overflow-auto space-y-2">
				{#each reports as report}
					<div class="text-xs border rounded p-2 space-y-1">
						<div class="flex justify-between">
							<span class="font-medium truncate" title={report.file_path}>
								{report.file_path.split(/[/\\]/).pop()}
							</span>
							<span class="text-muted-foreground">{formatFileSize(report.file_size)}</span>
						</div>
						{#each report.results as result}
							<div class="flex justify-between items-center text-[10px] text-muted-foreground">
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
	</CardContent>
</Card>
