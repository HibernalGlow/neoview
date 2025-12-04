<script lang="ts">
/**
 * 本书设置卡片
 * 从 EmmPanelSection 提取
 */
import * as Button from '$lib/components/ui/button';
import * as Switch from '$lib/components/ui/switch';
import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';
import { bookSettingsStore, type PerBookSettings } from '$lib/stores/bookSettings.svelte';

let bookInfo = $state<ViewerBookInfo | null>(null);
let bookSettings = $state<PerBookSettings | null>(null);

$effect(() => {
	const unsubscribe = infoPanelStore.subscribe((state) => {
		bookInfo = state.bookInfo;
	});
	return unsubscribe;
});

$effect(() => {
	if (bookInfo?.path) {
		bookSettings = bookSettingsStore.get(bookInfo.path) || null;
	} else {
		bookSettings = null;
	}
});

function updateBookSetting(updates: Partial<PerBookSettings>) {
	if (bookInfo?.path) {
		bookSettingsStore.updateFor(bookInfo.path, updates);
		bookSettings = bookSettingsStore.get(bookInfo.path) || null;
	}
}
</script>

<div class="space-y-2 text-xs">
	{#if !bookInfo}
		<div class="text-center py-4 text-muted-foreground">
			<p>未打开书籍</p>
		</div>
	{:else if !bookSettings}
		<div class="text-center py-4 text-muted-foreground">
			<p>加载中...</p>
		</div>
	{:else}
		{@const bs = bookSettings}
		<div class="flex items-center justify-between">
			<span>收藏</span>
			<Button.Root
				variant={bs.favorite ? 'default' : 'outline'}
				size="sm"
				class="h-7 px-3 text-xs"
				onclick={() => updateBookSetting({ favorite: !bs.favorite })}
			>
				{#if bs.favorite}
					已收藏
				{:else}
					未收藏
				{/if}
			</Button.Root>
		</div>

		<div class="flex items-center justify-between">
			<span>评分</span>
			<div class="flex items-center gap-1">
				{#each [1, 2, 3, 4, 5] as value}
					<button
						type="button"
						class="h-6 w-6 flex items-center justify-center rounded text-[12px] {bs.rating && bs.rating >= value ? 'text-yellow-400' : 'text-muted-foreground'}"
						onclick={() => updateBookSetting({ rating: value })}
						title={'评分 ' + value + ' 星'}
					>
						{bs.rating && bs.rating >= value ? '★' : '☆'}
					</button>
				{/each}
			</div>
		</div>

		<div class="flex items-center justify-between">
			<span>阅读方向</span>
			<div class="flex gap-1">
				<Button.Root
					variant={bs.readingDirection === 'left-to-right' || !bs.readingDirection ? 'default' : 'outline'}
					size="sm"
					class="h-7 px-2 text-[10px]"
					onclick={() => updateBookSetting({ readingDirection: 'left-to-right' })}
				>
					左→右
				</Button.Root>
				<Button.Root
					variant={bs.readingDirection === 'right-to-left' ? 'default' : 'outline'}
					size="sm"
					class="h-7 px-2 text-[10px]"
					onclick={() => updateBookSetting({ readingDirection: 'right-to-left' })}
				>
					右→左
				</Button.Root>
			</div>
		</div>

		<div class="flex items-center justify-between">
			<span>显示模式</span>
			<div class="flex gap-1">
				<Button.Root
					variant={!bs.doublePageView ? 'default' : 'outline'}
					size="sm"
					class="h-7 px-2 text-[10px]"
					onclick={() => updateBookSetting({ doublePageView: false })}
				>
					单页
				</Button.Root>
				<Button.Root
					variant={bs.doublePageView ? 'default' : 'outline'}
					size="sm"
					class="h-7 px-2 text-[10px]"
					onclick={() => updateBookSetting({ doublePageView: true })}
				>
					双页
				</Button.Root>
			</div>
		</div>

		<div class="flex items-center justify-between">
			<span>横版本子</span>
			<Switch.Root
				checked={bs.horizontalBook ?? false}
				onCheckedChange={(v) => updateBookSetting({ horizontalBook: v })}
				class="scale-75"
			/>
		</div>
	{/if}
</div>
