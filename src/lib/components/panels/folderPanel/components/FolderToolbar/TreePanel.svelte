<script lang="ts">
/**
 * TreePanel - 文件树位置面板
 * 文件树位置选择和主视图树模式切换
 */
import { PanelRight, PanelLeft, PanelTop, PanelBottom, ListTree } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import type { TreePosition } from '$lib/stores/virtualPanelSettings.svelte';
import type { FolderTreeConfig } from './types';

interface Props {
	/** 文件树配置 */
	folderTreeConfig: FolderTreeConfig;
	/** 是否内联树模式 */
	inlineTreeMode: boolean;
	/** 设置文件树布局 */
	onSetFolderTreeLayout: (layout: TreePosition) => void;
	/** 切换内联树模式 */
	onToggleInlineTree?: () => void;
}

let {
	folderTreeConfig,
	inlineTreeMode,
	onSetFolderTreeLayout,
	onToggleInlineTree
}: Props = $props();

// 文件树位置配置
const treePositionLabels: Record<TreePosition, string> = {
	left: '左侧',
	right: '右侧',
	top: '顶部',
	bottom: '底部'
};
const treePositionIcons: Record<TreePosition, typeof PanelLeft> = {
	left: PanelLeft,
	right: PanelRight,
	top: PanelTop,
	bottom: PanelBottom
};
</script>

<div class="flex flex-wrap items-center gap-1 border-t border-border/50 px-2 py-1">
	<span class="text-muted-foreground text-xs mr-1">文件树位置</span>
	<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
		{#each Object.entries(treePositionLabels) as [pos, label]}
			{@const Icon = treePositionIcons[pos as TreePosition]}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={folderTreeConfig.layout === pos ? 'default' : 'ghost'}
						size="icon"
						class="h-6 w-6 rounded-full"
						onclick={() => onSetFolderTreeLayout(pos as TreePosition)}
					>
						<Icon class="h-3 w-3" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{label}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	</div>
	<div class="mx-2 h-4 w-px bg-border"></div>
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Button
				variant={inlineTreeMode ? 'default' : 'ghost'}
				size="sm"
				class="h-6 text-xs px-2"
				onclick={() => onToggleInlineTree?.()}
			>
				<ListTree class="h-3 w-3 mr-1" />
				主视图树
			</Button>
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p>主视图树模式</p>
		</Tooltip.Content>
	</Tooltip.Root>
</div>
