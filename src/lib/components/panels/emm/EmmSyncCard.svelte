<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { Database, RefreshCcw, Check, X, AlertCircle, FolderSync, Wrench, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import {
		emmSyncStore,
		validateEMMConfig,
		syncEMMToThumbnailDb,
		syncEMMIncremental,
		isAllConfigValid,
		type EMMConfigValidation
	} from '$lib/services/emmSyncService';

	let validation = $state<EMMConfigValidation | null>(null);
	let isValidating = $state(false);
	let isSyncing = $state(false);
	let syncProgress = $state({ total: 0, current: 0, phase: 'idle' as string, message: '' });
	let lastSyncTime = $state<string | null>(null);
	let error = $state<string | null>(null);
	let migrateMessage = $state<string | null>(null);
	let isMigrating = $state(false);

	// 订阅 store
	$effect(() => {
		const unsubscribe = emmSyncStore.subscribe((state) => {
			validation = state.validation;
			isValidating = state.isValidating;
			isSyncing = state.isSyncing;
			syncProgress = state.syncProgress;
			lastSyncTime = state.lastSyncTime;
			error = state.error;
		});
		return unsubscribe;
	});

	async function handleValidate() {
		try {
			await validateEMMConfig();
		} catch (e) {
			console.error('验证失败:', e);
		}
	}

	async function handleMigrate() {
		isMigrating = true;
		migrateMessage = null;
		try {
			const result = await invoke<string>('migrate_thumbnail_db');
			migrateMessage = result;
		} catch (e) {
			migrateMessage = `迁移失败: ${e}`;
		} finally {
			isMigrating = false;
		}
	}

	async function handleSync() {
		const result = await syncEMMToThumbnailDb();
		if (!result.success) {
			console.error('同步失败:', result.error);
		}
	}

	async function handleIncrementalSync() {
		const result = await syncEMMIncremental();
		if (!result.success) {
			console.error('增量同步失败:', result.error);
		}
	}

	function getStatusIcon(valid: boolean) {
		return valid ? Check : X;
	}

	function getStatusColor(valid: boolean) {
		return valid ? 'text-green-500' : 'text-red-500';
	}

	function formatSyncTime(iso: string | null): string {
		if (!iso) return '从未同步';
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	}

	const progressPercent = $derived(
		syncProgress.total > 0 ? Math.round((syncProgress.current / syncProgress.total) * 100) : 0
	);

	const canSync = $derived(validation && isAllConfigValid(validation) && !isSyncing);
</script>

<div class="rounded-lg border bg-muted/10 p-3 space-y-3">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2 font-semibold text-sm">
			<FolderSync class="h-4 w-4" />
			<span>EMM 数据同步</span>
		</div>
		<Button
			variant="ghost"
			size="sm"
			class="h-7 px-2 text-[11px]"
			onclick={handleValidate}
			disabled={isValidating}
		>
			<RefreshCcw class="h-3 w-3 mr-1" />
			验证配置
		</Button>
	</div>

	<!-- 配置验证状态 -->
	{#if validation}
		<div class="space-y-1.5 text-xs">
			<div class="flex items-center gap-2">
				<svelte:component
					this={getStatusIcon(validation.mainDatabase.valid)}
					class="h-3.5 w-3.5 {getStatusColor(validation.mainDatabase.valid)}"
				/>
				<span class="text-muted-foreground">主数据库:</span>
				<span class="truncate flex-1" title={validation.mainDatabase.path}>
					{validation.mainDatabase.path || '未配置'}
				</span>
			</div>
			<div class="flex items-center gap-2">
				<svelte:component
					this={getStatusIcon(validation.translationDatabase.valid)}
					class="h-3.5 w-3.5 {getStatusColor(validation.translationDatabase.valid)}"
				/>
				<span class="text-muted-foreground">翻译数据库:</span>
				<span class="truncate flex-1" title={validation.translationDatabase.path}>
					{validation.translationDatabase.path || '未配置'}
				</span>
			</div>
			<div class="flex items-center gap-2">
				<svelte:component
					this={getStatusIcon(validation.settingFile.valid)}
					class="h-3.5 w-3.5 {getStatusColor(validation.settingFile.valid)}"
				/>
				<span class="text-muted-foreground">设置文件:</span>
				<span class="truncate flex-1" title={validation.settingFile.path}>
					{validation.settingFile.path || '未配置'}
				</span>
			</div>
			<div class="flex items-center gap-2">
				<svelte:component
					this={getStatusIcon(validation.translationDict.valid)}
					class="h-3.5 w-3.5 {getStatusColor(validation.translationDict.valid)}"
				/>
				<span class="text-muted-foreground">翻译字典:</span>
				<span class="truncate flex-1" title={validation.translationDict.path}>
					{validation.translationDict.path || '未配置'}
				</span>
			</div>
		</div>
	{:else}
		<p class="text-xs text-muted-foreground">点击"验证配置"检查 EMM 配置文件</p>
	{/if}

	<!-- 同步进度 -->
	{#if isSyncing}
		<div class="space-y-2">
			<Progress value={progressPercent} class="h-2" />
			<p class="text-xs text-muted-foreground">{syncProgress.message}</p>
		</div>
	{/if}

	<!-- 错误信息 -->
	{#if error}
		<div class="flex items-start gap-2 text-xs text-red-500">
			<AlertCircle class="h-3.5 w-3.5 mt-0.5 shrink-0" />
			<span>{error}</span>
		</div>
	{/if}

	<!-- 迁移消息 -->
	{#if migrateMessage}
		<div class="text-xs text-muted-foreground bg-muted/50 rounded p-2">
			{migrateMessage}
		</div>
	{/if}

	<!-- 上次同步时间 -->
	<div class="flex items-center justify-between text-xs text-muted-foreground">
		<span>上次同步: {formatSyncTime(lastSyncTime)}</span>
	</div>

	<!-- 操作按钮 -->
	<div class="flex flex-wrap gap-2">
		<Button
			variant="outline"
			size="sm"
			class="gap-1"
			onclick={handleMigrate}
			disabled={isMigrating || isSyncing}
		>
			<Wrench class="h-3.5 w-3.5" />
			{isMigrating ? '迁移中...' : '迁移'}
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="gap-1"
			onclick={handleIncrementalSync}
			disabled={!canSync}
		>
			<Plus class="h-3.5 w-3.5" />
			{isSyncing ? '同步中...' : '增量'}
		</Button>
		<Button
			size="sm"
			class="gap-1"
			onclick={handleSync}
			disabled={!canSync}
		>
			<Database class="h-3.5 w-3.5" />
			{isSyncing ? '同步中...' : '全量'}
		</Button>
	</div>

	<p class="text-[10px] text-muted-foreground">
		<strong>迁移</strong>：为旧数据库添加字段<br/>
		<strong>增量</strong>：只更新空白条目 · <strong>全量</strong>：重新同步所有
	</p>
</div>
