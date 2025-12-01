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

<div class="flex items-center border-b bg-muted/30">
	<Tabs.Root value={$activeTabId} onValueChange={handleTabChange} class="flex-1 overflow-hidden">
		<Tabs.List class="h-8 w-full justify-start gap-0 rounded-none bg-transparent p-0">
			{#each $allTabs as tab (tab.id)}
				<ContextMenu.Root>
					<ContextMenu.Trigger class="flex items-center">
						<Tabs.Trigger
							value={tab.id}
							class="group relative h-8 min-w-[100px] max-w-[180px] gap-1 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-background"
							onauxclick={(e) => handleMiddleClick(tab.id, e)}
							title={tab.currentPath || tab.title}
						>
							<span class="flex-1 truncate text-left">{tab.title}</span>
							{#if $allTabs.length > 1}
								<button
									class="ml-1 flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/20 group-hover:opacity-100"
									onclick={(e) => handleCloseTab(tab.id, e)}
									title="关闭页签"
								>
									<X class="h-3 w-3" />
								</button>
							{/if}
						</Tabs.Trigger>
					</ContextMenu.Trigger>
					<ContextMenu.Content>
						<ContextMenu.Item onclick={() => handleDuplicateTab(tab.id)}>
							<Copy class="mr-2 h-4 w-4" />
							复制页签
						</ContextMenu.Item>
						{#if $allTabs.length > 1}
							<ContextMenu.Separator />
							<ContextMenu.Item onclick={() => handleCloseTab(tab.id)} class="text-destructive">
								<X class="mr-2 h-4 w-4" />
								关闭页签
							</ContextMenu.Item>
						{/if}
					</ContextMenu.Content>
				</ContextMenu.Root>
			{/each}
		</Tabs.List>
	</Tabs.Root>

	<!-- 新建页签按钮 -->
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6 shrink-0 mr-1"
				onclick={handleCreateTab}
			>
				<Plus class="h-3.5 w-3.5" />
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>新建页签</p>
		</Tooltip.Content>
	</Tooltip.Root>
</div>
