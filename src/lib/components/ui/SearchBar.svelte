<script lang="ts">
	/**
	 * 通用搜索栏组件
	 * 支持文件搜索、书签搜索、历史搜索等
	 */
	import { Search, ChevronDown, MoreVertical, X } from '@lucide/svelte';
	import * as Input from '$lib/components/ui/input';
	import { parseSearchTags, removeTagsFromSearch, categoryColors } from '$lib/stores/emm/favoriteTagStore.svelte';

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
		value = $bindable(''),
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
		value?: string;
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

	// 使用外部传入的 value 作为搜索值
	let searchQuery = $derived(value);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	// 解析搜索框中的标签
	const parsedTags = $derived(parseSearchTags(searchQuery));
	const plainText = $derived(removeTagsFromSearch(searchQuery));

	// 移除指定标签
	function removeTag(tagToRemove: { cat: string; tag: string; prefix: string }) {
		// 尝试多种格式
		const patterns = [
			new RegExp(`\\s*${tagToRemove.prefix}[a-z]+:"${tagToRemove.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\$`, 'g'),
		];
		let newQuery = searchQuery;
		for (const pattern of patterns) {
			newQuery = newQuery.replace(pattern, '');
		}
		newQuery = newQuery.trim();
		value = newQuery;
		if (onSearchChange) {
			onSearchChange(newQuery);
		}
	}

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
		value = item.query;
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

	// 处理搜索输入 - 只更新值，不自动触发搜索
	function handleSearchInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value;
		
		if (onSearchChange) {
			onSearchChange(value);
		}
	}

	// 处理搜索按钮点击
	function handleSearchClick() {
		if (searchQuery.trim()) {
			handleSearch(searchQuery);
		}
	}

	// 处理回车键（可选，按回车也触发搜索）
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault();
			handleSearchClick();
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

<div class="search-bar-container flex items-center gap-2 border-b border-border px-2 py-2 bg-background/50">
	<div class="relative flex-1">
		<!-- 搜索输入框 -->
		<div class="flex gap-1">
			<div class="relative flex-1 flex items-center gap-1 flex-wrap min-h-[36px] border rounded-md bg-background border-border px-2 py-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
				<Search class="h-4 w-4 text-muted-foreground shrink-0" />
				
				<!-- 标签 Chips -->
				{#each parsedTags as tag}
					{@const color = categoryColors[tag.cat] || '#666'}
					<span
						class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border shrink-0 {tag.prefix === '-' ? 'line-through opacity-60' : ''}"
						style="border-color: {color}; background: color-mix(in srgb, {color} 15%, transparent);"
					>
						<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {color}"></span>
						<span class="font-medium">{tag.tag}</span>
						<button
							type="button"
							class="ml-0.5 hover:bg-accent rounded p-0.5"
							onclick={() => removeTag(tag)}
							title="移除标签"
						>
							<X class="h-3 w-3" />
						</button>
					</span>
				{/each}
				
				<!-- 输入框 -->
				<input
					type="text"
					placeholder={parsedTags.length > 0 ? '' : placeholder}
					value={plainText}
					oninput={(e) => {
						const target = e.target as HTMLInputElement;
						// 保留标签部分，更新普通文本部分
						const tagParts = parsedTags.map(t => `${t.prefix}${t.letter}:"${t.tag}"$`).join(' ');
						const newValue = tagParts ? `${tagParts} ${target.value}`.trim() : target.value;
						value = newValue;
						if (onSearchChange) onSearchChange(newValue);
					}}
					onkeydown={handleKeyDown}
					onfocus={handleSearchFocus}
					class="flex-1 min-w-[100px] bg-transparent outline-none text-sm"
					{disabled}
				/>
				
				<!-- 清空按钮 -->
				{#if searchQuery}
					<button
						class="p-1 hover:bg-accent rounded shrink-0"
						onclick={() => {
							value = '';
							if (onSearchChange) {
								onSearchChange('');
							}
						}}
						title="清空搜索"
					>
						<X class="h-4 w-4 text-muted-foreground" />
					</button>
				{/if}
				
				<!-- 搜索历史按钮 -->
				{#if storageKey}
					<button
						class="p-1 hover:bg-accent rounded disabled:opacity-50 shrink-0"
						onclick={() => {
							showHistory = !showHistory;
							showSettings = false;
						}}
						disabled={searchHistory.length === 0}
						title="搜索历史"
					>
						<ChevronDown class="h-4 w-4 text-muted-foreground" />
					</button>
				{/if}
				
				<!-- 搜索设置按钮 -->
				{#if searchSettings && onSettingsChange}
					<button
						class="p-1 hover:bg-accent rounded shrink-0"
						onclick={(e) => {
							e.stopPropagation();
							showSettings = !showSettings;
							showHistory = false;
						}}
						title="搜索设置"
					>
						<MoreVertical class="h-4 w-4 text-muted-foreground" />
					</button>
				{/if}
			</div>
			
			<!-- 搜索按钮 -->
			<button
				class="p-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 shrink-0"
				onclick={handleSearchClick}
				disabled={disabled || !searchQuery.trim()}
				title="搜索"
			>
				<Search class="h-4 w-4" />
			</button>
		</div>
		
		<!-- 搜索历史下拉 -->
		{#if showHistory && searchHistory.length > 0}
			<div class="search-history absolute top-full left-0 right-0 mt-1 bg-popover/80 backdrop-blur-md border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
				{#each searchHistory as item (item.query)}
					<div
						class="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center justify-between group cursor-pointer"
						role="button"
						tabindex="0"
						onclick={() => selectSearchHistory(item)}
						onkeydown={(event) => handleSearchHistoryKeydown(event, item)}
					>
						<div class="flex items-center gap-2 flex-1 min-w-0">
							<Search class="h-4 w-4 text-muted-foreground shrink-0" />
							<span class="truncate text-foreground">{item.query}</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="text-xs text-muted-foreground">{formatSearchHistoryTime(item.timestamp)}</span>
							<button
								class="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent-foreground/10 rounded shrink-0"
								onclick={(e) => {
									e.stopPropagation();
									deleteHistoryItem(item);
								}}
								title="删除"
							>
								<X class="h-3 w-3 text-muted-foreground" />
							</button>
						</div>
					</div>
				{/each}
				<div class="border-t border-border p-2">
					<button
						class="w-full px-3 py-1 text-xs text-muted-foreground hover:bg-accent rounded"
						onclick={clearSearchHistory}
					>
						清除搜索历史
					</button>
				</div>
			</div>
		{/if}
		
		<!-- 搜索设置下拉 -->
		{#if showSettings && searchSettings && onSettingsChange}
			<div class="search-settings absolute top-full right-0 mt-1 bg-popover/80 backdrop-blur-md border border-border rounded-lg shadow-lg z-50 min-w-[200px] p-2">
				<div class="space-y-3">
					<div class="pb-2">
						<h4 class="text-xs font-semibold text-foreground mb-2">搜索选项</h4>
						
						{#if searchSettings.includeSubfolders !== undefined}
							<label class="flex items-center gap-2 text-sm text-foreground">
								<input
									type="checkbox"
									bind:checked={searchSettings.includeSubfolders}
									onchange={() => {
										if (onSettingsChange) {
											onSettingsChange(searchSettings);
										}
									}}
									class="rounded border-border text-primary focus:ring-primary accent-primary"
								/>
								<span>搜索子文件夹</span>
							</label>
						{/if}
						
						{#if searchSettings.showHistoryOnFocus !== undefined}
							<label class="flex items-center gap-2 text-sm text-foreground">
								<input
									type="checkbox"
									bind:checked={searchSettings.showHistoryOnFocus}
									onchange={() => {
										if (onSettingsChange) {
											onSettingsChange(searchSettings);
										}
									}}
									class="rounded border-border text-primary focus:ring-primary accent-primary"
								/>
								<span>聚焦时显示历史</span>
							</label>
						{/if}
						
						{#if searchSettings.searchInPath !== undefined}
							<label class="flex items-center gap-2 text-sm text-foreground">
								<input
									type="checkbox"
									bind:checked={searchSettings.searchInPath}
									onchange={() => {
										if (onSettingsChange) {
											onSettingsChange(searchSettings);
										}
									}}
									class="rounded border-border text-primary focus:ring-primary accent-primary"
								/>
								<span>匹配路径</span>
							</label>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

