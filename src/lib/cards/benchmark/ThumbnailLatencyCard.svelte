<script lang="ts">
	/**
	 * 缩略图加载延迟测试卡片
	 * 测试文件夹缩略图和图片缩略图的生成延迟
	 */
	import { invoke } from '@tauri-apps/api/core';
	import { Activity, Play, RefreshCw, Folder, Image } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	type TestMode = 'folder' | 'file';

	interface LatencyRecord {
		id: number;
		name: string;
		type: 'single' | 'batch';
		cached: boolean;
		totalMs: number;
		error?: string;
	}

	interface ScanResult {
		path: string;
		blobKey: string | null;
		fromCache: boolean;
		error: string | null;
	}

	let records = $state<LatencyRecord[]>([]);
	let isRunning = $state(false);
	let testMode = $state<TestMode>('folder');
	let testFolders = $state<string[]>([]);
	let testImages = $state<string[]>([]);
	let recordId = $state(0);

	const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'];

	let stats = $derived(() => {
		if (records.length === 0) return { avgTotal: 0, cacheHitRate: 0, count: 0 };
		const successRecords = records.filter((r) => !r.error);
		const cachedCount = successRecords.filter((r) => r.cached).length;
		return {
			avgTotal: successRecords.reduce((sum, r) => sum + r.totalMs, 0) / successRecords.length || 0,
			cacheHitRate: successRecords.length > 0 ? (cachedCount / successRecords.length) * 100 : 0,
			count: records.length
		};
	});

	async function selectTestDirectory() {
		try {
			const { open } = await import('@tauri-apps/plugin-dialog');
			const selected = await open({ directory: true, multiple: false });
			if (selected) {
				const snapshot = await invoke<{
					items: Array<{ path: string; name: string; isDir: boolean }>;
				}>('load_directory_snapshot', { path: selected });

				if (testMode === 'folder') {
					testFolders = snapshot.items
						.filter((item) => item.isDir === true)
						.slice(0, 100)
						.map((item) => item.path);
					testImages = [];
					console.log(`📁 选择了 ${testFolders.length} 个子文件夹`);
				} else {
					testImages = snapshot.items
						.filter(
							(item) =>
								!item.isDir && IMAGE_EXTS.some((ext) => item.name.toLowerCase().endsWith(ext))
						)
						.slice(0, 50)
						.map((item) => item.path);
					testFolders = [];
					console.log(`🖼️ 选择了 ${testImages.length} 张图片`);
				}
			}
		} catch (e) {
			console.error('选择目录失败:', e);
		}
	}

	// 串行测试文件夹缩略图
	async function runFolderTest() {
		if (testFolders.length === 0) return;
		isRunning = true;

		for (const folderPath of testFolders) {
			const startTime = performance.now();
			const name = folderPath.split('\\').pop() || folderPath;

			try {
				const results = await invoke<ScanResult[]>('scan_folder_thumbnails', {
					folders: [folderPath]
				});
				const totalMs = performance.now() - startTime;
				const result = results[0];

				records = [
					{
						id: ++recordId,
						name: name.length > 20 ? name.slice(0, 17) + '...' : name,
						type: 'single',
						cached: result?.fromCache ?? false,
						totalMs,
						error: result?.error ?? undefined
					},
					...records.slice(0, 99)
				];
			} catch (e) {
				records = [
					{
						id: ++recordId,
						name: name.length > 20 ? name.slice(0, 17) + '...' : name,
						type: 'single',
						cached: false,
						totalMs: performance.now() - startTime,
						error: String(e).slice(0, 50)
					},
					...records.slice(0, 99)
				];
			}
		}

		isRunning = false;
		console.log(`� 文件夹缩略图测试完成: ${testFolders.length} 个`);
	}

	// 批量测试文件夹缩略图
	async function runBatchFolderTest() {
		if (testFolders.length === 0) return;
		isRunning = true;

		const startTime = performance.now();
		try {
			const results = await invoke<ScanResult[]>('scan_folder_thumbnails', {
				folders: testFolders
			});
			const totalMs = performance.now() - startTime;
			const avgMs = totalMs / results.length;

			for (const result of results) {
				const name = result.path.split('\\').pop() || result.path;
				records = [
					{
						id: ++recordId,
						name: name.length > 20 ? name.slice(0, 17) + '...' : name,
						type: 'batch',
						cached: result.fromCache,
						totalMs: avgMs,
						error: result.error ?? undefined
					},
					...records.slice(0, 99)
				];
			}

			const cachedCount = results.filter((r) => r.fromCache).length;
			console.log(
				`⚡ 批量完成: ${results.length} 个, 总耗时 ${totalMs.toFixed(0)}ms, 平均 ${avgMs.toFixed(1)}ms, 缓存命中 ${cachedCount}`
			);
		} catch (e) {
			console.error('批量测试失败:', e);
		}

		isRunning = false;
	}

	// 串行测试图片缩略图
	async function runFileTest() {
		if (testImages.length === 0) return;
		isRunning = true;

		for (const imagePath of testImages) {
			const startTime = performance.now();
			const name = imagePath.split('\\').pop() || imagePath;

			try {
				await invoke<string>('generate_file_thumbnail_new', { filePath: imagePath });
				const totalMs = performance.now() - startTime;

				records = [
					{
						id: ++recordId,
						name: name.length > 20 ? name.slice(0, 17) + '...' : name,
						type: 'single',
						cached: totalMs < 10,
						totalMs
					},
					...records.slice(0, 99)
				];
			} catch (e) {
				records = [
					{
						id: ++recordId,
						name: name.length > 20 ? name.slice(0, 17) + '...' : name,
						type: 'single',
						cached: false,
						totalMs: performance.now() - startTime,
						error: String(e).slice(0, 50)
					},
					...records.slice(0, 99)
				];
			}
		}

		isRunning = false;
	}

	function clearRecords() {
		records = [];
		recordId = 0;
	}

	function formatMs(ms: number): string {
		if (ms < 1) return '<1ms';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}
</script>

<div class="space-y-3">
	<!-- 模式切换 -->
	<div class="flex gap-1 text-xs">
		<button
			class="rounded px-2 py-1 {testMode === 'folder'
				? 'bg-primary text-primary-foreground'
				: 'bg-muted'}"
			onclick={() => {
				testMode = 'folder';
				testFolders = [];
				testImages = [];
			}}
		>
			<Folder class="mr-1 inline h-3 w-3" />文件夹
		</button>
		<button
			class="rounded px-2 py-1 {testMode === 'file'
				? 'bg-primary text-primary-foreground'
				: 'bg-muted'}"
			onclick={() => {
				testMode = 'file';
				testFolders = [];
				testImages = [];
			}}
		>
			<Image class="mr-1 inline h-3 w-3" />图片
		</button>
	</div>

	<!-- 控制按钮 -->
	<div class="flex flex-wrap gap-2">
		<Button variant="outline" size="sm" onclick={selectTestDirectory}>
			<Folder class="mr-1 h-4 w-4" />
			选择目录
		</Button>
		{#if testMode === 'folder'}
			<Button
				variant="default"
				size="sm"
				onclick={runFolderTest}
				disabled={isRunning || testFolders.length === 0}
			>
				<Play class="mr-1 h-4 w-4" />
				串行测试
			</Button>
			<Button
				variant="default"
				size="sm"
				onclick={runBatchFolderTest}
				disabled={isRunning || testFolders.length === 0}
			>
				<Activity class="mr-1 h-4 w-4" />
				批量测试
			</Button>
		{:else}
			<Button
				variant="default"
				size="sm"
				onclick={runFileTest}
				disabled={isRunning || testImages.length === 0}
			>
				<Play class="mr-1 h-4 w-4" />
				串行测试
			</Button>
		{/if}
		<Button variant="ghost" size="sm" onclick={clearRecords}>
			<RefreshCw class="mr-1 h-4 w-4" />
			清空
		</Button>
	</div>

	<!-- 测试路径提示 -->
	{#if testMode === 'folder'}
		{#if testFolders.length > 0}
			<div class="text-muted-foreground text-xs">
				已选择 {testFolders.length} 个子文件夹
			</div>
		{:else}
			<div class="text-muted-foreground text-xs">点击"选择目录"选择包含子文件夹的目录</div>
		{/if}
	{:else if testImages.length > 0}
		<div class="text-muted-foreground text-xs">
			已选择 {testImages.length} 张图片
		</div>
	{:else}
		<div class="text-muted-foreground text-xs">点击"选择目录"选择包含图片的文件夹</div>
	{/if}

	<!-- 统计摘要 -->
	{#if stats().count > 0}
		<div class="grid grid-cols-3 gap-2 text-sm">
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground text-xs">平均耗时</div>
				<div class="font-mono font-bold">{formatMs(stats().avgTotal)}</div>
			</div>
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground text-xs">缓存命中</div>
				<div class="font-mono font-bold">{stats().cacheHitRate.toFixed(0)}%</div>
			</div>
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground text-xs">采样数</div>
				<div class="font-mono font-bold">{stats().count}</div>
			</div>
		</div>
	{/if}

	<!-- 延迟记录列表 -->
	<div class="max-h-64 overflow-auto">
		{#if records.length === 0}
			<div class="text-muted-foreground py-4 text-center">
				{isRunning ? '测试中...' : '选择目录后点击测试按钮'}
			</div>
		{:else}
			<div
				class="text-muted-foreground mb-1 flex items-center gap-2 border-b px-2 py-1 text-[10px]"
			>
				<span class="w-28 truncate">名称</span>
				<span class="w-12">类型</span>
				<span class="w-16">耗时</span>
				<span class="flex-1">状态</span>
			</div>
			<div class="space-y-0.5">
				{#each records as record (record.id)}
					<div
						class="flex items-center gap-2 rounded px-2 py-1 text-xs {record.error
							? 'bg-red-500/10'
							: record.cached
								? 'bg-green-500/10'
								: 'bg-muted/30'}"
					>
						<span class="text-muted-foreground w-28 truncate" title={record.name}>
							{record.name}
						</span>
						<span class="w-12 {record.type === 'batch' ? 'text-blue-500' : 'text-orange-500'}">
							{record.type === 'batch' ? '批量' : '串行'}
						</span>
						<span
							class="w-16 font-mono"
							class:text-green-500={record.totalMs < 50}
							class:text-yellow-500={record.totalMs >= 50 && record.totalMs < 200}
							class:text-red-500={record.totalMs >= 200}
						>
							{formatMs(record.totalMs)}
						</span>
						<span class="flex-1">
							{#if record.error}
								<span class="text-[10px] text-red-500" title={record.error}>错误</span>
							{:else if record.cached}
								<span class="text-[10px] text-green-500">缓存</span>
							{:else}
								<span class="text-[10px] text-blue-500">生成</span>
							{/if}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
