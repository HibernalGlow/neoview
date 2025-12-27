<script lang="ts">
/**
 * 评分面板
 * 从 EmmPanelSection 提取的子组件
 * 负责文件夹评分管理和本书设置
 */
import { Star, ChevronUp, ChevronDown, RefreshCcw, Download, Trash2 } from '@lucide/svelte';
import * as Button from '$lib/components/ui/button';
import * as Input from '$lib/components/ui/input';
import * as Tooltip from '$lib/components/ui/tooltip';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { emmMetadataStore } from '$lib/stores/emmMetadata.svelte';
import { confirm } from '$lib/stores/confirmDialog.svelte';

// 状态
let showFolderRatingsCard = $state(true);
let folderRatingStats = $state<{ count: number; lastUpdated: string | null }>({ count: 0, lastUpdated: null });
let isUpdatingRatings = $state(false);
let folderRatingPath = $state('');

// 订阅文件夹评分缓存
$effect(() => {
	const unsubscribe = folderRatingStore.subscribe((cache) => {
		const count = Object.keys(cache.ratings).length;
		const lastUpdated = cache.lastUpdated ? new Date(cache.lastUpdated).toLocaleString() : null;
		folderRatingStats = { count, lastUpdated };
	});
	return unsubscribe;
});

// 更新文件夹评分
async function handleUpdateFolderRatings() {
	isUpdatingRatings = true;
	try {
		await emmMetadataStore.calculateFolderRatings();
	} finally {
		isUpdatingRatings = false;
	}
}

// 导出文件夹评分为 JSON
function handleExportFolderRatings() {
	const cache = folderRatingStore.exportCache();
	const json = JSON.stringify(cache, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = `neoview-folder-ratings-${Date.now()}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// 重置文件夹评分缓存
async function handleClearFolderRatings() {
	const confirmed = await confirm({
		title: '确认清除',
		description: '确定要清除所有文件夹评分缓存吗？',
		confirmText: '清除',
		cancelText: '取消',
		variant: 'destructive'
	});
	if (confirmed) {
		folderRatingStore.clearCache();
	}
}

// 按路径补充评分
function handleCalculateForPath() {
	if (folderRatingPath.trim()) {
		folderRatingStore.calculateRatingsForPath(folderRatingPath.trim());
	}
}
</script>

<!-- 文件夹评分管理 -->
<div class="border rounded-lg bg-muted/30">
	<button
		type="button"
		class="w-full p-2 flex items-center justify-between text-xs font-medium"
		onclick={() => (showFolderRatingsCard = !showFolderRatingsCard)}
	>
		<div class="flex items-center gap-1.5">
			<Star class="h-3.5 w-3.5 text-amber-500" />
			<span>文件夹平均评分</span>
			<span class="text-muted-foreground">({folderRatingStats.count})</span>
		</div>
		{#if showFolderRatingsCard}
			<ChevronUp class="h-3.5 w-3.5 text-muted-foreground" />
		{:else}
			<ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
		{/if}
	</button>
	{#if showFolderRatingsCard}
		<div class="p-2 pt-0 space-y-2 text-xs">
			<p class="text-muted-foreground">
				基于 EMM 数据库计算的文件夹平均评分缓存。
				{#if folderRatingStats.lastUpdated}
					<br />更新: {folderRatingStats.lastUpdated}
				{/if}
			</p>
			<div class="flex flex-wrap gap-1.5">
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button.Root
							variant="outline"
							size="sm"
							class="h-7 px-2 gap-1 text-[10px]"
							onclick={handleUpdateFolderRatings}
							disabled={isUpdatingRatings}
						>
							<RefreshCcw class="h-3 w-3" />
							{isUpdatingRatings ? '更新中...' : '重算'}
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>重新计算所有文件夹的平均评分</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button.Root
							variant="outline"
							size="sm"
							class="h-7 px-2 gap-1 text-[10px]"
							onclick={handleExportFolderRatings}
							disabled={folderRatingStats.count === 0}
						>
							<Download class="h-3 w-3" />
							导出
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>导出评分缓存为 JSON 文件</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button.Root
							variant="outline"
							size="sm"
							class="h-7 px-2 gap-1 text-[10px] text-destructive hover:text-destructive"
							onclick={handleClearFolderRatings}
							disabled={folderRatingStats.count === 0}
						>
							<Trash2 class="h-3 w-3" />
							清除
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>清除所有评分缓存</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
			<!-- 按路径补充评分 -->
			<div class="flex gap-1.5 items-center">
				<Input.Root
					type="text"
					bind:value={folderRatingPath}
					placeholder="输入路径补充评分..."
					class="h-7 text-[10px] flex-1"
				/>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button.Root
							variant="outline"
							size="sm"
							class="h-7 px-2 gap-1 text-[10px]"
							onclick={handleCalculateForPath}
							disabled={!folderRatingPath || isUpdatingRatings}
						>
							补充
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>根据子文件夹评分补充该路径的评分</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
		</div>
	{/if}
</div>
