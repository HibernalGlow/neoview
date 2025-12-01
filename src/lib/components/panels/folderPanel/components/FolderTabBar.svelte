<script lang="ts">
/**
 * FolderTabBar - 文件面板页签栏
 * 支持多页签管理，每个页签独立状态
 */
import { X, Plus, Copy, MoreHorizontal } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
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

function handleSwitchTab(tabId: string) {
	folderTabActions.switchTab(tabId);
}

function handleCloseTab(tabId: string, e: MouseEvent) {
	e.stopPropagation();
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

// 右键菜单状态
let contextMenu = $state<{ visible: boolean; x: number; y: number; tabId: string }>({
	visible: false,
	x: 0,
	y: 0,
	tabId: ''
});

function handleContextMenu(tabId: string, e: MouseEvent) {
	e.preventDefault();
	contextMenu = {
		visible: true,
		x: e.clientX,
		y: e.clientY,
		tabId
	};
}
</script>

<div class="flex items-center gap-0.5 overflow-x-auto border-b bg-muted/30 px-1 py-0.5">
	{#each $allTabs as tab (tab.id)}
		<div class="group relative flex items-center">
			<button
				class="flex min-w-[100px] max-w-[180px] items-center gap-1.5 rounded-t px-2 py-1 text-xs transition-colors {$activeTabId === tab.id
					? 'bg-background text-foreground shadow-sm'
					: 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'}"
				onclick={() => handleSwitchTab(tab.id)}
				onauxclick={(e) => handleMiddleClick(tab.id, e)}
				oncontextmenu={(e) => handleContextMenu(tab.id, e)}
				title={tab.currentPath || tab.title}
			>
				<span class="flex-1 truncate text-left">{tab.title}</span>
			</button>
			
			{#if $allTabs.length > 1}
				<button
					class="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/20 group-hover:opacity-100"
					onclick={(e) => handleCloseTab(tab.id, e)}
					title="关闭页签"
				>
					<X class="h-3 w-3" />
				</button>
			{/if}
		</div>
	{/each}
	
	<!-- 右键菜单 -->
	{#if contextMenu.visible}
		<DropdownMenu.Root open={contextMenu.visible} onOpenChange={(open) => { if (!open) contextMenu.visible = false; }}>
			<DropdownMenu.Trigger class="fixed" style="left: {contextMenu.x}px; top: {contextMenu.y}px; width: 1px; height: 1px;" />
			<DropdownMenu.Content align="start">
				<DropdownMenu.Item onclick={() => handleDuplicateTab(contextMenu.tabId)}>
					<Copy class="mr-2 h-4 w-4" />
					复制页签
				</DropdownMenu.Item>
				{#if $allTabs.length > 1}
					<DropdownMenu.Separator />
					<DropdownMenu.Item 
						onclick={() => { folderTabActions.closeTab(contextMenu.tabId); contextMenu.visible = false; }}
						class="text-destructive"
					>
						<X class="mr-2 h-4 w-4" />
						关闭页签
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}

	<!-- 新建页签按钮 -->
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6 shrink-0"
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
