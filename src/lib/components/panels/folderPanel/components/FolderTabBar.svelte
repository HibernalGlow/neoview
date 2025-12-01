<script lang="ts">
/**
 * FolderTabBar - 文件面板页签栏
 * 使用 shadcn Tabs 组件实现多页签管理
 */
import { X, Plus, Copy } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tabs from '$lib/components/ui/tabs';
import * as ContextMenu from '$lib/components/ui/context-menu';
import * as Tooltip from '$lib/components/ui/tooltip';
import {
	allTabs,
	activeTabId,
	folderTabActions
} from '../stores/folderTabStore.svelte';

interface Props {
	homePath?: string;
}

let { homePath = '' }: Props = $props();

function handleCreateTab() {
	folderTabActions.createTab(homePath);
}

function handleCloseTab(tabId: string, e?: MouseEvent) {
	e?.stopPropagation();
	folderTabActions.closeTab(tabId);
}

function handleDuplicateTab(tabId: string) {
	folderTabActions.duplicateTab(tabId);
}

// 中键点击关闭
function handleMiddleClick(tabId: string, e: MouseEvent) {
	if (e.button === 1) {
		e.preventDefault();
		folderTabActions.closeTab(tabId);
	}
}

// Tab 值变化时切换
function handleTabChange(value: string) {
	folderTabActions.switchTab(value);
}
</script>

<div class="flex items-center gap-1 px-1 py-0.5 bg-muted/20">
	<!-- 页签列表 -->
	<div class="flex flex-1 items-center gap-0.5 overflow-x-auto">
		{#each $allTabs as tab (tab.id)}
			<ContextMenu.Root>
				<ContextMenu.Trigger>
					<button
						class="group flex h-6 min-w-[80px] max-w-[160px] items-center gap-1 rounded px-2 text-xs transition-colors
							{tab.id === $activeTabId 
								? 'bg-background text-foreground shadow-sm' 
								: 'text-muted-foreground hover:bg-background/50 hover:text-foreground'}"
						onclick={() => handleTabChange(tab.id)}
						onauxclick={(e) => handleMiddleClick(tab.id, e)}
						title={tab.currentPath || tab.title}
					>
						<span class="flex-1 truncate text-left">{tab.title}</span>
						{#if $allTabs.length > 1}
							<span
								class="flex h-3.5 w-3.5 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-destructive/20 group-hover:opacity-60 hover:!opacity-100"
								onclick={(e) => handleCloseTab(tab.id, e)}
								onkeydown={(e) => e.key === 'Enter' && handleCloseTab(tab.id)}
								role="button"
								tabindex="0"
								title="关闭页签"
							>
								<X class="h-2.5 w-2.5" />
							</span>
						{/if}
					</button>
				</ContextMenu.Trigger>
				<ContextMenu.Content>
					<ContextMenu.Item onclick={() => handleDuplicateTab(tab.id)}>
						<Copy class="mr-2 h-3.5 w-3.5" />
						复制页签
					</ContextMenu.Item>
					{#if $allTabs.length > 1}
						<ContextMenu.Separator />
						<ContextMenu.Item onclick={() => handleCloseTab(tab.id)} class="text-destructive">
							<X class="mr-2 h-3.5 w-3.5" />
							关闭页签
						</ContextMenu.Item>
					{/if}
				</ContextMenu.Content>
			</ContextMenu.Root>
		{/each}
	</div>

	<!-- 新建页签按钮 -->
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Button
				variant="ghost"
				size="icon"
				class="h-5 w-5 shrink-0"
				onclick={handleCreateTab}
			>
				<Plus class="h-3 w-3" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>新建页签</p>
		</Tooltip.Content>
	</Tooltip.Root>
</div>
