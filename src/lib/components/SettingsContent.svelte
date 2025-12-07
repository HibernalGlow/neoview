<script lang="ts">
	/**
	 * 设置内容组件 - 纯内容，不包含窗口外壳
	 * 可嵌入到独立窗口或覆盖层中使用
	 */
	import {
		Settings,
		Keyboard,
		Palette,
		Zap,
		Mouse,
		Monitor,
		Archive,
		Eye,
		BookOpen,
		Layout,
		PanelLeft,
		Bell,
		LayoutGrid
	} from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';

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
	import NotificationSettingsPanel from '$lib/components/panels/NotificationSettingsPanel.svelte';
	import CardPanelManager from '$lib/components/settings/CardPanelManager.svelte';

	const tabs = [
		{ value: 'general', label: '通用', icon: Settings },
		{ value: 'system', label: '系统', icon: Monitor },
		{ value: 'image', label: '影像', icon: Palette },
		{ value: 'archive', label: '压缩包', icon: Archive },
		{ value: 'view', label: '视图', icon: Eye },
		{ value: 'notify', label: '通知', icon: Bell },
		{ value: 'book', label: '书籍', icon: BookOpen },
		{ value: 'theme', label: '外观', icon: Layout },
		{ value: 'performance', label: '性能', icon: Zap },
		{ value: 'panels', label: '边栏管理', icon: PanelLeft },
		{ value: 'cards', label: '卡片管理', icon: LayoutGrid },
		{ value: 'bindings', label: '操作绑定', icon: Keyboard },
		{ value: 'data', label: '数据', icon: Monitor }
	];

	let activeTab = $state<string>('general');

	// 侧栏透明度和模糊度
	let settings = $state(settingsManager.getSettings());
	let sidebarOpacity = $derived(settings.panels?.sidebarOpacity ?? 85);
	let sidebarBlur = $derived(settings.panels?.sidebarBlur ?? 12);
	// 内容区使用 popover 透明度
	let popoverOpacity = $derived(settings.panels?.topToolbarOpacity ?? 85);
	let popoverBlur = $derived(settings.panels?.topToolbarBlur ?? 12);
	
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	function switchTab(tabValue: string) {
		activeTab = tabValue;
	}
</script>

<!-- 设置内容（无固定定位，填充父容器） -->
<div class="flex h-full w-full flex-col text-foreground">
	<!-- 主内容区 -->
	<div class="flex flex-1 overflow-hidden">
		<!-- 左侧标签栏 -->
		<div 
			class="w-48 shrink-0 space-y-1 border-r p-2 overflow-auto"
			style="background-color: color-mix(in oklch, var(--sidebar) {sidebarOpacity}%, transparent); backdrop-filter: blur({sidebarBlur}px);"
		>
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
		<div 
			class="flex-1 overflow-auto"
			style="background-color: color-mix(in oklch, var(--popover) {popoverOpacity}%, transparent); backdrop-filter: blur({popoverBlur}px);"
		>
			{#if activeTab === 'general'}
				<GeneralSettingsPanel />
			{:else if activeTab === 'view'}
				<ViewSettingsPanel />
			{:else if activeTab === 'notify'}
				<NotificationSettingsPanel />
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
			{:else if activeTab === 'cards'}
				<div class="p-6">
					<CardPanelManager />
				</div>
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
