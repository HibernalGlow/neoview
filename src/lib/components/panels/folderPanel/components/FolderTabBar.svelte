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

<Tabs.Root value={$activeTabId} onValueChange={handleTabChange} class="w-full">
	<div class="flex items-start gap-1 px-1 py-1 bg-muted/30">
		<!-- 页签列表（自动换行） -->
		<Tabs.List class="flex flex-wrap gap-1 h-auto bg-transparent p-0">
			{#each $allTabs as tab (tab.id)}
				<ContextMenu.Root>
					<ContextMenu.Trigger>
						<Tabs.Trigger
							value={tab.id}
							class="group h-7 min-w-[80px] max-w-[160px] gap-1 rounded-md px-2.5 text-xs data-[state=active]:shadow-sm"
							onauxclick={(e) => handleMiddleClick(tab.id, e)}
							title={tab.currentPath || tab.title}
						>
							<span class="flex-1 truncate text-left">{tab.title}</span>
							{#if $allTabs.length > 1}
								<span
									class="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/20 group-hover:opacity-60 group-hover:hover:opacity-100"
									onclick={(e) => handleCloseTab(tab.id, e)}
									onkeydown={(e) => e.key === 'Enter' && handleCloseTab(tab.id)}
									role="button"
									tabindex="0"
									title="关闭页签"
								>
									<X class="h-3 w-3" />
								</span>
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

		<!-- 新建页签按钮 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7 shrink-0"
					onclick={handleCreateTab}
				>
					<Plus class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>新建页签</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</div>
</Tabs.Root>
