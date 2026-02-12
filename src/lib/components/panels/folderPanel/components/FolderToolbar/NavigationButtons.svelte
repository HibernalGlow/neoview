<script lang="ts">
/**
 * NavigationButtons - 导航按钮组
 * 包含主页、后退、前进、向上、刷新按钮
 */
import {
	Home,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	RefreshCw,
	FolderSync,
	FilterX
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { unifiedHistoryStore } from '$lib/stores/unifiedHistory.svelte';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import CleanupOptionsDialog from './CleanupOptionsDialog.svelte';
import type { VirtualMode } from './types';

interface Props {
	/** 虚拟模式类型 */
	virtualMode?: VirtualMode;
	/** 是否垂直布局 */
	vertical?: boolean;
	/** 是否显示工具栏提示 */
	showToolbarTooltip?: boolean;
	/** 是否可后退 */
	canGoBack?: boolean;
	/** 是否可前进 */
	canGoForward?: boolean;
	/** 是否可向上 */
	canGoUp?: boolean;
	/** 回调函数 */
	onGoHome?: () => void;
	onSetHome?: (e: MouseEvent) => void;
	onGoBack?: () => void;
	onGoForward?: () => void;
	onGoUp?: () => void;
	onRefresh?: () => void;
}

let {
	virtualMode = null,
	vertical = false,
	showToolbarTooltip = false,
	canGoBack = false,
	canGoForward = false,
	canGoUp = false,
	onGoHome,
	onSetHome,
	onGoBack,
	onGoForward,
	onGoUp,
	onRefresh
}: Props = $props();

// 清理失效条目状态
let isCleaningInvalid = $state(false);
let cleanupResult = $state<{ removed: number } | null>(null);

async function handleCleanupInvalid() {
	if (isCleaningInvalid) return;
	isCleaningInvalid = true;
	cleanupResult = null;
	
	try {
		let removed = 0;
		if (virtualMode === 'history') {
			removed = await unifiedHistoryStore.cleanupInvalid();
		} else if (virtualMode === 'bookmark') {
			removed = await bookmarkStore.cleanupInvalid();
		}
		cleanupResult = { removed };
		
		setTimeout(() => {
			cleanupResult = null;
		}, 3000);
		
		if (removed > 0) {
			onRefresh?.();
		}
	} catch (e) {
		console.error('清理失效条目失败:', e);
	} finally {
		isCleaningInvalid = false;
	}
}

// 高级清理对话框状态
let cleanupDialogOpen = $state(false);
</script>

<div class={vertical ? "flex flex-col items-center gap-0.5" : "flex items-center gap-0.5"}>
	{#if !virtualMode}
		<!-- 普通文件夹模式：显示所有导航按钮 -->
		<Tooltip.Root disabled={!showToolbarTooltip}>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					onclick={() => onGoHome?.()}
					oncontextmenu={(e: MouseEvent) => onSetHome?.(e)}
				>
					<Home class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>主页 (单击返回主页，右键设置当前路径为主页)</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root disabled={!showToolbarTooltip}>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					disabled={!canGoBack && !canGoUp}
					onclick={() => onGoBack?.()}
				>
					<ChevronLeft class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>后退 (Alt+←)</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root disabled={!showToolbarTooltip}>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					disabled={!canGoForward}
					onclick={() => onGoForward?.()}
				>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>前进 (Alt+→)</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root disabled={!showToolbarTooltip}>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					disabled={!canGoUp}
					onclick={() => onGoUp?.()}
				>
					<ChevronUp class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>向上 (Alt+↑)</p>
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}

	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button variant="ghost" size="icon" class="h-7 w-7" onclick={() => onRefresh?.()}>
				<RefreshCw class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>{virtualMode === 'history' ? '重新加载历史' : virtualMode === 'bookmark' ? '重新加载书签' : '刷新'}</p>
		</Tooltip.Content>
	</Tooltip.Root>
</div>

<!-- 分隔 -->
<div class={vertical ? "bg-border my-1 w-5 h-px" : "bg-border mx-1 h-5 w-px"}></div>

<!-- 同步文件夹按钮（仅在书签/历史模式下显示） -->
{#if virtualMode}
	<Tooltip.Root disabled={!showToolbarTooltip}>
		<Tooltip.Trigger>
			<Button
				variant={virtualMode === 'history' 
					? (historySettingsStore.syncFileTreeOnHistorySelect ? 'default' : 'ghost')
					: (historySettingsStore.syncFileTreeOnBookmarkSelect ? 'default' : 'ghost')}
				size="icon"
				class="h-7 w-7"
				onclick={() => {
					if (virtualMode === 'history') {
						historySettingsStore.setSyncFileTreeOnHistorySelect(!historySettingsStore.syncFileTreeOnHistorySelect);
					} else {
						historySettingsStore.setSyncFileTreeOnBookmarkSelect(!historySettingsStore.syncFileTreeOnBookmarkSelect);
					}
				}}
			>
				<FolderSync class="h-4 w-4" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>同步文件夹 {#if virtualMode === 'history'}{historySettingsStore.syncFileTreeOnHistorySelect ? '(已开启)' : '(已关闭)'}{:else}{historySettingsStore.syncFileTreeOnBookmarkSelect ? '(已开启)' : '(已关闭)'}{/if}</p>
			<p class="text-muted-foreground text-xs">点击项目时自动在文件夹页签打开所在目录</p>
		</Tooltip.Content>
	</Tooltip.Root>

	<!-- 清理失效条目按钮 -->
	<DropdownMenu.Root>
		<Tooltip.Root disabled={!showToolbarTooltip}>
			<Tooltip.Trigger>
				<DropdownMenu.Trigger asChild>
					{#snippet children({ props })}
						<Button
							variant="ghost"
							size="icon"
							class="h-7 w-7 {isCleaningInvalid ? 'animate-pulse' : ''}"
							disabled={isCleaningInvalid}
							{...props}
						>
							<FilterX class="h-4 w-4 {cleanupResult ? (cleanupResult.removed > 0 ? 'text-green-500' : 'text-muted-foreground') : ''}" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>清理{virtualMode === 'history' ? '历史' : '书签'}选项</p>
				<p class="text-muted-foreground text-xs">点击展开更多清理功能</p>
				{#if cleanupResult}
					<p class="text-green-500 text-xs">最近清理了 {cleanupResult.removed} 条</p>
				{/if}
			</Tooltip.Content>
		</Tooltip.Root>
		<DropdownMenu.Content align="end">
			<DropdownMenu.Item onclick={handleCleanupInvalid}>
				清理失效记录
			</DropdownMenu.Item>
			<DropdownMenu.Item onclick={() => cleanupDialogOpen = true}>
				高级清理选项...
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item class="text-destructive" onclick={() => {
				if (confirm(`确定要清空所有${virtualMode === 'history' ? '历史记录' : '书签'}吗？`)) {
					if (virtualMode === 'history') unifiedHistoryStore.clear();
					else bookmarkStore.clear();
					onRefresh?.();
				}
			}}>
				一键清除全部
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- 高级对话框 -->
	<CleanupOptionsDialog 
		bind:open={cleanupDialogOpen} 
		virtualMode={virtualMode as 'history' | 'bookmark'} 
		{onRefresh} 
	/>
{/if}
