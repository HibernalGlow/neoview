<script lang="ts">
	/**
	 * 通用搜索栏组件
	 * 支持文件搜索、书签搜索、历史搜索等
	 */
	import { Search, ChevronDown, MoreVertical, X } from '@lucide/svelte';
	import * as Input from '$lib/components/ui/input';

	export interface SearchHistoryItem {
		query: string;
		timestamp: number;
	}

	export interface SearchSettings {
		includeSubfolders?: boolean;
		showHistoryOnFocus?: boolean;
		[key: string]: any;
	}

	let {
		placeholder = '搜索...',
		disabled = false,
		onSearch,
		onSearchChange,
		searchHistory = $bindable([]),
		onHistorySelect,
		onHistoryClear,
		onHistoryDelete,
		searchSettings = $bindable({ includeSubfolders: true, showHistoryOnFocus: true }),
		onSettingsChange,
		showHistory = $bindable(false),
		showSettings = $bindable(false),
		storageKey
	}: {
		placeholder?: string;
		disabled?: boolean;
		onSearch?: (query: string) => void | Promise<void>;
		onSearchChange?: (query: string) => void;
		searchHistory?: SearchHistoryItem[];
		onHistorySelect?: (item: SearchHistoryItem) => void;
		onHistoryClear?: () => void;
		onHistoryDelete?: (item: SearchHistoryItem) => void;
		searchSettings?: SearchSettings;
		onSettingsChange?: (settings: SearchSettings) => void;
		showHistory?: boolean;
		showSettings?: boolean;
		storageKey?: string;
	} = $props();

	let searchQuery = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	// 加载搜索历史
	function loadSearchHistory() {
		if (!storageKey) return;
		try {
			const saved = localStorage.getItem(storageKey);
			if (saved) {
				const parsed = JSON.parse(saved);
				if (Array.isArray(parsed) && parsed.length > 0) {
					if (typeof parsed[0] === 'string') {
						// 旧版本：字符串数组
						searchHistory = parsed.map((query: string) => ({ query, timestamp: Date.now() - 86400000 }));
					} else {
						// 新版本：对象数组
						searchHistory = parsed;
					}
				}
			}
		} catch (err) {
			console.error('加载搜索历史失败:', err);
		}
	}

	// 保存搜索历史
	function saveSearchHistory() {
		if (!storageKey) return;
		try {
			localStorage.setItem(storageKey, JSON.stringify(searchHistory));
		} catch (err) {
			console.error('保存搜索历史失败:', err);
		}
	}

	// 添加搜索历史
	function addSearchHistory(query: string) {
		if (!query.trim() || !storageKey) return;
		searchHistory = searchHistory.filter(item => item.query !== query);
		searchHistory.unshift({ query, timestamp: Date.now() });
		searchHistory = searchHistory.slice(0, 20);
		saveSearchHistory();
	}

	// 清除搜索历史
	function clearSearchHistory() {
		searchHistory = [];
		saveSearchHistory();
		showHistory = false;
		if (onHistoryClear) {
			onHistoryClear();
		}
	}

	// 删除单个历史记录
	function deleteHistoryItem(item: SearchHistoryItem) {
		searchHistory = searchHistory.filter(historyItem => historyItem.query !== item.query);
		saveSearchHistory();
		if (onHistoryDelete) {
			onHistoryDelete(item);
		}
	}

	// 选择搜索历史
	function selectSearchHistory(item: SearchHistoryItem) {
		searchQuery = item.query;
		showHistory = false;
		if (onHistorySelect) {
			onHistorySelect(item);
		}
		handleSearch(item.query);
	}

	// 处理搜索
	async function handleSearch(query: string) {
		if (onSearch) {
			await onSearch(query);
		}
		if (query.trim()) {
			addSearchHistory(query);
		}
	}

	// 处理搜索输入
	function handleSearchInput(e: Event) {
		const target = e.target as HTMLInputElement;
		searchQuery = target.value;
		
		if (onSearchChange) {
			onSearchChange(searchQuery);
		}

		// 实时搜索（防抖）
		if (searchQuery.trim()) {
			if (searchTimeout) {
				clearTimeout(searchTimeout);
			}
			searchTimeout = setTimeout(() => {
				handleSearch(searchQuery);
			}, 300);
		} else {
			if (onSearch) {
				onSearch('');
			}
		}
	}

	// 处理搜索框聚焦
	function handleSearchFocus() {
		setTimeout(() => {
			if (searchSettings.showHistoryOnFocus && searchHistory.length > 0) {
				showHistory = true;
			}
		}, 10);
		showSettings = false;
	}

	// 格式化搜索历史时间
	function formatSearchHistoryTime(timestamp: number): string {
		const date = new Date(timestamp);
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const hours = date.getHours().toString().padStart(2, '0');
		const minutes = date.getMinutes().toString().padStart(2, '0');
		const seconds = date.getSeconds().toString().padStart(2, '0');
		
		return `${month}月${day}日 ${hours}:${minutes}:${seconds}`;
	}

	// 处理搜索历史键盘事件
	function handleSearchHistoryKeydown(event: KeyboardEvent, item: SearchHistoryItem) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			selectSearchHistory(item);
		}
	}

	// 组件挂载时加载历史
	$effect(() => {
		if (storageKey) {
			loadSearchHistory();
		}
	});

	// 监听外部点击关闭下拉菜单
	$effect(() => {
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as HTMLElement;
			if (!target.closest('.search-bar-container')) {
				showHistory = false;
				showSettings = false;
			}
		}

		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<div class="search-bar-container flex items-center gap-2 border-b px-2 py-2 bg-background/30">
	<div class="relative flex-1">
		<!-- 搜索输入框 -->
		<div class="relative">
			<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
			<Input.Root
				placeholder={placeholder}
				bind:value={searchQuery}
				oninput={handleSearchInput}
				onfocus={handleSearchFocus}
				class="pl-10 pr-24"
				{disabled}
			/>
			
			<!-- 清空按钮 -->
			{#if searchQuery}
				<button
					class="absolute right-16 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
					onclick={() => {
						searchQuery = '';
						if (onSearch) {
							onSearch('');
						}
					}}
					title="清空搜索"
				>
					<X class="h-4 w-4 text-gray-500" />
				</button>
			{/if}
			
			<!-- 搜索历史按钮 -->
			{#if storageKey}
				<button
					class="absolute right-8 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
					onclick={() => {
						showHistory = !showHistory;
						showSettings = false;
					}}
					disabled={searchHistory.length === 0}
					title="搜索历史"
				>
					<ChevronDown class="h-4 w-4 text-gray-500" />
				</button>
			{/if}
			
			<!-- 搜索设置按钮 -->
			{#if searchSettings && onSettingsChange}
				<button
					class="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
					onclick={(e) => {
						e.stopPropagation();
						showSettings = !showSettings;
						showHistory = false;
					}}
					title="搜索设置"
				>
					<MoreVertical class="h-4 w-4 text-gray-500" />
				</button>
			{/if}
		</div>
		
		<!-- 搜索历史下拉 -->
		{#if showHistory && searchHistory.length > 0}
			<div class="search-history absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
				{#each searchHistory as item (item.query)}
					<div
						class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between group cursor-pointer"
						role="button"
						tabindex="0"
						onclick={() => selectSearchHistory(item)}
						onkeydown={(event) => handleSearchHistoryKeydown(event, item)}
					>
						<div class="flex items-center gap-2 flex-1 min-w-0">
							<Search class="h-4 w-4 text-gray-400 flex-shrink-0" />
							<span class="truncate">{item.query}</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="text-xs text-gray-400">{formatSearchHistoryTime(item.timestamp)}</span>
							<button
								class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded flex-shrink-0"
								onclick={(e) => {
									e.stopPropagation();
									deleteHistoryItem(item);
								}}
								title="删除"
							>
								<X class="h-3 w-3 text-gray-500" />
							</button>
						</div>
					</div>
				{/each}
				<div class="border-t border-gray-200 p-2">
					<button
						class="w-full px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
						onclick={clearSearchHistory}
					>
						清除搜索历史
					</button>
				</div>
			</div>
		{/if}
		
		<!-- 搜索设置下拉 -->
		{#if showSettings && searchSettings && onSettingsChange}
			<div class="search-settings absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] p-2">
				<div class="space-y-3">
					<div class="pb-2">
						<h4 class="text-xs font-semibold text-gray-700 mb-2">搜索选项</h4>
						
						{#if searchSettings.includeSubfolders !== undefined}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									bind:checked={searchSettings.includeSubfolders}
									onchange={() => {
										if (onSettingsChange) {
											onSettingsChange(searchSettings);
										}
									}}
									class="rounded border-gray-300 text-primary focus:ring-primary"
								/>
								<span>搜索子文件夹</span>
							</label>
						{/if}
						
						{#if searchSettings.showHistoryOnFocus !== undefined}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									bind:checked={searchSettings.showHistoryOnFocus}
									onchange={() => {
										if (onSettingsChange) {
											onSettingsChange(searchSettings);
										}
									}}
									class="rounded border-gray-300 text-primary focus:ring-primary"
								/>
								<span>聚焦时显示历史</span>
							</label>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

