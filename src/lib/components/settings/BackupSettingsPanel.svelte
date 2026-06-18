<script lang="ts">
	/**
	 * NeoView - Backup Settings Panel
	 * 备份设置面板
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import * as Select from '$lib/components/ui/select';
	import { autoBackupStore, type BackupInfo } from '$lib/stores/autoBackup.svelte';
	import { showSuccessToast, showErrorToast, showInfoToast } from '$lib/utils/toast';
	import {
		FolderOpen,
		Download,
		Upload,
		Trash2,
		Clock,
		HardDrive,
		RefreshCw,
		Save,
		History,
		Filter,
		Plus,
		X,
		Search
	} from '@lucide/svelte';
	import { onMount } from 'svelte';

	// 设置状态
	let settings = $derived(autoBackupStore.currentSettings);
	let isBackingUp = $derived(autoBackupStore.backing);
	let backupError = $derived(autoBackupStore.error);

	// 备份列表
	let backups = $state<BackupInfo[]>([]);
	let loadingBackups = $state(false);

	// 排除配置
	let newExcludedKey = $state('');
	let showAnalysis = $state(false);
	let analysisData = $state<
		Array<{ key: string; lines: number; size: number; excluded: boolean; reason?: string }>
	>([]);

	// 间隔选项
	const intervalOptions = [
		{ value: '15', label: '15 分钟' },
		{ value: '30', label: '30 分钟' },
		{ value: '60', label: '1 小时' },
		{ value: '120', label: '2 小时' },
		{ value: '360', label: '6 小时' },
		{ value: '720', label: '12 小时' },
		{ value: '1440', label: '24 小时' }
	];

	// 加载备份列表
	async function loadBackups() {
		loadingBackups = true;
		try {
			backups = await autoBackupStore.listBackups();
			backups.sort((a, b) => b.timestamp - a.timestamp);
		} catch (e) {
			console.error('加载备份列表失败:', e);
		} finally {
			loadingBackups = false;
		}
	}

	// 选择备份目录
	async function selectBackupPath() {
		const path = await autoBackupStore.selectBackupPath();
		if (path) {
			showSuccessToast('备份目录已设置');
			loadBackups();
		}
	}

	// 手动备份
	async function manualBackup() {
		const success = await autoBackupStore.manualBackup();
		if (success) {
			showSuccessToast('备份成功');
			loadBackups();
		} else {
			showErrorToast('备份失败', backupError || '未知错误');
		}
	}

	// 导出到文件
	async function exportToFile() {
		const success = await autoBackupStore.exportToFile();
		if (success) {
			showSuccessToast('导出成功');
		} else {
			showErrorToast('导出失败');
		}
	}

	// 从文件导入
	async function importFromFile() {
		const success = await autoBackupStore.importFromFile();
		if (success) {
			showSuccessToast('导入成功，部分设置可能需要重启应用生效');
		} else {
			showErrorToast('导入失败');
		}
	}

	// 从备份恢复
	async function restoreBackup(backup: BackupInfo) {
		if (!confirm(`确定要从备份 "${backup.filename}" 恢复吗？这将覆盖当前所有设置。`)) {
			return;
		}
		const success = await autoBackupStore.restoreFromBackup(backup.path);
		if (success) {
			showSuccessToast('恢复成功，部分设置可能需要重启应用生效');
		} else {
			showErrorToast('恢复失败');
		}
	}

	// 删除备份
	async function deleteBackup(backup: BackupInfo) {
		if (!confirm(`确定要删除备份 "${backup.filename}" 吗？`)) {
			return;
		}
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			await invoke('delete_file', { path: backup.path });
			showSuccessToast('备份已删除');
			loadBackups();
		} catch (e) {
			showErrorToast('删除失败');
		}
	}

	// 格式化文件大小
	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// 格式化时间
	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleString('zh-CN');
	}

	// 添加排除键
	function addExcludedKey() {
		if (!newExcludedKey.trim()) return;
		const exclusion = settings.exclusion || {
			excludedKeys: [],
			excludedModules: [],
			autoExcludeLargeData: true,
			maxLineCount: 1000
		};
		if (!exclusion.excludedKeys.includes(newExcludedKey.trim())) {
			autoBackupStore.updateSettings({
				exclusion: {
					...exclusion,
					excludedKeys: [...exclusion.excludedKeys, newExcludedKey.trim()]
				}
			});
		}
		newExcludedKey = '';
	}

	// 移除排除键
	function removeExcludedKey(key: string) {
		const exclusion = settings.exclusion || {
			excludedKeys: [],
			excludedModules: [],
			autoExcludeLargeData: true,
			maxLineCount: 1000
		};
		autoBackupStore.updateSettings({
			exclusion: {
				...exclusion,
				excludedKeys: exclusion.excludedKeys.filter((k) => k !== key)
			}
		});
	}

	// 分析 localStorage
	function analyzeStorage() {
		analysisData = autoBackupStore.analyzeLocalStorage();
		showAnalysis = true;
	}

	onMount(() => {
		if (settings.backupPath) {
			loadBackups();
		}
	});
</script>

<div class="space-y-6 p-4">
	<!-- 自动备份设置 -->
	<div class="space-y-4">
		<div>
			<h3 class="flex items-center gap-2 text-lg font-semibold">
				<Clock class="h-5 w-5" />
				自动备份
			</h3>
			<p class="text-muted-foreground text-sm">定时自动备份所有应用数据</p>
		</div>

		<!-- 启用开关 -->
		<div class="flex items-center justify-between">
			<Label for="auto-backup-enabled">启用自动备份</Label>
			<Switch
				id="auto-backup-enabled"
				checked={settings.enabled}
				onCheckedChange={(checked) => autoBackupStore.updateSettings({ enabled: checked })}
			/>
		</div>

		<!-- 备份间隔 -->
		<div class="space-y-2">
			<Label>备份间隔</Label>
			<Select.Root
				type="single"
				value={String(settings.intervalMinutes)}
				onValueChange={(v) => {
					if (v) {
						autoBackupStore.updateSettings({ intervalMinutes: parseInt(v) });
					}
				}}
			>
				<Select.Trigger class="w-full">
					{intervalOptions.find((o) => o.value === String(settings.intervalMinutes))?.label ||
						'选择间隔'}
				</Select.Trigger>
				<Select.Content>
					{#each intervalOptions as option}
						<Select.Item value={option.value}>{option.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<!-- 最大备份数 -->
		<div class="space-y-2">
			<Label for="max-backups">最大保留备份数</Label>
			<Input
				id="max-backups"
				type="number"
				min="1"
				max="100"
				value={settings.maxBackups}
				onchange={(e) => {
					const target = e.target as HTMLInputElement;
					autoBackupStore.updateSettings({ maxBackups: parseInt(target.value) || 10 });
				}}
				class="w-24"
			/>
		</div>

		<!-- 包含所有 localStorage -->
		<div class="flex items-center justify-between">
			<div>
				<Label for="include-all-storage">包含所有本地数据</Label>
				<p class="text-muted-foreground text-xs">包含所有 localStorage 数据以确保完整恢复</p>
			</div>
			<Switch
				id="include-all-storage"
				checked={settings.includeAllLocalStorage}
				onCheckedChange={(checked) =>
					autoBackupStore.updateSettings({ includeAllLocalStorage: checked })}
			/>
		</div>

		<!-- 排除配置 -->
		{#if settings.includeAllLocalStorage}
			<div class="space-y-3 rounded-lg border p-3">
				<div class="flex items-center justify-between">
					<div>
						<Label class="flex items-center gap-2">
							<Filter class="h-4 w-4" />
							排除配置
						</Label>
						<p class="text-muted-foreground text-xs">配置备份时排除的数据项</p>
					</div>
					<Button variant="outline" size="sm" onclick={analyzeStorage}>
						<Search class="mr-1 h-3 w-3" />
						分析
					</Button>
				</div>

				<!-- 自动排除大数据 -->
				<div class="flex items-center justify-between">
					<div>
						<Label for="auto-exclude-large" class="text-sm">自动排除大数据</Label>
						<p class="text-muted-foreground text-xs">自动排除超过指定行数的数据</p>
					</div>
					<Switch
						id="auto-exclude-large"
						checked={settings.exclusion?.autoExcludeLargeData ?? true}
						onCheckedChange={(checked) => {
							const exclusion = settings.exclusion || {
								excludedKeys: [],
								excludedModules: [],
								autoExcludeLargeData: true,
								maxLineCount: 1000
							};
							autoBackupStore.updateSettings({
								exclusion: { ...exclusion, autoExcludeLargeData: !!checked }
							});
						}}
					/>
				</div>

				<!-- 最大行数 -->
				{#if settings.exclusion?.autoExcludeLargeData ?? true}
					<div class="flex items-center justify-between gap-2">
						<Label class="text-sm">最大行数阈值</Label>
						<Input
							type="number"
							min="100"
							max="10000"
							step="100"
							value={settings.exclusion?.maxLineCount ?? 1000}
							onchange={(e) => {
								const target = e.target as HTMLInputElement;
								const exclusion = settings.exclusion || {
									excludedKeys: [],
									excludedModules: [],
									autoExcludeLargeData: true,
									maxLineCount: 1000
								};
								autoBackupStore.updateSettings({
									exclusion: { ...exclusion, maxLineCount: parseInt(target.value) || 1000 }
								});
							}}
							class="w-24"
						/>
					</div>
				{/if}

				<!-- 手动排除列表 -->
				<div class="space-y-2">
					<Label class="text-sm">手动排除的键名</Label>
					<div class="flex gap-2">
						<Input
							bind:value={newExcludedKey}
							placeholder="输入要排除的 localStorage 键名"
							class="flex-1 text-sm"
							onkeydown={(e) => e.key === 'Enter' && addExcludedKey()}
						/>
						<Button variant="outline" size="icon" onclick={addExcludedKey}>
							<Plus class="h-4 w-4" />
						</Button>
					</div>
					{#if (settings.exclusion?.excludedKeys?.length ?? 0) > 0}
						<div class="flex flex-wrap gap-1.5">
							{#each settings.exclusion?.excludedKeys ?? [] as key}
								<span
									class="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
								>
									{key}
									<button
										type="button"
										class="hover:text-destructive"
										onclick={() => removeExcludedKey(key)}
									>
										<X class="h-3 w-3" />
									</button>
								</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- 数据分析弹窗 -->
		{#if showAnalysis}
			<div class="space-y-2 rounded-lg border p-3">
				<div class="flex items-center justify-between">
					<Label class="text-sm font-semibold">localStorage 数据分析</Label>
					<Button variant="ghost" size="sm" onclick={() => (showAnalysis = false)}>
						<X class="h-4 w-4" />
					</Button>
				</div>
				<div class="max-h-48 space-y-1 overflow-y-auto">
					{#each analysisData as item}
						<div
							class="flex items-center justify-between rounded p-1.5 text-xs {item.excluded
								? 'bg-destructive/10 text-destructive'
								: 'hover:bg-muted'}"
						>
							<span class="flex-1 truncate" title={item.key}>{item.key}</span>
							<span class="text-muted-foreground mx-2">{item.lines}行</span>
							<span class="text-muted-foreground">{formatSize(item.size)}</span>
							{#if item.excluded}
								<span class="text-destructive ml-2">({item.reason})</span>
							{/if}
						</div>
					{/each}
				</div>
				<p class="text-muted-foreground text-xs">
					共 {analysisData.length} 项，排除 {analysisData.filter((i) => i.excluded).length} 项
				</p>
			</div>
		{/if}

		<!-- 备份目录 -->
		<div class="space-y-2">
			<Label>备份目录</Label>
			<div class="flex items-center gap-2">
				<Input value={settings.backupPath || '未设置'} readonly class="flex-1 text-sm" />
				<Button variant="outline" size="icon" onclick={selectBackupPath}>
					<FolderOpen class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<!-- 状态信息 -->
		{#if settings.enabled}
			<div class="bg-muted/50 space-y-1 rounded-lg p-3 text-sm">
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">上次备份:</span>
					<span>{autoBackupStore.formatTime(settings.lastBackupTime)}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">下次备份:</span>
					<span>{autoBackupStore.formatTime(autoBackupStore.nextBackupTime)}</span>
				</div>
			</div>
		{/if}

		<!-- 手动备份按钮 -->
		<Button
			variant="default"
			class="w-full"
			onclick={manualBackup}
			disabled={isBackingUp || !settings.backupPath}
		>
			{#if isBackingUp}
				<RefreshCw class="mr-2 h-4 w-4 animate-spin" />
				备份中...
			{:else}
				<Save class="mr-2 h-4 w-4" />
				立即备份
			{/if}
		</Button>
	</div>

	<Separator />

	<!-- 导入导出 -->
	<div class="space-y-4">
		<div>
			<h3 class="flex items-center gap-2 text-lg font-semibold">
				<HardDrive class="h-5 w-5" />
				手动导入导出
			</h3>
			<p class="text-muted-foreground text-sm">手动导出或导入完整备份文件</p>
		</div>

		<div class="flex gap-2">
			<Button variant="outline" class="flex-1" onclick={exportToFile}>
				<Download class="mr-2 h-4 w-4" />
				导出备份
			</Button>
			<Button variant="outline" class="flex-1" onclick={importFromFile}>
				<Upload class="mr-2 h-4 w-4" />
				导入备份
			</Button>
		</div>
	</div>

	<Separator />

	<!-- 备份历史 -->
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="flex items-center gap-2 text-lg font-semibold">
					<History class="h-5 w-5" />
					备份历史
				</h3>
				<p class="text-muted-foreground text-sm">已保存的备份文件</p>
			</div>
			<Button variant="ghost" size="icon" onclick={loadBackups} disabled={loadingBackups}>
				<RefreshCw class="h-4 w-4 {loadingBackups ? 'animate-spin' : ''}" />
			</Button>
		</div>

		{#if !settings.backupPath}
			<div class="text-muted-foreground py-8 text-center">
				<p>请先设置备份目录</p>
			</div>
		{:else if backups.length === 0}
			<div class="text-muted-foreground py-8 text-center">
				<p>暂无备份</p>
			</div>
		{:else}
			<div class="max-h-64 space-y-2 overflow-y-auto">
				{#each backups as backup}
					<div
						class="hover:bg-accent flex items-center justify-between rounded-lg border p-3 transition-colors"
					>
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-medium">{backup.filename}</div>
							<div class="text-muted-foreground text-xs">
								{formatTime(backup.timestamp)} · {formatSize(backup.size)}
							</div>
						</div>
						<div class="ml-2 flex items-center gap-1">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => restoreBackup(backup)}
								title="恢复此备份"
							>
								<Upload class="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => deleteBackup(backup)}
								title="删除此备份"
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
