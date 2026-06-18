<script lang="ts">
	/**
	 * ActionTab - 快捷操作标签页
	 * 包含预热目录、递归显示、刷新树等快捷操作
	 */
	import { Flame, RefreshCw, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { get } from 'svelte/store';
	import { folderThumbnailLoader, type WarmupProgress } from '$lib/utils/thumbnail';
	import {
		addExcludedPath,
		isPathExcluded,
		removeExcludedPath
	} from '$lib/stores/excludedPaths.svelte';
	import { directoryTreeCache } from '../../../utils/directoryTreeCache';
	import {
		unifiedThumbnailStore,
		generateThumbKey,
		type ThumbnailSource,
		type ThumbnailRequest
	} from '$lib/stores/unifiedThumbnailStore.svelte';
	import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
	import {
		folderTabActions,
		tabSelectedItems,
		tabItems,
		tabCurrentPath
	} from '../../../stores/folderTabStore';
	import * as Progress from '$lib/components/ui/progress';

	interface Props {
		/** 多选模式 */
		multiSelectMode: boolean;
		/** 刷新回调 */
		onRefresh?: () => void;
	}

	let { multiSelectMode, onRefresh }: Props = $props();

	// 预热状态
	let isWarming = $state(false);
	let warmupProgress = $state<WarmupProgress | null>(null);

	// 批量重载缩略图状态
	let isReloadingThumbnails = $state(false);
	let reloadThumbnailsProgress = $state<{ current: number; total: number } | null>(null);

	// 当前路径
	const currentPathStore = tabCurrentPath;

	async function startWarmup() {
		const path = get(currentPathStore);
		if (!path || isWarming) return;

		isWarming = true;
		warmupProgress = null;

		try {
			await folderThumbnailLoader.warmupRecursive(
				path,
				(progress) => {
					warmupProgress = { ...progress };
				},
				3
			);
		} catch (error) {
			console.error('预热失败:', error);
		} finally {
			isWarming = false;
		}
	}

	function cancelWarmup() {
		folderThumbnailLoader.cancelWarmup();
	}

	function handleClearTreeCache() {
		directoryTreeCache.clear();
		onRefresh?.();
	}

	async function handleReloadAllThumbnails() {
		const path = get(currentPathStore);
		if (!path || isReloadingThumbnails) return;

		const tabItemsList = get(tabItems);
		if (tabItemsList.length === 0) {
			showErrorToast('重载缩略图', '当前目录为空');
			return;
		}

		isReloadingThumbnails = true;
		reloadThumbnailsProgress = { current: 0, total: tabItemsList.length };

		try {
			unifiedThumbnailStore.clear();
			const requests: ThumbnailRequest[] = tabItemsList.map((item) => {
				const source: ThumbnailSource = { kind: 'file', path: item.path, fileSize: 0, modified: 0 };
				return { key: generateThumbKey(source, 256), source, maxSize: 256 };
			});
			await unifiedThumbnailStore.requestThumbnails(requests, path, 'visible');
			reloadThumbnailsProgress = { current: tabItemsList.length, total: tabItemsList.length };
			showSuccessToast('重载缩略图', `已重载 ${tabItemsList.length} 个缩略图`);
		} catch (e) {
			console.error('批量重载缩略图失败:', e);
			showErrorToast('重载缩略图', '操作失败');
		} finally {
			isReloadingThumbnails = false;
			reloadThumbnailsProgress = null;
		}
	}

	async function handleReloadSelectedThumbnails() {
		const path = get(currentPathStore);
		if (!path || isReloadingThumbnails) return;

		const selectedItemsSet = get(tabSelectedItems);
		if (selectedItemsSet.size === 0) {
			showErrorToast('重载缩略图', '没有选中的文件');
			return;
		}

		isReloadingThumbnails = true;
		reloadThumbnailsProgress = { current: 0, total: selectedItemsSet.size };

		try {
			unifiedThumbnailStore.clear();
			const requests: ThumbnailRequest[] = [...selectedItemsSet].map((itemPath) => {
				const source: ThumbnailSource = { kind: 'file', path: itemPath, fileSize: 0, modified: 0 };
				return { key: generateThumbKey(source, 256), source, maxSize: 256 };
			});
			await unifiedThumbnailStore.requestThumbnails(requests, path, 'visible');
			reloadThumbnailsProgress = { current: selectedItemsSet.size, total: selectedItemsSet.size };
			showSuccessToast('重载缩略图', `已重载 ${selectedItemsSet.size} 个缩略图`);
		} catch (e) {
			console.error('批量重载选中缩略图失败:', e);
			showErrorToast('重载缩略图', '操作失败');
		} finally {
			isReloadingThumbnails = false;
			reloadThumbnailsProgress = null;
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	<Button
		variant="outline"
		size="sm"
		class="h-7 text-xs {isWarming ? 'border-orange-500 text-orange-500' : ''}"
		onclick={isWarming ? cancelWarmup : startWarmup}
	>
		<Flame class="mr-1 h-3 w-3" />
		{isWarming ? '取消预热' : '预热目录'}
	</Button>
	<Button
		variant="outline"
		size="sm"
		class="h-7 text-xs"
		onclick={() => folderTabActions.toggleRecursiveMode()}
	>
		递归显示
	</Button>
	<Button variant="outline" size="sm" class="h-7 text-xs" onclick={handleClearTreeCache}>
		<RefreshCw class="mr-1 h-3 w-3" />
		刷新树
	</Button>
	<Button
		variant="outline"
		size="sm"
		class="h-7 text-xs"
		onclick={() => folderTabActions.clearHistory()}
	>
		清除历史
	</Button>
	{#if $currentPathStore && !isPathExcluded($currentPathStore)}
		<Button
			variant="outline"
			size="sm"
			class="h-7 text-xs"
			onclick={() => $currentPathStore && addExcludedPath($currentPathStore)}
		>
			<Trash2 class="mr-1 h-3 w-3" />
			排除目录
		</Button>
	{:else if $currentPathStore}
		<Button
			variant="destructive"
			size="sm"
			class="h-7 text-xs"
			onclick={() => $currentPathStore && removeExcludedPath($currentPathStore)}
		>
			取消排除
		</Button>
	{/if}
	<Button
		variant="outline"
		size="sm"
		class="h-7 text-xs {isReloadingThumbnails ? 'border-blue-500 text-blue-500' : ''}"
		onclick={handleReloadAllThumbnails}
		disabled={isReloadingThumbnails}
	>
		<RefreshCw class="mr-1 h-3 w-3 {isReloadingThumbnails ? 'animate-spin' : ''}" />
		{isReloadingThumbnails && reloadThumbnailsProgress
			? `重载中 (${reloadThumbnailsProgress.current}/${reloadThumbnailsProgress.total})`
			: '重载所有缩略图'}
	</Button>
	{#if multiSelectMode}
		<Button
			variant="outline"
			size="sm"
			class="h-7 text-xs {isReloadingThumbnails ? 'border-blue-500 text-blue-500' : ''}"
			onclick={handleReloadSelectedThumbnails}
			disabled={isReloadingThumbnails}
		>
			<RefreshCw class="mr-1 h-3 w-3 {isReloadingThumbnails ? 'animate-spin' : ''}" />
			重载选中缩略图
		</Button>
	{/if}
</div>

<!-- 预热进度条 -->
{#if warmupProgress}
	<div class="mt-2 border-t pt-2">
		<div class="text-muted-foreground flex items-center justify-between text-[10px]">
			<span class="max-w-[200px] truncate">🔥 {warmupProgress.current}</span>
			<span>{warmupProgress.completed}/{warmupProgress.total}</span>
		</div>
		<Progress.Root
			value={warmupProgress.total ? (warmupProgress.completed / warmupProgress.total) * 100 : 0}
			class="mt-1 h-1.5"
		/>
	</div>
{/if}
