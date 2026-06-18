<script lang="ts">
	/**
	 * 压缩包测试卡片
	 * 从 BenchmarkPanel 提取
	 */
	import { invoke } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import { Button } from '$lib/components/ui/button';
	import { FolderOpen, Play, Trash2 } from '@lucide/svelte';

	interface ArchiveScanResult {
		total_count: number;
		folder_path: string;
	}

	interface BenchmarkReport {
		file_path: string;
		file_size: number;
		results: Array<{
			method: string;
			format: string;
			duration_ms: number;
			success: boolean;
			error: string | null;
		}>;
	}

	let selectedArchiveFolder = $state<string>('');
	let archiveScanResult = $state<ArchiveScanResult | null>(null);
	let archiveTier = $state<20 | 50 | 100 | 300>(20);
	let isScanning = $state(false);
	let isRunning = $state(false);
	let reports = $state<BenchmarkReport[]>([]);

	async function selectArchiveFolder() {
		const folder = await open({
			directory: true,
			multiple: false
		});

		if (folder && typeof folder === 'string') {
			selectedArchiveFolder = folder;
			isScanning = true;

			try {
				const result = await invoke<ArchiveScanResult>('scan_archives_in_folder', {
					folderPath: folder
				});
				archiveScanResult = result;
			} catch (e) {
				console.error('扫描压缩包失败:', e);
				archiveScanResult = null;
			} finally {
				isScanning = false;
			}
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
			console.error('压缩包批量测试失败:', err);
		} finally {
			isRunning = false;
		}
	}

	function clearArchives() {
		selectedArchiveFolder = '';
		archiveScanResult = null;
		reports = [];
	}
</script>

<div class="space-y-2">
	<div class="flex gap-2">
		<Button
			onclick={selectArchiveFolder}
			variant="outline"
			size="sm"
			class="flex-1 text-xs"
			disabled={isScanning}
		>
			<FolderOpen class="mr-1 h-3 w-3" />
			{isScanning ? '扫描中...' : selectedArchiveFolder ? '重选文件夹' : '选择文件夹'}
		</Button>
		<Button
			onclick={runArchiveBenchmark}
			disabled={isRunning || !archiveScanResult || archiveScanResult.total_count === 0}
			size="sm"
			class="flex-1 text-xs"
		>
			<Play class="mr-1 h-3 w-3" />
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
		<div class="bg-muted/50 space-y-1 rounded p-2 text-[10px]">
			<div class="flex justify-between">
				<span class="text-muted-foreground">找到压缩包:</span>
				<span class="text-primary font-medium">{archiveScanResult.total_count} 个</span>
			</div>
			<div class="text-muted-foreground truncate" title={archiveScanResult.folder_path}>
				📁 {archiveScanResult.folder_path}
			</div>
		</div>
	{/if}

	<!-- 档位选择 -->
	{#if archiveScanResult && archiveScanResult.total_count > 0}
		<div class="flex items-center gap-1 text-[10px]">
			<span class="text-muted-foreground mr-1">抽样数:</span>
			{#each [20, 50, 100, 300] as tier}
				<button
					type="button"
					class="rounded px-2 py-0.5 {archiveTier === tier
						? 'bg-primary text-primary-foreground'
						: 'bg-muted hover:bg-muted/80'}"
					onclick={() => (archiveTier = tier as 20 | 50 | 100 | 300)}
					disabled={tier > archiveScanResult.total_count}
				>
					{Math.min(tier, archiveScanResult.total_count)}
				</button>
			{/each}
		</div>
		<div class="text-muted-foreground text-[10px]">
			将随机抽取 {Math.min(archiveTier, archiveScanResult.total_count)} 个压缩包测试
		</div>
	{/if}
</div>
