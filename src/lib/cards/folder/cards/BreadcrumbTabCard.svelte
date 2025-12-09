<script lang="ts">
	/**
	 * BreadcrumbTabCard - 面包屑导航 + 页签栏卡片
	 * 独立管理导航相关的 UI 状态
	 * 支持全局标签（folder）和本地标签（bookmark/history）
	 */
	import { X, Plus, Copy, Bookmark, Clock, Folder } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import BreadcrumbBar from '$lib/components/panels/folderPanel/components/BreadcrumbBar.svelte';
	import FolderTabBar from '$lib/components/panels/folderPanel/components/FolderTabBar.svelte';
	import { getFolderContext } from '../context/FolderContext.svelte';

	// ==================== Props ====================
	interface Props {
		onNavigate: (path: string) => void;
	}
	let { onNavigate }: Props = $props();

	// ==================== Context ====================
	const ctx = getFolderContext();

	// ==================== 本地标签页操作 ====================
	function handleLocalTabChange(value: string) {
		ctx.switchLocalTab(value);
	}

	function handleLocalCloseTab(tabId: string, e?: MouseEvent) {
		e?.stopPropagation();
		ctx.closeLocalTab(tabId);
	}

	function handleLocalMiddleClick(tabId: string, e: MouseEvent) {
		if (e.button === 1) {
			e.preventDefault();
			ctx.closeLocalTab(tabId);
		}
	}

	function handleLocalDuplicateTab(tabId: string) {
		const tab = ctx.localTabs.find(t => t.id === tabId);
		if (tab) {
			ctx.createLocalTab(tab.currentPath);
		}
	}
</script>

<!-- 面包屑导航 -->
<BreadcrumbBar
	onNavigate={onNavigate}
	onCreateTab={ctx.isVirtualInstance ? () => ctx.createLocalTab() : undefined}
	homePath={ctx.homePath}
	externalPath={ctx.isVirtualInstance ? ctx.initialPath : undefined}
/>

<!-- 页签栏（非虚拟实例使用全局 FolderTabBar） -->
{#if ctx.displayTabs.length > 1 && !ctx.isVirtualInstance}
	<FolderTabBar homePath={ctx.homePath} />
{/if}

<!-- 本地页签栏（虚拟实例使用本地标签管理） -->
{#if ctx.isVirtualInstance && ctx.localTabs.length > 1}
	<Tabs.Root value={ctx.localActiveTabId} onValueChange={handleLocalTabChange} class="w-full">
		<div class="flex items-start gap-1 px-1 py-1">
			<Tabs.List class="flex h-auto flex-wrap gap-1 bg-transparent p-0">
				{#each ctx.localTabs as tab (tab.id)}
					<ContextMenu.Root>
						<ContextMenu.Trigger>
							<Tabs.Trigger
								value={tab.id}
								class="group h-7 max-w-[160px] min-w-[80px] gap-1 rounded-md px-2.5 text-xs data-[state=active]:shadow-sm"
								onauxclick={(e) => handleLocalMiddleClick(tab.id, e)}
								title={tab.currentPath || tab.title}
							>
								{#if ctx.panelMode === 'bookmark'}
									<Bookmark class="h-3.5 w-3.5 shrink-0 text-amber-500" />
								{:else if ctx.panelMode === 'history'}
									<Clock class="h-3.5 w-3.5 shrink-0 text-blue-500" />
								{:else}
									<Folder class="h-3.5 w-3.5 shrink-0" />
								{/if}
								<span class="flex-1 truncate text-left">{tab.title}</span>
								{#if ctx.localTabs.length > 1}
									<span
										class="hover:bg-destructive/20 flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 group-hover:hover:opacity-100"
										onclick={(e) => handleLocalCloseTab(tab.id, e)}
										onkeydown={(e) => e.key === 'Enter' && handleLocalCloseTab(tab.id)}
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
							<ContextMenu.Item onclick={() => handleLocalDuplicateTab(tab.id)}>
								<Copy class="mr-2 h-4 w-4" />
								复制页签
							</ContextMenu.Item>
							{#if ctx.localTabs.length > 1}
								<ContextMenu.Separator />
								<ContextMenu.Item onclick={() => handleLocalCloseTab(tab.id)} class="text-destructive">
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
					<Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={() => ctx.createLocalTab()}>
						<Plus class="h-4 w-4" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>新建页签</p>
				</Tooltip.Content>
			</Tooltip.Root>
		</div>
	</Tabs.Root>
{/if}
