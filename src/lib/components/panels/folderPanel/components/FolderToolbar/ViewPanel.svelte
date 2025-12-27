<script lang="ts">
/**
 * ViewPanel - 视图面板
 * 视图样式选择
 */
import { List, Grid3x3, LayoutGrid, Image } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import type { FolderViewStyle } from '../../stores/folderPanelStore';
import type { ViewStyleDef } from './types';

interface Props {
	/** 当前视图样式 */
	viewStyle: FolderViewStyle;
	/** 设置视图样式 */
	onSetViewStyle: (style: FolderViewStyle) => void;
}

let { viewStyle, onSetViewStyle }: Props = $props();

const viewStyles: ViewStyleDef[] = [
	{ value: 'list', icon: List, label: '列表' },
	{ value: 'content', icon: LayoutGrid, label: '内容' },
	{ value: 'banner', icon: Image, label: '横幅' },
	{ value: 'thumbnail', icon: Grid3x3, label: '缩略图' }
];
</script>

<div class="flex flex-wrap items-center gap-1 border-t border-border/50 px-2 py-1">
	<span class="text-muted-foreground text-xs mr-1">视图</span>
	<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
		{#each viewStyles as style}
			{@const StyleIcon = style.icon}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={viewStyle === style.value ? 'default' : 'ghost'}
						size="icon"
						class="h-6 w-6 rounded-full"
						onclick={() => onSetViewStyle(style.value)}
					>
						<StyleIcon class="h-3 w-3" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{style.label}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	</div>
</div>
