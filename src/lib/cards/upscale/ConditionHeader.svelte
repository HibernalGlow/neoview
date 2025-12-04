<script lang="ts">
/**
 * 条件超分 - 头部操作栏
 */
import { createEventDispatcher } from 'svelte';
import { Button } from '$lib/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger
} from '$lib/components/ui/dropdown-menu';
import { Plus, Upload, Download, RotateCcw } from '@lucide/svelte';
import type { ConditionPresetKey } from '$lib/utils/upscale/conditions';
import { CONDITION_PRESET_OPTIONS } from '$lib/utils/upscale/conditions';

const dispatch = createEventDispatcher<{
	addBlank: void;
	addPreset: { key: ConditionPresetKey };
	export: void;
	import: void;
	restore: void;
}>();

const presetOptions = CONDITION_PRESET_OPTIONS;
</script>

<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
	<div>
		<h3 class="text-sm font-semibold">条件策略</h3>
		<p class="text-[10px] text-muted-foreground">根据尺寸/路径自动选择模型或跳过</p>
	</div>
	<div class="flex flex-wrap gap-1">
		<DropdownMenu>
			<DropdownMenuTrigger>
				<Button size="sm" class="h-7 text-xs">
					<Plus class="w-3 h-3 mr-1" />
					添加
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent class="w-64">
				<DropdownMenuLabel class="text-xs">快速预设</DropdownMenuLabel>
				{#each presetOptions as preset}
					{@const presetKey = preset.key as ConditionPresetKey}
					<DropdownMenuItem onclick={() => dispatch('addPreset', { key: presetKey })}>
						<div class="space-y-0.5">
							<p class="text-xs font-medium">{preset.name}</p>
							<p class="text-[10px] text-muted-foreground">{preset.description}</p>
						</div>
					</DropdownMenuItem>
				{/each}
				<DropdownMenuSeparator />
				<DropdownMenuItem onclick={() => dispatch('addBlank')}>
					<Plus class="w-3 h-3 mr-2" />
					<span class="text-xs">空白条件</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
		<Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => dispatch('export')}>
			<Download class="w-3 h-3 mr-1" />
			导出
		</Button>
		<Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => dispatch('import')}>
			<Upload class="w-3 h-3 mr-1" />
			导入
		</Button>
		<Button variant="ghost" size="sm" class="h-7 text-xs" onclick={() => dispatch('restore')}>
			<RotateCcw class="w-3 h-3 mr-1" />
			重置
		</Button>
	</div>
</div>
