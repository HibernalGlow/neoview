<script lang="ts">
/**
 * 超分流程基准测试卡片
 * 测试完整超分流程：选择图片 -> 超分 -> 显示结果
 */
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FolderOpen, Play, Trash2, Image, Clock, Gauge, ZoomIn } from '@lucide/svelte';

// 超分测试结果
interface UpscaleTestResult {
	success: boolean;
	cache_path: string | null;
	original_size: [number, number] | null;
	upscaled_size: [number, number] | null;
	total_ms: number;
	decode_ms: number;
	upscale_ms: number;
	encode_ms: number;
	model_name: string;
	error: string | null;
}

// 状态
let filePath = $state<string | null>(null);
let fileName = $state<string>('');
let isRunning = $state(false);
let result = $state<UpscaleTestResult | null>(null);
let error = $state<string | null>(null);
let resultImageUrl = $state<string | null>(null);
let originalImageUrl = $state<string | null>(null);

// 选择文件
async function selectFile() {
	try {
		const selected = await open({
			multiple: false,
			filters: [{
				name: 'Images',
				extensions: ['png', 'jpg', 'jpeg', 'webp', 'jxl', 'avif', 'heic', 'bmp', 'gif']
			}]
		});
		
		if (selected && typeof selected === 'string') {
			filePath = selected;
			fileName = selected.split(/[/\\]/).pop() || selected;
			originalImageUrl = convertFileSrc(selected);
			result = null;
			resultImageUrl = null;
			error = null;
		}
	} catch (e) {
		error = `选择文件失败: ${e}`;
	}
}

// 运行超分测试
async function runTest() {
	if (!filePath) return;
	
	isRunning = true;
	error = null;
	result = null;
	resultImageUrl = null;
	
	try {
		result = await invoke<UpscaleTestResult>('run_upscale_benchmark', {
			filePath
		});
		
		if (result.success && result.cache_path) {
			resultImageUrl = convertFileSrc(result.cache_path);
		}
	} catch (e) {
		error = `测试失败: ${e}`;
		result = null;
	} finally {
		isRunning = false;
	}
}

// 清除结果
function clearResults() {
	result = null;
	resultImageUrl = null;
	error = null;
}

// 格式化时间
function formatTime(ms: number): string {
	if (ms < 1) return `${(ms * 1000).toFixed(0)} μs`;
	if (ms < 1000) return `${ms.toFixed(1)} ms`;
	return `${(ms / 1000).toFixed(2)} s`;
}
</script>

<div class="space-y-4 p-4">
	<!-- 文件选择区域 -->
	<div class="flex items-center gap-2">
		<Button variant="outline" size="sm" onclick={selectFile} disabled={isRunning}>
			<FolderOpen class="h-4 w-4 mr-1" />
			选择图片
		</Button>
		{#if fileName}
			<span class="text-sm text-muted-foreground truncate flex-1" title={filePath ?? ''}>
				{fileName}
			</span>
		{/if}
	</div>
	
	<!-- 操作按钮 -->
	<div class="flex gap-2">
		<Button 
			variant="default" 
			size="sm" 
			onclick={runTest} 
			disabled={!filePath || isRunning}
		>
			{#if isRunning}
				<div class="h-4 w-4 mr-1 animate-spin border-2 border-current border-t-transparent rounded-full"></div>
				超分中...
			{:else}
				<Play class="h-4 w-4 mr-1" />
				运行超分
			{/if}
		</Button>
		<Button 
			variant="ghost" 
			size="sm" 
			onclick={clearResults}
			disabled={!result && !error}
		>
			<Trash2 class="h-4 w-4" />
		</Button>
	</div>
	
	<!-- 错误显示 -->
	{#if error}
		<div class="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
			{error}
		</div>
	{/if}
	
	<!-- 测试结果 -->
	{#if result}
		{#if result.success}
			<!-- 时间统计 -->
			<div class="p-3 bg-muted/50 rounded-lg space-y-2">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2 text-sm">
						<Gauge class="h-4 w-4 text-muted-foreground" />
						<span class="font-medium">模型:</span>
						<span class="font-mono text-primary">{result.model_name}</span>
					</div>
					<span class="font-mono text-sm font-bold">{formatTime(result.total_ms)}</span>
				</div>
				
				<!-- 时间分解 -->
				<div class="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
					<div class="flex items-center gap-1">
						<Clock class="h-3 w-3" />
						解码: {formatTime(result.decode_ms)}
					</div>
					<div class="flex items-center gap-1">
						<ZoomIn class="h-3 w-3" />
						超分: {formatTime(result.upscale_ms)}
					</div>
					<div class="flex items-center gap-1">
						<Image class="h-3 w-3" />
						编码: {formatTime(result.encode_ms)}
					</div>
				</div>
				
				<!-- 尺寸信息 -->
				{#if result.original_size && result.upscaled_size}
					<div class="text-xs text-muted-foreground">
						{result.original_size[0]}×{result.original_size[1]} → 
						{result.upscaled_size[0]}×{result.upscaled_size[1]}
						({(result.upscaled_size[0] / result.original_size[0]).toFixed(0)}x)
					</div>
				{/if}
			</div>
			
			<!-- 图片对比 -->
			<div class="grid grid-cols-2 gap-2">
				<!-- 原图 -->
				<div class="space-y-1">
					<div class="text-xs text-muted-foreground text-center">原图</div>
					{#if originalImageUrl}
						<div class="border rounded-lg overflow-hidden bg-muted/30 aspect-square flex items-center justify-center">
							<img 
								src={originalImageUrl} 
								alt="原图" 
								class="max-w-full max-h-full object-contain"
							/>
						</div>
					{/if}
				</div>
				
				<!-- 超分结果 -->
				<div class="space-y-1">
					<div class="text-xs text-muted-foreground text-center">超分结果</div>
					{#if resultImageUrl}
						<div class="border rounded-lg overflow-hidden bg-muted/30 aspect-square flex items-center justify-center">
							<img 
								src={resultImageUrl} 
								alt="超分结果" 
								class="max-w-full max-h-full object-contain"
							/>
						</div>
					{/if}
				</div>
			</div>
			
			<!-- 缓存路径 -->
			{#if result.cache_path}
				<div class="text-[10px] text-muted-foreground truncate" title={result.cache_path}>
					💾 {result.cache_path}
				</div>
			{/if}
		{:else}
			<div class="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
				{result.error || '超分失败'}
			</div>
		{/if}
	{/if}
	
	<!-- 使用说明 -->
	{#if !result && !error && !isRunning}
		<div class="text-xs text-muted-foreground space-y-1">
			<p>• 选择一张图片进行超分测试</p>
			<p>• 测试完整流程：解码 → 超分 → 编码保存</p>
			<p>• 使用当前配置的模型和参数</p>
		</div>
	{/if}
</div>
