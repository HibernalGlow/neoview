<script lang="ts">
	/**
	 * NeoView - Key Binding Panel
	 * 快捷键绑定配置面板
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		keyBindings,
		keyBindingsByCategory,
		recordingCommand,
		updateKeyBinding,
		resetKeyBindings,
		generateKeyCombo
	} from '$lib/stores';
	import { RotateCcw } from '@lucide/svelte';

	let searchQuery = $state('');

	// 开始录制快捷键
	function startRecording(command: string) {
		recordingCommand.set(command);
	}

	// 处理按键录制
	function handleKeyDown(event: KeyboardEvent, command: string) {
		if ($recordingCommand !== command) return;

		event.preventDefault();
		event.stopPropagation();

		// 忽略单独的修饰键
		if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
			return;
		}

		const keyCombo = generateKeyCombo(event);
		updateKeyBinding(command, keyCombo);
		recordingCommand.set(null);
	}

	// 取消录制
	function cancelRecording() {
		recordingCommand.set(null);
	}

	// 过滤快捷键
	$effect(() => {
		if (searchQuery) {
			// 简单的过滤实现
		}
	});
</script>

<svelte:window onkeydown={(e) => $recordingCommand && handleKeyDown(e, $recordingCommand)} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">快捷键设置</h3>
		<Button variant="outline" size="sm" onclick={resetKeyBindings}>
			<RotateCcw class="h-4 w-4 mr-2" />
			重置为默认
		</Button>
	</div>

	<!-- 搜索框 -->
	<Input type="text" placeholder="搜索命令..." bind:value={searchQuery} />

	<!-- 快捷键列表 -->
	<div class="space-y-6">
		{#each Object.entries($keyBindingsByCategory) as [category, bindings]}
			<div class="space-y-2">
				<h4 class="text-sm font-medium text-muted-foreground uppercase">{category}</h4>
				<div class="space-y-1">
					{#each bindings as binding}
						<div class="flex items-center justify-between py-2 px-3 rounded hover:bg-accent">
							<div class="flex-1">
								<div class="text-sm font-medium">{binding.description}</div>
								<div class="text-xs text-muted-foreground">{binding.command}</div>
							</div>
							<Button
								variant="outline"
								size="sm"
								class={$recordingCommand === binding.command ? 'animate-pulse' : ''}
								onclick={() => startRecording(binding.command)}
							>
								{#if $recordingCommand === binding.command}
									<span class="text-primary">按下新快捷键...</span>
								{:else}
									<kbd class="px-2 py-1 text-xs font-mono bg-muted rounded">
										{binding.keys}
									</kbd>
								{/if}
							</Button>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	{#if $recordingCommand}
		<div class="fixed bottom-4 right-4 p-4 bg-card border rounded-lg shadow-lg">
			<p class="text-sm mb-2">正在录制快捷键，按下任意键...</p>
			<Button variant="outline" size="sm" onclick={cancelRecording}>取消</Button>
		</div>
	{/if}
</div>
