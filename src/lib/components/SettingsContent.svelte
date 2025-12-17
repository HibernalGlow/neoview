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
		Monitor,
		Archive,
		Eye,
		BookOpen,
		LayoutDashboard,
		PanelLeft,
		Bell,
		LayoutGrid,
		Info
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
	import AboutPanel from '$lib/components/panels/AboutPanel.svelte';

	const tabs = [
		{ value: 'general', label: '通用', icon: Settings },
		{ value: 'system', label: '系统', icon: Monitor },
		{ value: 'image', label: '影像', icon: Palette },
		{ value: 'archive', label: '压缩包', icon: Archive },
		{ value: 'view', label: '视图', icon: Eye },
		{ value: 'notify', label: '通知', icon: Bell },
		{ value: 'book', label: '书籍', icon: BookOpen },
		{ value: 'theme', label: '外观', icon: LayoutDashboard },
		{ value: 'performance', label: '性能', icon: Zap },
		{ value: 'panels', label: '边栏管理', icon: PanelLeft },
		{ value: 'cards', label: '卡片管理', icon: LayoutGrid },
		{ value: 'bindings', label: '操作绑定', icon: Keyboard },
		{ value: 'data', label: '数据', icon: Monitor },
		{ value: 'about', label: '关于', icon: Info }
	];

	let activeTab = $state<string>('general');

	// 设置界面透明度和模糊度
	let settings = $state(settingsManager.getSettings());
	let settingsOpacity = $derived(settings.panels?.settingsOpacity ?? 85);
	let settingsBlur = $derived(settings.panels?.settingsBlur ?? 12);

	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	function switchTab(tabValue: string) {
		activeTab = tabValue;
	}

	// Dock 放大效果相关
	let mouseY = $state<number | null>(null);
	let tabRefs = $state<HTMLButtonElement[]>([]);

	// 计算每个图标的缩放比例
	function getIconScale(index: number): number {
		if (mouseY === null || !tabRefs[index]) return 1;
		const rect = tabRefs[index].getBoundingClientRect();
		const itemCenterY = rect.top + rect.height / 2;
		const distance = Math.abs(mouseY - itemCenterY);
		const maxDistance = 80; // 影响范围
		const maxScale = 1.4; // 最大放大倍数
		if (distance > maxDistance) return 1;
		// 使用余弦函数实现平滑过渡
		const scale = 1 + (maxScale - 1) * Math.cos((distance / maxDistance) * (Math.PI / 2));
		return scale;
	}

	function handleSidebarMouseMove(e: MouseEvent) {
		mouseY = e.clientY;
	}

	function handleSidebarMouseLeave() {
		mouseY = null;
	}
</script>

<!-- 设置内容（无固定定位，填充父容器） -->
<div class="flex h-full w-full flex-col text-foreground">
	<!-- 主内容区 -->
	<div class="flex flex-1 overflow-hidden">
		<!-- 左侧标签栏 - 带 Dock 放大效果 -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-48 shrink-0 space-y-1 border-r p-2 overflow-auto"
			style="background-color: color-mix(in oklch, var(--sidebar) {settingsOpacity}%, transparent); backdrop-filter: blur({settingsBlur}px);"
			onmousemove={handleSidebarMouseMove}
			onmouseleave={handleSidebarMouseLeave}
		>
			{#each tabs as tab, index}
				{@const IconComponent = tab.icon}
				{@const scale = getIconScale(index)}
				<button
					bind:this={tabRefs[index]}
					class="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-4 py-3 transition-colors {activeTab ===
					tab.value
						? 'bg-primary text-primary-foreground'
						: ''}"
					onclick={() => switchTab(tab.value)}
					type="button"
				>
					<div
						class="flex items-center justify-center transition-transform duration-150 ease-out"
						style="transform: scale({scale}); transform-origin: left center;"
					>
						<IconComponent class="h-5 w-5" />
					</div>
					<span class="font-medium">{tab.label}</span>
				</button>
			{/each}
		</div>

		<!-- 右侧内容区 - 路由到对应的面板组件 -->
		<div 
			class="flex-1 overflow-auto"
			style="background-color: color-mix(in oklch, var(--popover) {settingsOpacity}%, transparent); backdrop-filter: blur({settingsBlur}px);"
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
			{:else if activeTab === 'about'}
				<AboutPanel />
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
