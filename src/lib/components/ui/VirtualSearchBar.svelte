<script lang="ts">
	/**
	 * VirtualSearchBar - 虚拟路径专用搜索栏
	 * 用于历史/书签面板的纯前端过滤搜索
	 * 不调用后端，直接在内存中过滤数据
	 */
	import { Search, X } from '@lucide/svelte';
	import type { FsItem } from '$lib/types';

	interface Props {
		placeholder?: string;
		disabled?: boolean;
		value?: string;
		/** 要搜索的数据源 */
		items: FsItem[];
		/** 搜索结果回调 */
		onSearch: (results: FsItem[], keyword: string) => void;
		/** 值变化回调 */
		onValueChange?: (value: string) => void;
	}

	let {
		placeholder = '搜索...',
		disabled = false,
		value = $bindable(''),
		items,
		onSearch,
		onValueChange
	}: Props = $props();

	// 执行前端过滤搜索
	function doSearch(keyword: string) {
		if (!keyword.trim()) {
			onSearch([], '');
			return;
		}

		const lowerKeyword = keyword.toLowerCase();
		const results = items.filter((item) =>
			item.name.toLowerCase().includes(lowerKeyword) ||
			item.path.toLowerCase().includes(lowerKeyword)
		);

		console.log('[VirtualSearchBar] 前端搜索', {
			keyword,
			itemCount: items.length,
			resultCount: results.length
		});

		onSearch(results, keyword);
	}

	// 处理输入变化
	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value;
		onValueChange?.(value);
	}

	// 处理回车键
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault();
			doSearch(value);
		}
	}

	// 处理搜索按钮点击
	function handleSearchClick() {
		doSearch(value);
	}

	// 清空搜索
	function handleClear() {
		value = '';
		onValueChange?.('');
		onSearch([], '');
	}
</script>

<div class="flex items-center gap-2 border-b border-border px-2 py-2 bg-background/50">
	<div class="relative flex-1">
		<div class="flex gap-1">
			<div class="relative flex-1 flex items-center gap-1 min-h-[36px] border rounded-md bg-background border-border px-2 py-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
				<Search class="h-4 w-4 text-muted-foreground shrink-0" />

				<input
					type="text"
					{placeholder}
					{value}
					oninput={handleInput}
					onkeydown={handleKeyDown}
					class="flex-1 min-w-[100px] bg-transparent outline-none text-sm"
					{disabled}
				/>

				<!-- 清空按钮 -->
				{#if value}
					<button
						class="p-1 hover:bg-accent rounded shrink-0"
						onclick={handleClear}
						title="清空搜索"
					>
						<X class="h-4 w-4 text-muted-foreground" />
					</button>
				{/if}
			</div>

			<!-- 搜索按钮 -->
			<button
				class="p-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 shrink-0"
				onclick={handleSearchClick}
				disabled={disabled || !value.trim()}
				title="搜索"
			>
				<Search class="h-4 w-4" />
			</button>
		</div>
	</div>
</div>
