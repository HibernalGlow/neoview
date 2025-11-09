<script lang="ts">
	/**
	 * NeoView - Settings Dialog
	 * 设置对话框
	 */
	import { Dialog } from '$lib/components/ui/dialog';
	import { Tabs } from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Settings, Keyboard, Palette, Zap } from '@lucide/svelte';
	import KeyBindingPanel from './KeyBindingPanel.svelte';
	import ViewerSettingsPanel from './ViewerSettingsPanel.svelte';

	let { open = $bindable(false) } = $props();

	const tabs = [
		{ value: 'general', label: '通用', icon: Settings },
		{ value: 'viewer', label: '查看器', icon: Palette },
		{ value: 'keyboard', label: '快捷键', icon: Keyboard },
		{ value: 'performance', label: '性能', icon: Zap }
	];

	let activeTab = $state('general');
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-4xl h-[600px]">
		<Dialog.Header>
			<Dialog.Title>设置</Dialog.Title>
			<Dialog.Description>配置 NeoView 的各项设置</Dialog.Description>
		</Dialog.Header>

		<div class="flex h-full">
			<!-- 左侧标签栏 -->
			<div class="w-48 border-r pr-4">
				{#each tabs as tab}
					<button
						class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors {activeTab ===
						tab.value
							? 'bg-accent'
							: ''}"
						onclick={() => (activeTab = tab.value)}
					>
						<svelte:component this={tab.icon} class="h-5 w-5" />
						<span>{tab.label}</span>
					</button>
				{/each}
			</div>

			<!-- 右侧内容区 -->
			<div class="flex-1 pl-6 overflow-auto">
				{#if activeTab === 'general'}
					<div class="space-y-4">
						<h3 class="text-lg font-semibold">通用设置</h3>
						<p class="text-sm text-muted-foreground">即将推出...</p>
					</div>
				{:else if activeTab === 'viewer'}
					<ViewerSettingsPanel />
				{:else if activeTab === 'keyboard'}
					<KeyBindingPanel />
				{:else if activeTab === 'performance'}
					<div class="space-y-4">
						<h3 class="text-lg font-semibold">性能设置</h3>
						<p class="text-sm text-muted-foreground">即将推出...</p>
					</div>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>关闭</Button>
			<Button onclick={() => (open = false)}>保存</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
