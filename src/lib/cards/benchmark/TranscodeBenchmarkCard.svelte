<script lang="ts">
	/**
	 * 超分预处理转码基准测试卡片
	 * 对比 WIC vs 原有方法（jxl-oxide/image crate）的转码性能
	 */
	import { invoke } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import { Button } from '$lib/components/ui/button';
	import { FolderOpen, Play, Trash2, Gauge, Clock, FileImage, ArrowRight } from '@lucide/svelte';

	// 后端返回的测试结果
	interface TranscodeResult {
		method: string;
		input_format: string;
		output_format: string;
		decode_ms: number;
		encode_ms: number;
		total_ms: number;
		input_size: number;
		output_size: number;
		image_size: [number, number] | null;
		success: boolean;
		error: string | null;
	}

	interface TranscodeReport {
		file_path: string;
		file_size: number;
		detected_format: string;
		results: TranscodeResult[];
	}

	// 状态
	let filePath = $state<string | null>(null);
	let fileName = $state<string>('');
	let isRunning = $state(false);
	let report = $state<TranscodeReport | null>(null);
	let error = $state<string | null>(null);

	// 选择文件
	async function selectFile() {
		try {
			const selected = await open({
				multiple: false,
				filters: [
					{
						name: 'Images',
						extensions: ['jxl', 'avif', 'heic', 'webp', 'png', 'jpg', 'jpeg']
					}
				]
			});

			if (selected && typeof selected === 'string') {
				filePath = selected;
				fileName = selected.split(/[/\\]/).pop() || selected;
				report = null;
				error = null;
			}
		} catch (e) {
			error = `选择文件失败: ${e}`;
		}
	}

	// 运行测试
	async function runTest() {
		if (!filePath) return;

		isRunning = true;
		error = null;

		try {
			report = await invoke<TranscodeReport>('run_transcode_benchmark', {
				filePath
			});
		} catch (e) {
			error = `测试失败: ${e}`;
			report = null;
		} finally {
			isRunning = false;
		}
	}

	// 清除结果
	function clearResults() {
		report = null;
		error = null;
	}

	// 格式化文件大小
	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}

	// 格式化时间
	function formatTime(ms: number): string {
		if (ms < 1) return `${(ms * 1000).toFixed(0)} μs`;
		if (ms < 1000) return `${ms.toFixed(1)} ms`;
		return `${(ms / 1000).toFixed(2)} s`;
	}

	// 找出最快的方法
	function getFastestIndex(results: TranscodeResult[]): number {
		if (results.length === 0) return -1;
		let minIdx = 0;
		for (let i = 1; i < results.length; i++) {
			if (results[i].success && results[i].total_ms < results[minIdx].total_ms) {
				minIdx = i;
			}
		}
		return minIdx;
	}
</script>

<div class="space-y-4 p-4">
	<!-- 文件选择区域 -->
	<div class="flex items-center gap-2">
		<Button variant="outline" size="sm" onclick={selectFile} disabled={isRunning}>
			<FolderOpen class="mr-1 h-4 w-4" />
			选择图片
		</Button>
		{#if fileName}
			<span class="text-muted-foreground flex-1 truncate text-sm" title={filePath ?? ''}>
				{fileName}
			</span>
		{/if}
	</div>

	<!-- 操作按钮 -->
	<div class="flex gap-2">
		<Button variant="default" size="sm" onclick={runTest} disabled={!filePath || isRunning}>
			{#if isRunning}
				<div
					class="mr-1 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
				></div>
				测试中...
			{:else}
				<Play class="mr-1 h-4 w-4" />
				运行测试
			{/if}
		</Button>
		<Button variant="ghost" size="sm" onclick={clearResults} disabled={!report && !error}>
			<Trash2 class="h-4 w-4" />
		</Button>
	</div>

	<!-- 错误显示 -->
	{#if error}
		<div
			class="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-3 text-sm"
		>
			{error}
		</div>
	{/if}

	<!-- 测试结果 -->
	{#if report}
		<!-- 文件信息 -->
		<div class="bg-muted/50 space-y-1 rounded-lg p-3">
			<div class="flex items-center gap-2 text-sm">
				<FileImage class="text-muted-foreground h-4 w-4" />
				<span class="font-medium">检测格式:</span>
				<span class="text-primary font-mono uppercase">{report.detected_format}</span>
			</div>
			<div class="text-muted-foreground text-xs">
				文件大小: {formatSize(report.file_size)}
			</div>
		</div>

		<!-- 结果列表 -->
		<div class="space-y-2">
			{#each report.results as result, i}
				{@const isFastest = i === getFastestIndex(report.results)}
				{@const successClass =
					isFastest && result.success
						? 'bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-800'
						: ''}
				{@const errorClass = !result.success
					? 'bg-red-50 border-red-300 dark:bg-red-950 dark:border-red-800'
					: ''}
				<div class="rounded-lg border p-3 transition-colors {successClass} {errorClass}">
					<!-- 方法名 -->
					<div class="mb-2 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<Gauge class="text-muted-foreground h-4 w-4" />
							<span class="text-sm font-medium">{result.method}</span>
							{#if isFastest && result.success}
								<span
									class="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300"
									>最快</span
								>
							{/if}
						</div>
						{#if result.success}
							<span class="font-mono text-sm font-bold">{formatTime(result.total_ms)}</span>
						{:else}
							<span class="text-destructive text-xs">失败</span>
						{/if}
					</div>

					{#if result.success}
						<!-- 时间分解 -->
						<div class="text-muted-foreground grid grid-cols-2 gap-2 text-xs">
							<div class="flex items-center gap-1">
								<Clock class="h-3 w-3" />
								解码: {formatTime(result.decode_ms)}
							</div>
							<div class="flex items-center gap-1">
								<ArrowRight class="h-3 w-3" />
								编码: {formatTime(result.encode_ms)}
							</div>
						</div>

						<!-- 尺寸信息 -->
						<div class="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
							{#if result.image_size}
								<span>{result.image_size[0]}×{result.image_size[1]}</span>
							{/if}
							<span>
								{formatSize(result.input_size)} → {formatSize(result.output_size)}
								({((result.output_size / result.input_size) * 100).toFixed(0)}%)
							</span>
						</div>
					{:else if result.error}
						<div class="text-destructive mt-1 text-xs">{result.error}</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- 对比总结 -->
		{#if report.results.filter((r) => r.success).length >= 2}
			{@const successResults = report.results.filter((r) => r.success)}
			{@const fastest = successResults.reduce((a, b) => (a.total_ms < b.total_ms ? a : b))}
			{@const slowest = successResults.reduce((a, b) => (a.total_ms > b.total_ms ? a : b))}
			<div class="bg-primary/5 rounded-lg p-3 text-sm">
				<div class="mb-1 font-medium">📊 对比结果</div>
				<div class="text-muted-foreground">
					<span class="text-primary font-medium">{fastest.method}</span>
					比 {slowest.method} 快
					<span class="font-mono font-bold"
						>{((slowest.total_ms / fastest.total_ms - 1) * 100).toFixed(0)}%</span
					>
					（{formatTime(slowest.total_ms - fastest.total_ms)}）
				</div>
			</div>
		{/if}
	{/if}

	<!-- 使用说明 -->
	{#if !report && !error}
		<div class="text-muted-foreground space-y-1 text-xs">
			<p>• 选择 JXL 或 AVIF 图片进行测试</p>
			<p>• 对比 WIC（Windows 原生）和 jxl-oxide/image crate 的转码性能</p>
			<p>• 转码输出格式为 PNG（无损，用于超分输入）</p>
		</div>
	{/if}
</div>
