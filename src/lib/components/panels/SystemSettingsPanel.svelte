<script lang="ts">
	/**
	 * 系统设置面板
	 * 包含排除路径管理等系统级设置
	 */
	import { Monitor, FolderX, Plus, Trash2, RefreshCw } from '@lucide/svelte';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { settingsManager } from '$lib/settings/settingsManager';
	import * as FileSystemAPI from '$lib/api/filesystem';
	import {
		getExcludedPaths,
		addExcludedPath,
		removeExcludedPath,
		getSystemProtectedFolders,
		clearRuntimeBlacklist,
		getRuntimeBlacklist
	} from '$lib/stores/pathBlacklist.svelte';

	let currentSettings = $state(settingsManager.getSettings());
	let newExcludedPath = $state('');
	let runtimeBlacklistCount = $state(getRuntimeBlacklist().length);

	// 用户配置的排除路径
	let excludedPaths = $derived(currentSettings.system.excludedPaths ?? []);
	
	// 预设的系统保护文件夹
	const systemProtectedFolders = getSystemProtectedFolders();

	settingsManager.addListener((s) => {
		currentSettings = s;
	});

	// 选择文件夹添加到排除列表
	async function selectFolderToExclude() {
		try {
			const path = await FileSystemAPI.selectFolder();
			if (path) {
				addExcludedPath(path);
			}
		} catch (err) {
			console.error('选择文件夹失败:', err);
		}
	}

	// 手动输入路径添加
	function addManualPath() {
		if (newExcludedPath.trim()) {
			addExcludedPath(newExcludedPath.trim());
			newExcludedPath = '';
		}
	}

	// 移除排除路径
	function removePath(path: string) {
		removeExcludedPath(path);
	}

	// 清空运行时黑名单
	function handleClearRuntimeBlacklist() {
		clearRuntimeBlacklist();
		runtimeBlacklistCount = 0;
	}

	// 刷新运行时黑名单计数
	function refreshRuntimeCount() {
		runtimeBlacklistCount = getRuntimeBlacklist().length;
	}
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Monitor class="h-5 w-5" />
			系统设置
		</h3>
		<p class="text-muted-foreground text-sm">配置系统级行为和排除路径</p>
	</div>

	<!-- 排除路径管理 -->
	<div class="space-y-4 rounded-lg border bg-card p-4">
		<div class="flex items-center gap-2">
			<FolderX class="h-4 w-4 text-muted-foreground" />
			<Label class="text-sm font-semibold">排除路径</Label>
		</div>
		<p class="text-xs text-muted-foreground">
			这些路径将被跳过元数据扫描，避免对系统保护文件夹的重复访问请求。
		</p>

		<!-- 添加新路径 -->
		<div class="flex items-center gap-2">
			<Input
				bind:value={newExcludedPath}
				placeholder="输入路径或点击选择文件夹"
				class="flex-1"
				onkeydown={(e) => e.key === 'Enter' && addManualPath()}
			/>
			<Button variant="outline" size="sm" onclick={addManualPath} disabled={!newExcludedPath.trim()}>
				<Plus class="h-4 w-4" />
			</Button>
			<Button variant="outline" size="sm" onclick={selectFolderToExclude}>
				选择文件夹
			</Button>
		</div>

		<!-- 用户配置的排除路径列表 -->
		{#if excludedPaths.length > 0}
			<div class="space-y-2">
				<Label class="text-xs text-muted-foreground">已配置的排除路径：</Label>
				<div class="max-h-48 space-y-1 overflow-auto">
					{#each excludedPaths as path}
						<div class="flex items-center justify-between rounded bg-secondary/50 px-2 py-1">
							<span class="truncate text-xs" title={path}>{path}</span>
							<Button
								variant="ghost"
								size="sm"
								class="h-6 w-6 p-0 text-destructive hover:text-destructive"
								onclick={() => removePath(path)}
							>
								<Trash2 class="h-3 w-3" />
							</Button>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<p class="text-xs text-muted-foreground italic">暂无自定义排除路径</p>
		{/if}

		<!-- 预设的系统保护文件夹 -->
		<div class="space-y-2 border-t pt-4">
			<Label class="text-xs text-muted-foreground">预设的系统保护文件夹（自动排除）：</Label>
			<div class="flex flex-wrap gap-1">
				{#each systemProtectedFolders as folder}
					<span class="rounded bg-muted px-2 py-0.5 text-xs">{folder}</span>
				{/each}
			</div>
		</div>

		<!-- 运行时黑名单信息 -->
		<div class="space-y-2 border-t pt-4">
			<div class="flex items-center justify-between">
				<Label class="text-xs text-muted-foreground">
					运行时黑名单（访问失败的路径，重启后清空）：
				</Label>
				<div class="flex items-center gap-1">
					<Button variant="ghost" size="sm" class="h-6 px-2" onclick={refreshRuntimeCount}>
						<RefreshCw class="h-3 w-3" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="h-6 px-2 text-xs"
						onclick={handleClearRuntimeBlacklist}
						disabled={runtimeBlacklistCount === 0}
					>
						清空 ({runtimeBlacklistCount})
					</Button>
				</div>
			</div>
		</div>
	</div>
</div>
