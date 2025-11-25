<script lang="ts">
	/**
	 * NeoView - Settings Window (Router Only)
	 * 设置窗口 - 仅负责路由,具体内容由各个面板组件实现
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import {
		Settings,
		Keyboard,
		Palette,
		Zap,
		Mouse,
		X,
		Minimize,
		Monitor,
		Archive,
		Eye,
		BookOpen,
		Layout,
		PanelLeft
	} from '@lucide/svelte';

	// 导入所有设置面板组件
	import GeneralSettingsPanel from '$lib/components/panels/GeneralSettingsPanel.svelte';
	import ViewSettingsPanel from '$lib/components/panels/ViewSettingsPanel.svelte';
	import ViewerSettingsPanel from '$lib/components/dialogs/ViewerSettingsPanel.svelte';
	import ImageSettingsPanel from '$lib/components/panels/ImageSettingsPanel.svelte';
	import UnifiedBindingPanel from '$lib/components/dialogs/UnifiedBindingPanel.svelte';
	import SidebarManagementPanel from '$lib/components/panels/SidebarManagementPanel.svelte';
	import ThemePanel from '$lib/components/panels/ThemePanel.svelte';
import ArchiveSettingsPanel from '$lib/components/panels/ArchiveSettingsPanel.svelte';
	import PerformanceSettingsPanel from '$lib/components/panels/PerformanceSettingsPanel.svelte';
	import DataSettingsPanel from '$lib/components/panels/DataSettingsPanel.svelte';

	const appWindow = getCurrentWebviewWindow();

	const tabs = [
		{ value: 'general', label: '通用', icon: Settings },
		{ value: 'system', label: '系统', icon: Monitor },
		{ value: 'image', label: '影像', icon: Palette },
		{ value: 'archive', label: '压缩包', icon: Archive },
		{ value: 'view', label: '视图', icon: Eye },
		{ value: 'book', label: '书籍', icon: BookOpen },
		{ value: 'theme', label: '外观', icon: Layout },
		{ value: 'performance', label: '性能', icon: Zap },
		{ value: 'panels', label: '边栏管理', icon: PanelLeft },
		{ value: 'bindings', label: '操作绑定', icon: Keyboard },
		{ value: 'data', label: '数据', icon: Monitor }
	];

	let activeTab = $state<string>('general');

	function switchTab(tabValue: string) {
		activeTab = tabValue;
	}

	async function minimizeWindow() {
		await appWindow.minimize();
	}

	async function closeWindow() {
		await appWindow.close();
	}
</script>

<div class="fixed inset-0 bg-background flex flex-col">
	<!-- 自定义标题栏 -->
	<div
		data-tauri-drag-region
		class="bg-secondary/50 flex h-10 select-none items-center justify-between border-b px-4"
	>
		<div class="flex items-center gap-2">
			<Settings class="h-4 w-4" />
			<span class="text-sm font-semibold">设置</span>
		</div>

		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon" class="h-7 w-7" onclick={minimizeWindow}>
				<Minimize class="h-3 w-3" />
			</Button>
			<Button variant="ghost" size="icon" class="h-7 w-7" onclick={closeWindow}>
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- 主内容区 -->
	<div class="flex flex-1 overflow-hidden">
		<!-- 左侧标签栏 -->
		<div class="bg-secondary/30 w-48 space-y-1 border-r p-2">
			{#each tabs as tab}
				{@const IconComponent = tab.icon}
				<button
					class="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-4 py-3 transition-colors {activeTab ===
					tab.value
						? 'bg-primary text-primary-foreground'
						: ''}"
					onclick={() => switchTab(tab.value)}
					type="button"
				>
					<IconComponent class="h-5 w-5" />
					<span class="font-medium">{tab.label}</span>
				</button>
			{/each}
		</div>

		<!-- 右侧内容区 - 路由到对应的面板组件 -->
		<div class="flex-1 overflow-auto">
			{#if activeTab === 'general'}
				<GeneralSettingsPanel />
			{:else if activeTab === 'view'}
				<ViewSettingsPanel />
			{:else if activeTab === 'viewer' || activeTab === 'image'}
				{#if activeTab === 'image'}
					<div class="space-y-4 p-6">
						<div class="rounded-lg border bg-card text-card-foreground p-4">
							<h3 class="text-base font-semibold">影像</h3>
							<p class="text-sm text-muted-foreground mt-1">
								这里将放置全局影像（图片和视频）相关设置，例如格式支持、默认超分行为等。
							</p>
						</div>
						<ImageSettingsPanel />
						<ViewerSettingsPanel />
					</div>
				{:else}
					<ViewerSettingsPanel />
				{/if}
			{:else if activeTab === 'bindings'}
				<UnifiedBindingPanel />
			{:else if activeTab === 'panels'}
				<SidebarManagementPanel />
			{:else if activeTab === 'theme'}
				<ThemePanel />
			{:else if activeTab === 'archive'}
				<ArchiveSettingsPanel />
			{:else if activeTab === 'performance'}
				<PerformanceSettingsPanel />
			{:else if activeTab === 'data'}
				<DataSettingsPanel />
			{:else}
				<!-- 其他标签暂未实现 -->
				<div class="p-6">
					<h3 class="text-lg font-semibold">{tabs.find((t) => t.value === activeTab)?.label}</h3>
					<p class="text-muted-foreground mt-2 text-sm">此功能即将推出...</p>
				</div>
			{/if}
		</div>
	</div>
</div>
