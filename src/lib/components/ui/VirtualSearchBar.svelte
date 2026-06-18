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
		const results = items.filter(
			(item) =>
				item.name.toLowerCase().includes(lowerKeyword) ||
				item.path.toLowerCase().includes(lowerKeyword)
		);

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

<div class="border-border flex items-center gap-2 border-b px-2 py-2">
	<div class="relative flex-1">
		<div class="flex gap-1">
			<div
				class="border-border focus-within:ring-ring relative flex min-h-[36px] flex-1 items-center gap-1 rounded-md border bg-transparent px-2 py-1 focus-within:ring-2 focus-within:ring-offset-2"
			>
				<Search class="text-muted-foreground h-4 w-4 shrink-0" />

				<input
					type="text"
					{placeholder}
					{value}
					oninput={handleInput}
					onkeydown={handleKeyDown}
					class="min-w-[100px] flex-1 bg-transparent text-sm outline-none"
					{disabled}
				/>

				<!-- 清空按钮 -->
				{#if value}
					<button
						class="hover:bg-accent shrink-0 rounded p-1"
						onclick={handleClear}
						title="清空搜索"
					>
						<X class="text-muted-foreground h-4 w-4" />
					</button>
				{/if}
			</div>

			<!-- 搜索按钮 -->
			<button
				class="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-md p-1.5 disabled:opacity-50"
				onclick={handleSearchClick}
				disabled={disabled || !value.trim()}
				title="搜索"
			>
				<Search class="h-4 w-4" />
			</button>
		</div>
	</div>
</div>
