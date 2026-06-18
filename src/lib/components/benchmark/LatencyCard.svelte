<script lang="ts">
	/**
	 * 延迟分析卡片
	 * 分析图片加载全流程延迟，对比 IPC 和 TempFile 两种方式
	 */
	import { invoke, convertFileSrc } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import { Button } from '$lib/components/ui/button';
	import { FolderOpen, Play, Timer } from '@lucide/svelte';
	import { CollapsibleCard, type CardManager } from '$lib/components/ui/collapsible-card';

	interface Props {
		cardManager: CardManager;
	}

	let { cardManager }: Props = $props();

	// 类型定义
	interface DetailedLatencyResult {
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

	// 状态
	let selectedArchive = $state<string>('');
	let results = $state<DetailedLatencyResult[]>([]);
	let isTesting = $state(false);
	let testCount = $state<number>(5);

	// 选择压缩包
	async function selectArchive() {
		const file = await open({
			multiple: false,
			filters: [{ name: '压缩包', extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr'] }]
		});
		if (file && typeof file === 'string') {
			selectedArchive = file;
		}
	}

	// 运行延迟测试
	async function runTest() {
		if (!selectedArchive) return;

		isTesting = true;
		results = [];

		const loadMethods: Array<'ipc' | 'tempfile'> = ['ipc', 'tempfile'];

		try {
			const imageList = await invoke<string[]>('get_images_from_archive', {
				archivePath: selectedArchive
			});

			if (imageList.length === 0) {
				isTesting = false;
				return;
			}

			const testImages = imageList.slice(0, testCount);

			const testContainer = document.createElement('div');
			testContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;';
			document.body.appendChild(testContainer);

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
							const extractStart = performance.now();
							const imageData = await invoke<number[]>('load_image_from_archive', {
								archivePath: selectedArchive,
								filePath: imagePath
							});
							result.extractTime = performance.now() - extractStart;
							result.imageSize = imageData.length;

							const blobStart = performance.now();
							const blob = new Blob([new Uint8Array(imageData)]);
							result.blobCreateTime = performance.now() - blobStart;

							const urlStart = performance.now();
							url = URL.createObjectURL(blob);
							result.urlCreateTime = performance.now() - urlStart;
						} else {
							const extractStart = performance.now();
							const tempPath = await invoke<string>('extract_image_to_temp', {
								archivePath: selectedArchive,
								filePath: imagePath
							});
							result.extractTime = performance.now() - extractStart;

							const urlStart = performance.now();
							url = convertFileSrc(tempPath);
							result.urlCreateTime = performance.now() - urlStart;
						}

						await new Promise<void>((resolve, reject) => {
							testContainer.innerHTML = '';
							const img = document.createElement('img');
							const decodeStart = performance.now();

							img.onload = () => {
								result.decodeTime = performance.now() - decodeStart;
								result.dimensions = { width: img.naturalWidth, height: img.naturalHeight };

								if (loadMethod === 'tempfile' && result.imageSize === 0) {
									result.imageSize = img.naturalWidth * img.naturalHeight * 0.1;
								}

								const renderStart = performance.now();
								testContainer.appendChild(img);
								void testContainer.offsetHeight;
								result.renderTime = performance.now() - renderStart;

								if (loadMethod === 'ipc') URL.revokeObjectURL(url);
								resolve();
							};

							img.onerror = () => {
								if (loadMethod === 'ipc') URL.revokeObjectURL(url);
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

					results = [...results, result];
				}
			}

			testContainer.remove();
		} catch (err) {
			console.error('延迟测试失败:', err);
		}

		isTesting = false;
	}

	// 计算统计
	function getStats() {
		if (results.length === 0) return null;

		const avg = (arr: number[]) =>
			arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

		const ipcResults = results.filter((r) => r.success && r.loadMethod === 'ipc');
		const tempResults = results.filter((r) => r.success && r.loadMethod === 'tempfile');

		if (ipcResults.length === 0 && tempResults.length === 0) return null;

		const calcStats = (res: DetailedLatencyResult[]) => ({
			count: res.length,
			avgExtract: avg(res.map((r) => r.extractTime)),
			avgBlob: avg(res.map((r) => r.blobCreateTime)),
			avgUrl: avg(res.map((r) => r.urlCreateTime)),
			avgDecode: avg(res.map((r) => r.decodeTime)),
			avgRender: avg(res.map((r) => r.renderTime)),
			avgTotal: avg(res.map((r) => r.totalTime)),
			avgSize: avg(res.map((r) => r.imageSize))
		});

		const ipc = ipcResults.length > 0 ? calcStats(ipcResults) : null;
		const temp = tempResults.length > 0 ? calcStats(tempResults) : null;

		const speedup =
			ipc && temp && ipc.avgTotal > 0 ? (ipc.avgTotal / temp.avgTotal).toFixed(1) : null;

		return { ipc, temp, speedup };
	}

	const stats = $derived(getStats());
</script>

<CollapsibleCard
	id="latency"
	title="延迟分析"
	icon={Timer}
	iconColor="text-red-500"
	expanded={cardManager.isExpanded('latency')}
	order={cardManager.getOrder('latency')}
	canMoveUp={cardManager.canMove('latency', 'up')}
	canMoveDown={cardManager.canMove('latency', 'down')}
	onExpandedChange={(expanded: boolean) => cardManager.setExpanded('latency', expanded)}
	onMove={(direction: 'up' | 'down') => cardManager.move('latency', direction)}
>
	<p class="text-muted-foreground text-[10px]">
		分析图片加载全流程延迟，定位性能瓶颈（目标: &lt;16ms）
	</p>

	<!-- 选择压缩包 -->
	<div class="flex gap-2">
		<Button onclick={selectArchive} variant="outline" size="sm" class="flex-1 text-xs">
			<FolderOpen class="mr-1 h-3 w-3" />
			{selectedArchive ? '已选择' : '选择压缩包'}
		</Button>
		<Button
			onclick={runTest}
			disabled={isTesting || !selectedArchive}
			size="sm"
			class="flex-1 text-xs"
		>
			<Play class="mr-1 h-3 w-3" />
			{isTesting ? '测试中...' : '分析延迟'}
		</Button>
	</div>

	{#if selectedArchive}
		<div class="text-muted-foreground truncate text-[10px]">
			{selectedArchive.split(/[/\\]/).pop()}
		</div>
	{/if}

	<!-- 测试数量 -->
	<div class="flex items-center gap-2 text-[10px]">
		<span class="text-muted-foreground">测试图片数:</span>
		<select class="bg-background h-6 rounded border px-2 text-[10px]" bind:value={testCount}>
			<option value={3}>3张</option>
			<option value={5}>5张</option>
			<option value={10}>10张</option>
		</select>
	</div>

	<!-- 统计结果 -->
	{#if stats}
		<!-- 对比总结 -->
		{#if stats.ipc && stats.temp}
			<div class="rounded border-2 border-green-500/50 bg-green-500/5 p-2">
				<div class="flex items-center justify-between text-[10px]">
					<span class="font-medium">🚀 TempFile 加速比:</span>
					<span class="font-mono text-sm font-bold text-green-500">{stats.speedup}x</span>
				</div>
				<div class="text-muted-foreground mt-1 text-[9px]">
					IPC: {stats.ipc.avgTotal.toFixed(0)}ms → TempFile: {stats.temp.avgTotal.toFixed(0)}ms
				</div>
			</div>
		{/if}

		<!-- IPC 方式统计 -->
		{#if stats.ipc}
			<div class="space-y-2 rounded border border-red-500/30 p-2">
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
					<div>
						提取+IPC: <span class="font-mono text-red-500">{stats.ipc.avgExtract.toFixed(0)}ms</span
						>
					</div>
					<div>Blob: <span class="font-mono">{stats.ipc.avgBlob.toFixed(1)}ms</span></div>
					<div>解码: <span class="font-mono">{stats.ipc.avgDecode.toFixed(0)}ms</span></div>
				</div>
			</div>
		{/if}

		<!-- TempFile 方式统计 -->
		{#if stats.temp}
			<div class="space-y-2 rounded border border-green-500/30 p-2">
				<div class="flex items-center justify-between text-[10px]">
					<span class="font-medium text-green-500">📁 TempFile + convertFileSrc</span>
					<span
						class="font-mono {stats.temp.avgTotal <= 16
							? 'text-green-500'
							: stats.temp.avgTotal <= 33
								? 'text-yellow-500'
								: 'text-red-500'}"
					>
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
					<div>
						提取: <span class="font-mono text-orange-500">{stats.temp.avgExtract.toFixed(0)}ms</span
						>
					</div>
					<div>URL: <span class="font-mono">{stats.temp.avgUrl.toFixed(2)}ms</span></div>
					<div>
						解码: <span class="font-mono text-blue-500">{stats.temp.avgDecode.toFixed(0)}ms</span>
					</div>
				</div>
			</div>
		{/if}
	{/if}

	<!-- 详细结果列表 -->
	{#if results.length > 0}
		<div class="space-y-1">
			<div class="text-muted-foreground text-[9px]">详细结果:</div>
			<div class="max-h-32 space-y-1 overflow-auto">
				{#each results as result, i}
					<div class="rounded border p-1.5 text-[9px] {result.success ? '' : 'border-red-500/50'}">
						<div class="flex justify-between">
							<span class="max-w-[100px] truncate" title={result.imagePath}>
								<span class={result.loadMethod === 'ipc' ? 'text-red-500' : 'text-green-500'}
									>[{result.loadMethod}]</span
								>
								{result.imagePath.split(/[/\\]/).pop()}
							</span>
							<span class="font-mono {result.totalTime <= 16 ? 'text-green-500' : 'text-red-500'}">
								{result.totalTime.toFixed(0)}ms
							</span>
						</div>
						{#if result.success && result.dimensions}
							<div class="text-muted-foreground">
								{result.dimensions.width}×{result.dimensions.height} · {(
									result.imageSize / 1024
								).toFixed(0)}KB
							</div>
						{:else if result.error}
							<div class="truncate text-red-400">{result.error}</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</CollapsibleCard>
