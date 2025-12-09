<script lang="ts">
/**
 * 文件列表标签显示卡片
 * 独立控制文件列表中标签的显示模式
 */
import { Tags, Eye, EyeOff, Star } from '@lucide/svelte';
import * as Button from '$lib/components/ui/button';
import { fileListTagSettings, type FileListTagDisplayMode } from '$lib/stores/fileListTagSettings.svelte';

// 响应式获取当前模式
let currentMode = $state<FileListTagDisplayMode>(fileListTagSettings.mode);

// 订阅模式变化
$effect(() => {
	const unsubscribe = fileListTagSettings.subscribe((mode) => {
		currentMode = mode;
	});
	return unsubscribe;
});

function setMode(mode: FileListTagDisplayMode) {
	fileListTagSettings.setMode(mode);
}

const modes: { value: FileListTagDisplayMode; label: string; icon: typeof Tags; description: string }[] = [
	{ value: 'all', label: '全部', icon: Tags, description: '显示所有标签' },
	{ value: 'collect', label: '收藏', icon: Star, description: '仅显示收藏的标签' },
	{ value: 'none', label: '隐藏', icon: EyeOff, description: '不显示标签' }
];
</script>

<div class="space-y-2 text-sm">
	<div class="text-xs text-muted-foreground mb-2">
		控制文件列表中 EMM 标签的显示方式
	</div>
	
	<div class="flex gap-1">
		{#each modes as mode}
			<Button.Root
				variant={currentMode === mode.value ? 'default' : 'outline'}
				size="sm"
				class="flex-1 h-8 text-xs flex items-center gap-1 justify-center"
				onclick={() => setMode(mode.value)}
				title={mode.description}
			>
				<mode.icon class="h-3 w-3" />
				<span>{mode.label}</span>
			</Button.Root>
		{/each}
	</div>
	
	<p class="text-[11px] text-muted-foreground">
		当前：{fileListTagSettings.getModeDescription(currentMode)}
	</p>
</div>
