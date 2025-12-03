<script lang="ts">
	import { Database, Trash2, Archive, Clock, FolderX, Loader2 } from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import * as thumbnailStore from '$lib/stores/thumbnailStoreV3.svelte';
	import type { MaintenanceStats } from '$lib/stores/thumbnailStoreV3.svelte';

	// 状态
	let stats = $state<MaintenanceStats | null>(null);
	let loading = $state(false);
	let actionResult = $state<string | null>(null);
	
	// 过期清理参数
	let expireDays = $state(30);
	let excludeFolders = $state(true);
	
	// 路径清理参数
	let pathPrefix = $state('');

	// 加载统计
	async function loadStats() {
		loading = true;
		actionResult = null;
		try {
			stats = await thumbnailStore.getDbStats();
		} catch (e) {
			actionResult = `获取统计失败: ${e}`;
		} finally {
			loading = false;
		}
	}

	// 清理无效路径
	async function handleCleanupInvalid() {
		loading = true;
		actionResult = null;
		try {
			const count = await thumbnailStore.cleanupInvalidPaths();
			actionResult = `✅ 已清理 ${count} 条无效路径记录`;
			await loadStats();
		} catch (e) {
			actionResult = `❌ 清理失败: ${e}`;
		} finally {
			loading = false;
		}
	}

	// 清理过期条目
	async function handleCleanupExpired() {
		loading = true;
		actionResult = null;
		try {
			const count = await thumbnailStore.cleanupExpiredEntries(expireDays, excludeFolders);
			actionResult = `✅ 已清理 ${count} 条过期记录（>${expireDays}天）`;
			await loadStats();
		} catch (e) {
			actionResult = `❌ 清理失败: ${e}`;
		} finally {
			loading = false;
		}
	}

	// 清理指定路径
	async function handleCleanupByPath() {
		if (!pathPrefix.trim()) {
			actionResult = '⚠️ 请输入路径前缀';
			return;
		}
		loading = true;
		actionResult = null;
		try {
			const count = await thumbnailStore.cleanupByPathPrefix(pathPrefix);
			actionResult = `✅ 已清理 ${count} 条路径匹配记录`;
			await loadStats();
		} catch (e) {
			actionResult = `❌ 清理失败: ${e}`;
		} finally {
			loading = false;
		}
	}

	// 压缩数据库
	async function handleVacuum() {
		loading = true;
		actionResult = null;
		try {
			const success = await thumbnailStore.vacuumDb();
			if (success) {
				actionResult = '✅ 数据库压缩完成';
				await loadStats();
			} else {
				actionResult = '❌ 数据库压缩失败';
			}
		} catch (e) {
			actionResult = `❌ 压缩失败: ${e}`;
		} finally {
			loading = false;
		}
	}

	// 初始加载
	$effect(() => {
		loadStats();
	});

	// 格式化文件大小
	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}
</script>

<Card.Root class="w-full">
	<Card.Header class="pb-2">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Database class="h-4 w-4 text-blue-500" />
				<Card.Title class="text-sm">缩略图数据库</Card.Title>
			</div>
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				disabled={loading}
				onclick={loadStats}
			>
				{#if loading}
					<Loader2 class="h-3 w-3 animate-spin" />
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 12a9 9 0 11-9-9" />
						<polyline points="21 3 21 9 15 9" />
					</svg>
				{/if}
			</Button>
		</div>
		<Card.Description class="text-xs">管理缩略图缓存数据库</Card.Description>
	</Card.Header>

	<Card.Content class="space-y-3">
		<!-- 统计信息 -->
		{#if stats}
			<div class="grid grid-cols-2 gap-2 text-xs">
				<div class="flex items-center gap-1">
					<span class="text-muted-foreground">总条目:</span>
					<Badge variant="secondary">{stats.totalEntries}</Badge>
				</div>
				<div class="flex items-center gap-1">
					<span class="text-muted-foreground">文件夹:</span>
					<Badge variant="outline">{stats.folderEntries}</Badge>
				</div>
				<div class="col-span-2 flex items-center gap-1">
					<span class="text-muted-foreground">数据库大小:</span>
					<Badge variant="default">{formatSize(stats.dbSizeBytes)}</Badge>
				</div>
			</div>
		{/if}

		<!-- 操作结果 -->
		{#if actionResult}
			<p class="text-xs {actionResult.startsWith('✅') ? 'text-green-600' : actionResult.startsWith('⚠️') ? 'text-yellow-600' : 'text-red-600'}">
				{actionResult}
			</p>
		{/if}

		<!-- 清理无效路径 -->
		<div class="space-y-1">
			<Label class="text-xs">清理无效路径</Label>
			<Button
				variant="outline"
				size="sm"
				class="w-full text-xs"
				disabled={loading}
				onclick={handleCleanupInvalid}
			>
				<FolderX class="h-3 w-3 mr-1" />
				清理不存在的文件
			</Button>
		</div>

		<!-- 清理过期条目 -->
		<div class="space-y-1">
			<Label class="text-xs">清理过期条目</Label>
			<div class="flex gap-2 items-center">
				<Input
					type="number"
					bind:value={expireDays}
					min={1}
					max={365}
					class="h-7 text-xs w-16"
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
				class="w-full text-xs"
				disabled={loading}
				onclick={handleCleanupExpired}
			>
				<Clock class="h-3 w-3 mr-1" />
				清理过期
			</Button>
		</div>

		<!-- 按路径清理 -->
		<div class="space-y-1">
			<Label class="text-xs">按路径前缀清理</Label>
			<Input
				type="text"
				bind:value={pathPrefix}
				placeholder="例如: D:\Downloads"
				class="h-7 text-xs"
			/>
			<Button
				variant="outline"
				size="sm"
				class="w-full text-xs"
				disabled={loading || !pathPrefix.trim()}
				onclick={handleCleanupByPath}
			>
				<Trash2 class="h-3 w-3 mr-1" />
				清理指定路径
			</Button>
		</div>

		<!-- 压缩数据库 -->
		<div class="space-y-1">
			<Label class="text-xs">数据库维护</Label>
			<Button
				variant="outline"
				size="sm"
				class="w-full text-xs"
				disabled={loading}
				onclick={handleVacuum}
			>
				<Archive class="h-3 w-3 mr-1" />
				压缩数据库 (VACUUM)
			</Button>
		</div>
	</Card.Content>
</Card.Root>
