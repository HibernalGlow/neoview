<script lang="ts">
	import { invoke } from '$lib/api/adapter';
	import { Database, Trash2, FolderX, Clock, Archive, RefreshCcw, Loader2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';

	// 统计类型
	interface MaintenanceStats {
		totalEntries: number;
		folderEntries: number;
		dbSizeBytes: number;
		dbSizeMb: number;
	}

	// 状态
	let stats = $state<MaintenanceStats | null>(null);
	let isLoading = $state(false);
	let message = $state<string | null>(null);
	
	// 过期清理参数
	let expireDays = $state(30);
	let excludeFolders = $state(true);
	
	// 路径清理参数
	let pathPrefix = $state('');

	// 直接使用 invoke 加载 V3 统计
	async function loadStats() {
		isLoading = true;
		message = null;
		try {
			const result = await invoke<{
				total_entries: number;
				folder_entries: number;
				db_size_bytes: number;
				db_size_mb: number;
			}>('get_thumbnail_db_stats_v3');
			stats = {
				totalEntries: result.total_entries,
				folderEntries: result.folder_entries,
				dbSizeBytes: result.db_size_bytes,
				dbSizeMb: result.db_size_mb,
			};
		} catch {
			stats = null;
		} finally {
			isLoading = false;
		}
	}

	// 清理无效路径（V3）
	async function handleCleanupInvalidPaths() {
		isLoading = true;
		message = null;
		try {
			const count = await invoke<number>('cleanup_invalid_paths_v3');
			message = `✅ 已清理 ${count} 条无效路径记录`;
			await loadStats();
		} catch (e) {
			message = `❌ 清理失败: ${e}`;
		} finally {
			isLoading = false;
		}
	}

	// 清理无效 Blob（旧版 API）
	async function handleCleanupInvalidBlob() {
		isLoading = true;
		message = null;
		try {
			const count = await invoke<number>('cleanup_invalid_thumbnails');
			message = `✅ 已清理 ${count} 条空白 Blob 记录`;
			await loadStats();
		} catch (e) {
			message = `❌ 清理失败: ${e}`;
		} finally {
			isLoading = false;
		}
	}

	// 清理过期条目（V3）
	async function handleCleanupExpired() {
		isLoading = true;
		message = null;
		try {
			const count = await invoke<number>('cleanup_expired_entries_v3', { days: expireDays, excludeFolders });
			message = `✅ 已清理 ${count} 条过期记录（>${expireDays}天）`;
			await loadStats();
		} catch (e) {
			message = `❌ 清理失败: ${e}`;
		} finally {
			isLoading = false;
		}
	}

	// 清理指定路径（V3）
	async function handleCleanupByPath() {
		if (!pathPrefix.trim()) {
			message = '⚠️ 请输入路径前缀';
			return;
		}
		isLoading = true;
		message = null;
		try {
			const count = await invoke<number>('cleanup_by_path_prefix_v3', { pathPrefix });
			message = `✅ 已清理 ${count} 条路径匹配记录`;
			await loadStats();
		} catch (e) {
			message = `❌ 清理失败: ${e}`;
		} finally {
			isLoading = false;
		}
	}

	// 压缩数据库（V3）
	async function handleVacuum() {
		isLoading = true;
		message = null;
		try {
			await invoke('vacuum_thumbnail_db_v3');
			message = '✅ 数据库压缩完成';
			await loadStats();
		} catch (e) {
			message = `❌ 压缩失败: ${e}`;
		} finally {
			isLoading = false;
		}
	}
	
	// 旧版规范化
	async function handleNormalize() {
		isLoading = true;
		message = null;
		try {
			const [total, fixed] = await invoke<[number, number]>('normalize_thumbnail_keys');
			message = `✅ 规范化完成：处理 ${total} 条，修复 ${fixed} 条`;
			await loadStats();
		} catch (e) {
			message = `❌ 规范化失败: ${e}`;
		} finally {
			isLoading = false;
		}
	}

	// 格式化文件大小
	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}

	// 初始加载统计
	$effect(() => {
		loadStats();
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2 font-semibold text-sm">
			<Database class="h-4 w-4" />
			<span>缩略图数据库维护</span>
		</div>
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6"
			disabled={isLoading}
			onclick={loadStats}
		>
			{#if isLoading}
				<Loader2 class="h-3 w-3 animate-spin" />
			{:else}
				<RefreshCcw class="h-3 w-3" />
			{/if}
		</Button>
	</div>

	<!-- V3 统计信息 -->
	{#if stats}
		<div class="grid grid-cols-3 gap-2 text-xs">
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground">总条目</div>
				<div class="font-semibold">{stats.totalEntries.toLocaleString()}</div>
			</div>
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground">文件夹</div>
				<div class="font-semibold text-blue-600">{stats.folderEntries.toLocaleString()}</div>
			</div>
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground">数据库</div>
				<div class="font-semibold">{formatSize(stats.dbSizeBytes)}</div>
			</div>
		</div>
	{/if}

	<!-- 消息 -->
	{#if message}
		<div class="text-xs {message.startsWith('✅') ? 'text-green-600' : message.startsWith('⚠️') ? 'text-yellow-600' : 'text-red-600'} bg-muted/50 rounded p-2">
			{message}
		</div>
	{/if}

	<!-- 清理无效记录 -->
	<div class="space-y-2">
		<Label class="text-xs font-medium">清理无效记录</Label>
		<div class="flex flex-wrap gap-2">
			<Button
				variant="outline"
				size="sm"
				class="gap-1 text-xs flex-1"
				disabled={isLoading}
				onclick={handleCleanupInvalidPaths}
			>
				<FolderX class="h-3 w-3" />
				无效路径
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="gap-1 text-xs flex-1"
				disabled={isLoading}
				onclick={handleCleanupInvalidBlob}
			>
				<Trash2 class="h-3 w-3" />
				空白Blob
			</Button>
		</div>
	</div>

	<!-- 清理过期条目 -->
	<div class="space-y-2">
		<Label class="text-xs font-medium">清理过期条目</Label>
		<div class="flex gap-2 items-center">
			<Input
				type="number"
				bind:value={expireDays}
				min={1}
				max={365}
				class="h-7 text-xs w-20"
			/>
			<span class="text-xs text-muted-foreground">天前</span>
		</div>
		<div class="flex items-center gap-2">
			<Checkbox bind:checked={excludeFolders} id="excludeFolders" />
			<Label for="excludeFolders" class="text-xs">保留文件夹缩略图</Label>
		</div>
		<Button
			variant="outline"
			size="sm"
			class="w-full gap-1 text-xs"
			disabled={isLoading}
			onclick={handleCleanupExpired}
		>
			<Clock class="h-3 w-3" />
			清理过期
		</Button>
	</div>

	<!-- 按路径清理 -->
	<div class="space-y-2">
		<Label class="text-xs font-medium">按路径前缀清理</Label>
		<Input
			type="text"
			bind:value={pathPrefix}
			placeholder="例如: D:\Downloads"
			class="h-7 text-xs"
		/>
		<Button
			variant="outline"
			size="sm"
			class="w-full gap-1 text-xs"
			disabled={isLoading || !pathPrefix.trim()}
			onclick={handleCleanupByPath}
		>
			<Trash2 class="h-3 w-3" />
			清理指定路径
		</Button>
	</div>

	<!-- 数据库维护 -->
	<div class="space-y-2">
		<Label class="text-xs font-medium">数据库维护</Label>
		<div class="flex flex-wrap gap-2">
			<Button
				variant="outline"
				size="sm"
				class="gap-1 text-xs"
				disabled={isLoading}
				onclick={handleVacuum}
			>
				<Archive class="h-3 w-3" />
				压缩
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="gap-1 text-xs"
				disabled={isLoading}
				onclick={handleNormalize}
			>
				<RefreshCcw class="h-3 w-3" />
				规范路径
			</Button>
		</div>
	</div>

	<p class="text-[10px] text-muted-foreground">
		<strong>无效路径</strong>：删除文件已不存在的缩略图记录<br/>
		<strong>空白Blob</strong>：删除没有缩略图数据的空条目<br/>
		<strong>清理过期</strong>：删除超过指定天数的旧记录<br/>
		<strong>按路径清理</strong>：删除指定目录下的所有缩略图<br/>
		<strong>压缩</strong>：执行 VACUUM 回收已删除记录占用的空间<br/>
		<strong>规范路径</strong>：统一数据库中的路径格式
	</p>
</div>
