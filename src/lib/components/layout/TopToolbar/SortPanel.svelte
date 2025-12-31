<script lang="ts">
	/**
	 * SortPanel - 排序面板
	 * 包含页面排序选项、升降序切换和锁定功能
	 */
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { FileText, HardDrive, Clock, List, Shuffle, ArrowUp, ArrowDown, Video, Image, Lock } from '@lucide/svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import type { PageSortMode } from '$lib/types/book';
	import { settingsManager } from '$lib/settings/settingsManager';

	// Props
	interface Props {
		expanded: boolean;
	}
	let { expanded }: Props = $props();

	// 排序分类
	const sortCategories = [
		{ value: 'fileName', label: '文件名', icon: FileText },
		{ value: 'fileSize', label: '文件大小', icon: HardDrive },
		{ value: 'timeStamp', label: '修改时间', icon: Clock },
		{ value: 'entry', label: 'Entry 顺序', icon: List },
		{ value: 'videoFirst', label: '视频优先', icon: Video },
		{ value: 'imageFirst', label: '图片优先', icon: Image },
		{ value: 'random', label: '随机', icon: Shuffle }
	];

	// 锁定的排序模式
	let settings = $state(settingsManager.getSettings());
	let lockedSortMode = $derived(settings.book?.lockedSortMode ?? null);

	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// 处理排序模式变更
	async function handleSortModeChange(mode: PageSortMode) {
		if (!bookStore.currentBook || bookStore.currentBook.sortMode === mode) return;
		await bookStore.setSortMode(mode);
	}

	// 切换排序方向
	function toggleSortDirection(categoryValue: string) {
		const currentMode = bookStore.currentBook?.sortMode;
		if (!currentMode) return;
		
		if (!currentMode.startsWith(categoryValue)) {
			handleSortModeChange(categoryValue as PageSortMode);
		} else {
			const isDescending = currentMode.includes('Descending');
			const newMode = isDescending 
				? (categoryValue as PageSortMode) 
				: (`${categoryValue}Descending` as PageSortMode);
			handleSortModeChange(newMode);
		}
	}

	// 锁定/解锁排序模式
	function toggleSortLock(categoryValue: string) {
		const currentMode = bookStore.currentBook?.sortMode;
		if (!currentMode) return;

		// 如果当前已锁定该模式，则解锁
		if (lockedSortMode && lockedSortMode.startsWith(categoryValue)) {
			settingsManager.updateNestedSettings('book', { lockedSortMode: null });
		} else {
			// 锁定当前排序模式
			const modeToLock = currentMode.startsWith(categoryValue) 
				? currentMode 
				: (categoryValue as PageSortMode);
			settingsManager.updateNestedSettings('book', { lockedSortMode: modeToLock });
		}
	}

	// 获取当前排序分类
	function getCurrentSortCategory(): string {
		const currentMode = bookStore.currentBook?.sortMode;
		if (!currentMode) return 'fileName';
		return currentMode.replace('Descending', '');
	}

	// 是否为降序
	function isCurrentSortDescending(): boolean {
		return bookStore.currentBook?.sortMode?.includes('Descending') ?? false;
	}

	// 检查某个分类是否被锁定
	function isCategoryLocked(categoryValue: string): boolean {
		return lockedSortMode !== null && lockedSortMode.startsWith(categoryValue);
	}
</script>

{#if expanded && bookStore.currentBook}
	<div class="flex flex-wrap items-center justify-center gap-1 border-t border-border/50 pt-1">
		<!-- 合并的排序图标行 -->
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			{#each sortCategories as category}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={getCurrentSortCategory() === category.value ? 'default' : 'ghost'}
							size="sm"
							class="h-7 w-7 rounded-full p-0 relative {isCategoryLocked(category.value) ? 'ring-2 ring-primary' : ''}"
							onclick={() => toggleSortDirection(category.value)}
							oncontextmenu={(e: MouseEvent) => {
								e.preventDefault();
								toggleSortLock(category.value);
							}}
						>
							<svelte:component this={category.icon} class="h-3 w-3" />
							{#if getCurrentSortCategory() === category.value && category.value !== 'random'}
								{#if isCurrentSortDescending()}
									<ArrowDown class="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-primary" />
								{:else}
									<ArrowUp class="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-primary" />
								{/if}
							{/if}
							{#if isCategoryLocked(category.value)}
								<Lock class="h-2 w-2 absolute -top-0.5 -right-0.5 text-primary" />
							{/if}
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p class="font-medium">{category.label}</p>
						{#if getCurrentSortCategory() === category.value && category.value !== 'random'}
							<p class="text-xs text-muted-foreground">
								{isCurrentSortDescending() ? '降序' : '升序'} - 点击切换
							</p>
						{:else}
							<p class="text-xs text-muted-foreground">点击切换排序</p>
						{/if}
						<p class="text-xs text-muted-foreground">
							{isCategoryLocked(category.value) ? '右键解锁' : '右键锁定'}
						</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/each}
			
			<!-- 分隔符 -->
			<div class="w-px h-4 bg-border/50 mx-1"></div>
			
			<!-- 独立的升序降序按钮 -->
			{#if getCurrentSortCategory() !== 'random'}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={!isCurrentSortDescending() ? 'default' : 'ghost'}
							size="sm"
							class="h-6 w-6 rounded-full p-0"
							onclick={() => handleSortModeChange(getCurrentSortCategory() as PageSortMode)}
						>
							<ArrowUp class="h-3 w-3" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>升序</p>
					</Tooltip.Content>
				</Tooltip.Root>
				
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={isCurrentSortDescending() ? 'default' : 'ghost'}
							size="sm"
							class="h-6 w-6 rounded-full p-0"
							onclick={() => handleSortModeChange(`${getCurrentSortCategory()}Descending` as PageSortMode)}
						>
							<ArrowDown class="h-3 w-3" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>降序</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>
	</div>
{/if}
