<script lang="ts">
	/**
	 * SortPanel - 排序面板
	 * 包含：锁定按钮 | 媒体类型优先 | 排序方式 | 升降序
	 */
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { 
		FileText, HardDrive, Clock, List, Shuffle, 
		ArrowUp, ArrowDown, Video, Image, Lock, LockOpen 
	} from '@lucide/svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import type { PageSortMode, MediaPriorityMode } from '$lib/types/book';
	import { settingsManager } from '$lib/settings/settingsManager';
	import * as bookApi from '$lib/api/book';

	// Props
	interface Props {
		expanded: boolean;
	}
	let { expanded }: Props = $props();

	// 排序分类（不含媒体优先）
	const sortCategories = [
		{ value: 'fileName', label: '文件名', icon: FileText },
		{ value: 'fileSize', label: '文件大小', icon: HardDrive },
		{ value: 'timeStamp', label: '修改时间', icon: Clock },
		{ value: 'entry', label: 'Entry 顺序', icon: List },
		{ value: 'random', label: '随机', icon: Shuffle }
	];

	// 媒体优先选项
	const mediaPriorityOptions: { value: MediaPriorityMode; label: string; icon: typeof Video }[] = [
		{ value: 'videoFirst', label: '视频优先', icon: Video },
		{ value: 'imageFirst', label: '图片优先', icon: Image }
	];

	// 设置状态
	let settings = $state(settingsManager.getSettings());
	let lockedSortMode = $derived(settings.book?.lockedSortMode ?? null);
	let lockedMediaPriority = $derived(settings.book?.lockedMediaPriority ?? null);

	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// 当前媒体优先模式
	let currentMediaPriority = $derived(bookStore.currentBook?.mediaPriorityMode ?? 'none');

	// 处理排序模式变更
	async function handleSortModeChange(mode: PageSortMode) {
		if (!bookStore.currentBook || bookStore.currentBook.sortMode === mode) return;
		await bookStore.setSortMode(mode);
	}

	// 处理媒体优先模式变更
	async function handleMediaPriorityChange(mode: MediaPriorityMode) {
		if (!bookStore.currentBook) return;
		// 点击已选中的则取消
		const newMode = currentMediaPriority === mode ? 'none' : mode;
		try {
			const updatedBook = await bookApi.setMediaPriorityMode(newMode);
			// 更新 bookStore 状态
			if (bookStore.currentBook) {
				Object.assign(bookStore.currentBook, updatedBook);
			}
		} catch (err) {
			console.error('设置媒体优先模式失败:', err);
		}
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

	// 切换锁定状态
	function toggleSortLock() {
		if (lockedSortMode) {
			// 解锁
			settingsManager.updateNestedSettings('book', { 
				lockedSortMode: null,
				lockedMediaPriority: null 
			});
		} else {
			// 锁定当前设置
			const currentMode = bookStore.currentBook?.sortMode ?? 'fileName';
			const currentPriority = bookStore.currentBook?.mediaPriorityMode ?? 'none';
			settingsManager.updateNestedSettings('book', { 
				lockedSortMode: currentMode,
				lockedMediaPriority: currentPriority === 'none' ? null : currentPriority
			});
		}
	}

	// 右键锁定/解锁排序模式
	function handleSortRightClick(e: MouseEvent, categoryValue: string) {
		e.preventDefault();
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

	// 右键锁定/解锁媒体优先模式
	function handleMediaPriorityRightClick(e: MouseEvent, mode: MediaPriorityMode) {
		e.preventDefault();
		if (lockedMediaPriority === mode) {
			settingsManager.updateNestedSettings('book', { lockedMediaPriority: null });
		} else {
			settingsManager.updateNestedSettings('book', { lockedMediaPriority: mode });
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

	// 是否有任何锁定
	let isAnyLocked = $derived(lockedSortMode !== null || lockedMediaPriority !== null);
</script>

{#if expanded && bookStore.currentBook}
	<div class="flex flex-wrap items-center justify-center gap-2 border-t border-border/50 pt-1">
		<!-- 锁定按钮 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={isAnyLocked ? 'default' : 'ghost'}
					size="sm"
					class="h-7 w-7 rounded-full p-0 {isAnyLocked ? 'bg-primary text-primary-foreground' : ''}"
					onclick={toggleSortLock}
				>
					{#if isAnyLocked}
						<Lock class="h-3.5 w-3.5" />
					{:else}
						<LockOpen class="h-3.5 w-3.5" />
					{/if}
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{isAnyLocked ? '点击解锁排序设置' : '点击锁定当前排序设置'}</p>
				{#if isAnyLocked}
					<p class="text-xs text-muted-foreground">打开新书时将自动应用</p>
				{/if}
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 分隔符 -->
		<div class="w-px h-5 bg-border/50"></div>

		<!-- 媒体类型优先 -->
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			{#each mediaPriorityOptions as option}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{@const MediaIcon = option.icon}
						<Button
							variant={currentMediaPriority === option.value ? 'default' : 'ghost'}
							size="sm"
							class="h-7 w-7 rounded-full p-0 {lockedMediaPriority === option.value ? 'ring-2 ring-primary ring-offset-1' : ''}"
							onclick={() => handleMediaPriorityChange(option.value)}
							oncontextmenu={(e: MouseEvent) => handleMediaPriorityRightClick(e, option.value)}
						>
							<MediaIcon class="h-3.5 w-3.5" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p class="font-medium">{option.label}</p>
						<p class="text-xs text-muted-foreground">
							{currentMediaPriority === option.value ? '点击取消' : '点击启用'}
						</p>
						<p class="text-xs text-muted-foreground">
							{lockedMediaPriority === option.value ? '右键解锁' : '右键锁定'}
						</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/each}
		</div>

		<!-- 分隔符 -->
		<div class="w-px h-5 bg-border/50"></div>

		<!-- 排序方式 -->
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			{#each sortCategories as category}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{@const CategoryIcon = category.icon}
						<Button
							variant={getCurrentSortCategory() === category.value ? 'default' : 'ghost'}
							size="sm"
							class="h-7 w-7 rounded-full p-0 relative {isCategoryLocked(category.value) ? 'ring-2 ring-primary ring-offset-1' : ''}"
							onclick={() => toggleSortDirection(category.value)}
							oncontextmenu={(e: MouseEvent) => handleSortRightClick(e, category.value)}
						>
							<CategoryIcon class="h-3 w-3" />
							{#if getCurrentSortCategory() === category.value && category.value !== 'random'}
								{#if isCurrentSortDescending()}
									<ArrowDown class="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-primary" />
								{:else}
									<ArrowUp class="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-primary" />
								{/if}
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
					<Tooltip.Content><p>升序</p></Tooltip.Content>
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
					<Tooltip.Content><p>降序</p></Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>
	</div>
{/if}
