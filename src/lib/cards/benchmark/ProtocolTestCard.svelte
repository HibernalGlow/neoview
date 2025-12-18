<script lang="ts">
/**
 * 协议测试卡片
 * 测试 file:// 和 convertFileSrc (asset://) 协议的兼容性和速度
 */
import { getFileUrl as convertFileSrc } from '$lib/api/http-bridge';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FileImage, Play, FolderOpen, CheckCircle, XCircle, Clock } from '@lucide/svelte';

interface ProtocolResult {
	protocol: 'file' | 'asset';
	url: string;
	success: boolean;
	loadTime: number;
	error: string | null;
	dimensions: { width: number; height: number } | null;
}

let selectedImagePath = $state<string>('');
let results = $state<ProtocolResult[]>([]);
let isTesting = $state(false);
let testCount = $state<number>(3);

async function selectImage() {
	const file = await open({
		multiple: false,
		filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp'] }]
	});
	if (file && typeof file === 'string') {
		selectedImagePath = file;
		results = [];
	}
}

async function runProtocolTest() {
	if (!selectedImagePath) return;
	
	isTesting = true;
	results = [];
	
	// 测试容器
	const testContainer = document.createElement('div');
	testContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;';
	document.body.appendChild(testContainer);
	
	try {
		// 测试 1: file:// 协议
		for (let i = 0; i < testCount; i++) {
			const fileResult = await testProtocol('file', `file://${selectedImagePath}`, testContainer);
			results = [...results, fileResult];
		}
		
		// 测试 2: asset:// 协议 (convertFileSrc)
		const assetUrl = convertFileSrc(selectedImagePath);
		for (let i = 0; i < testCount; i++) {
			const assetResult = await testProtocol('asset', assetUrl, testContainer);
			results = [...results, assetResult];
		}
	} finally {
		testContainer.remove();
		isTesting = false;
	}
}

async function testProtocol(
	protocol: 'file' | 'asset',
	url: string,
	container: HTMLDivElement
): Promise<ProtocolResult> {
	const startTime = performance.now();
	
	return new Promise((resolve) => {
		container.innerHTML = '';
		const img = document.createElement('img');
		
		const timeout = setTimeout(() => {
			resolve({
				protocol,
				url,
				success: false,
				loadTime: performance.now() - startTime,
				error: '加载超时 (5s)',
				dimensions: null
			});
		}, 5000);
		
		img.onload = () => {
			clearTimeout(timeout);
			resolve({
				protocol,
				url,
				success: true,
				loadTime: performance.now() - startTime,
				error: null,
				dimensions: { width: img.naturalWidth, height: img.naturalHeight }
			});
		};
		
		img.onerror = (e) => {
			clearTimeout(timeout);
			resolve({
				protocol,
				url,
				success: false,
				loadTime: performance.now() - startTime,
				error: `加载失败: ${e}`,
				dimensions: null
			});
		};
		
		img.src = url;
		container.appendChild(img);
	});
}

// 统计
const fileResults = $derived(results.filter(r => r.protocol === 'file'));
const assetResults = $derived(results.filter(r => r.protocol === 'asset'));

const fileAvg = $derived(
	fileResults.length > 0 
		? fileResults.reduce((sum, r) => sum + r.loadTime, 0) / fileResults.length 
		: 0
);
const assetAvg = $derived(
	assetResults.length > 0 
		? assetResults.reduce((sum, r) => sum + r.loadTime, 0) / assetResults.length 
		: 0
);

const fileSuccessRate = $derived(
	fileResults.length > 0 
		? (fileResults.filter(r => r.success).length / fileResults.length * 100).toFixed(0) 
		: '-'
);
const assetSuccessRate = $derived(
	assetResults.length > 0 
		? (assetResults.filter(r => r.success).length / assetResults.length * 100).toFixed(0) 
		: '-'
);
</script>

<div class="space-y-3">
	<!-- 文件选择 -->
	<div class="flex items-center gap-2">
		<Button size="sm" variant="outline" onclick={selectImage}>
			<FolderOpen class="h-4 w-4 mr-1" />
			选择图片
		</Button>
		{#if selectedImagePath}
			<span class="text-xs text-muted-foreground truncate flex-1" title={selectedImagePath}>
				{selectedImagePath.split(/[/\\]/).pop()}
			</span>
		{/if}
	</div>
	
	<!-- 测试设置 -->
	<div class="flex items-center gap-2 text-xs">
		<span class="text-muted-foreground">每种协议测试:</span>
		<input
			type="number"
			bind:value={testCount}
			min="1"
			max="20"
			class="w-14 h-6 px-1 text-center rounded border bg-background"
		/>
		<span class="text-muted-foreground">次</span>
		
		<Button
			size="sm"
			disabled={!selectedImagePath || isTesting}
			onclick={runProtocolTest}
			class="ml-auto"
		>
			<Play class="h-4 w-4 mr-1" />
			{isTesting ? '测试中...' : '开始测试'}
		</Button>
	</div>
	
	<!-- 结果概览 -->
	{#if results.length > 0}
		<div class="grid grid-cols-2 gap-2 text-xs">
			<!-- file:// -->
			<div class="p-2 rounded border bg-muted/30">
				<div class="flex items-center gap-1 font-medium mb-1">
					<FileImage class="h-3 w-3" />
					file://
				</div>
				<div class="flex items-center gap-1">
					{#if fileResults.some(r => r.success)}
						<CheckCircle class="h-3 w-3 text-green-500" />
						<span class="text-green-600">可用</span>
					{:else if fileResults.length > 0}
						<XCircle class="h-3 w-3 text-red-500" />
						<span class="text-red-600">不可用</span>
					{/if}
				</div>
				<div class="flex items-center gap-1 text-muted-foreground">
					<Clock class="h-3 w-3" />
					平均 {fileAvg.toFixed(1)}ms
				</div>
				<div class="text-muted-foreground">
					成功率: {fileSuccessRate}%
				</div>
			</div>
			
			<!-- asset:// -->
			<div class="p-2 rounded border bg-muted/30">
				<div class="flex items-center gap-1 font-medium mb-1">
					<FileImage class="h-3 w-3" />
					asset://
				</div>
				<div class="flex items-center gap-1">
					{#if assetResults.some(r => r.success)}
						<CheckCircle class="h-3 w-3 text-green-500" />
						<span class="text-green-600">可用</span>
					{:else if assetResults.length > 0}
						<XCircle class="h-3 w-3 text-red-500" />
						<span class="text-red-600">不可用</span>
					{/if}
				</div>
				<div class="flex items-center gap-1 text-muted-foreground">
					<Clock class="h-3 w-3" />
					平均 {assetAvg.toFixed(1)}ms
				</div>
				<div class="text-muted-foreground">
					成功率: {assetSuccessRate}%
				</div>
			</div>
		</div>
		
		<!-- 详细结果 -->
		<details class="text-xs">
			<summary class="cursor-pointer text-muted-foreground hover:text-foreground">
				详细结果 ({results.length} 条)
			</summary>
			<div class="mt-2 max-h-40 overflow-auto space-y-1">
				{#each results as result, i}
					<div class="flex items-center gap-2 p-1 rounded {result.success ? 'bg-green-500/10' : 'bg-red-500/10'}">
						<span class="font-mono w-6 text-muted-foreground">#{i + 1}</span>
						<span class="w-12">{result.protocol}</span>
						{#if result.success}
							<CheckCircle class="h-3 w-3 text-green-500" />
						{:else}
							<XCircle class="h-3 w-3 text-red-500" />
						{/if}
						<span class="font-mono">{result.loadTime.toFixed(1)}ms</span>
						{#if result.dimensions}
							<span class="text-muted-foreground">
								{result.dimensions.width}×{result.dimensions.height}
							</span>
						{/if}
						{#if result.error}
							<span class="text-red-500 truncate" title={result.error}>
								{result.error}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</details>
		
		<!-- 结论 -->
		{#if fileResults.length > 0 && assetResults.length > 0}
			<div class="p-2 rounded border bg-blue-500/10 text-xs">
				<div class="font-medium mb-1">📊 结论</div>
				{#if assetResults.some(r => r.success) && !fileResults.some(r => r.success)}
					<p>✅ <strong>asset://</strong> 可用，<strong>file://</strong> 不可用</p>
					<p class="text-muted-foreground">Tauri 需要使用 convertFileSrc 转换路径</p>
				{:else if fileResults.some(r => r.success) && assetResults.some(r => r.success)}
					<p>✅ 两种协议都可用</p>
					{#if fileAvg < assetAvg}
						<p class="text-muted-foreground">file:// 更快 ({(assetAvg - fileAvg).toFixed(1)}ms)</p>
					{:else}
						<p class="text-muted-foreground">asset:// 更快 ({(fileAvg - assetAvg).toFixed(1)}ms)</p>
					{/if}
				{:else if !fileResults.some(r => r.success) && !assetResults.some(r => r.success)}
					<p>❌ 两种协议都不可用，请检查文件路径</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>
