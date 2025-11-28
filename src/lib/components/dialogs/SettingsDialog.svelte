<script lang="ts">
	/**
	 * NeoView - Settings Dialog
	 * 设置对话框
	 */
	import { Dialog } from '$lib/components/ui/dialog';
	import { Tabs } from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Settings, Keyboard, Palette, Zap, Mouse, Hand, Paintbrush, PanelLeft } from '@lucide/svelte';
	import KeyBindingPanel from './KeyBindingPanel.svelte';
	import UnifiedBindingPanel from './UnifiedBindingPanel.svelte';
	import ViewerSettingsPanel from './ViewerSettingsPanel.svelte';
	import MouseSettingsPanel from './MouseSettingsPanel.svelte';
	import GestureSettingsPanel from './GestureSettingsPanel.svelte';
	import ThemePanel from '$lib/components/panels/ThemePanel.svelte';
	import SidebarPanelManager from '$lib/components/settings/SidebarPanelManager.svelte';

	let { open = $bindable(false) } = $props();

	const tabs = [
		{ value: 'general', label: '通用', icon: Settings },
		{ value: 'appearance', label: '外观', icon: Paintbrush },
		{ value: 'panels', label: '面板', icon: PanelLeft },
		{ value: 'viewer', label: '查看器', icon: Palette },
		{ value: 'keyboard', label: '快捷键', icon: Keyboard },
		{ value: 'mouse', label: '鼠标', icon: Mouse },
		{ value: 'gesture', label: '手势', icon: Hand },
		{ value: 'performance', label: '性能', icon: Zap }
	];

	let activeTab = $state('general');
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="h-[600px] max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>设置</Dialog.Title>
			<Dialog.Description>配置 NeoView 的各项设置</Dialog.Description>
		</Dialog.Header>

		<Tabs.Root bind:value={activeTab} class="flex h-full">
			<Tabs.List class="h-full w-48 flex-col border-r bg-transparent pr-4">
				{#each tabs as tab}
					{@const IconComponent = tab.icon}
					<Tabs.Trigger value={tab.value} class="w-full justify-start gap-3">
						<IconComponent class="h-5 w-5" />
						<span>{tab.label}</span>
					</Tabs.Trigger>
				{/each}
			</Tabs.List>

			<!-- 右侧内容区 -->
			<div class="flex-1 overflow-auto pl-6">
				<Tabs.Content value="general">
					<div class="space-y-4">
						<h3 class="text-lg font-semibold">通用设置</h3>
						<p class="text-muted-foreground text-sm">即将推出...</p>
					</div>
				</Tabs.Content>

				<Tabs.Content value="appearance">
					<ThemePanel />
				</Tabs.Content>

				<Tabs.Content value="panels">
					<SidebarPanelManager />
				</Tabs.Content>

				<Tabs.Content value="viewer">
					<ViewerSettingsPanel />
				</Tabs.Content>

				<Tabs.Content value="keyboard">
					<UnifiedBindingPanel />
				</Tabs.Content>

				<Tabs.Content value="mouse">
					<UnifiedBindingPanel />
				</Tabs.Content>

				<Tabs.Content value="gesture">
					<UnifiedBindingPanel />
				</Tabs.Content>

				<Tabs.Content value="performance">
					<div class="space-y-4">
						<h3 class="text-lg font-semibold">性能设置</h3>
						<p class="text-muted-foreground text-sm">即将推出...</p>
					</div>
				</Tabs.Content>
			</div>
		</Tabs.Root>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>关闭</Button>
			<Button onclick={() => (open = false)}>保存</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
