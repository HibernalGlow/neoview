<script lang="ts">
/**
 * TypeFilterBar - 类型筛选下拉栏
 * 在工具栏下方展开显示，不使用弹出菜单
 */
import { Filter, Package, Folder, Film } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import type { VirtualItemTypeFilter } from '$lib/stores/virtualPanelSettings.svelte';

interface Props {
	itemTypeFilter: VirtualItemTypeFilter;
	onSetItemTypeFilter: (value: VirtualItemTypeFilter) => void;
}

let { itemTypeFilter, onSetItemTypeFilter }: Props = $props();

const options: Array<{ value: VirtualItemTypeFilter; label: string; icon: typeof Filter }> = [
	{ value: 'all', label: '全部', icon: Filter },
	{ value: 'archive', label: '压缩包', icon: Package },
	{ value: 'folder', label: '文件夹', icon: Folder },
	{ value: 'video', label: '视频', icon: Film }
];
</script>

<div class="flex flex-wrap items-center gap-1 border-t border-border/50 px-2 py-1">
	<span class="text-muted-foreground mr-1 text-xs">类型筛选</span>
	<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
		{#each options as option}
			{@const OptionIcon = option.icon}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={itemTypeFilter === option.value ? 'default' : 'ghost'}
						size="sm"
						class="h-6 rounded-full px-2 text-xs"
						onclick={() => onSetItemTypeFilter(option.value)}
					>
						<OptionIcon class="mr-1 h-3 w-3" />
						{option.label}
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>仅显示{option.label === '全部' ? '全部类型' : option.label}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	</div>
</div>
