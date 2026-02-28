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
		Eye,
		BookOpen,
		LayoutDashboard,
		PanelLeft,
		Bell,
		LayoutGrid,
		Info
	} from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';

	type PanelModule = { default: unknown };

	const panelLoaders = {
		general: () => import('$lib/components/panels/GeneralSettingsPanel.svelte'),
		system: () => import('$lib/components/panels/SystemSettingsPanel.svelte'),
		view: () => import('$lib/components/panels/ViewSettingsPanel.svelte'),
		notify: () => import('$lib/components/panels/NotificationSettingsPanel.svelte'),
		bindings: () => import('$lib/components/dialogs/UnifiedBindingPanel.svelte'),
		panels: () => import('$lib/components/panels/SidebarManagementPanel.svelte'),
		cards: () => import('$lib/components/settings/CardPanelManager.svelte'),
		theme: () => import('$lib/components/panels/ThemePanel.svelte'),
		book: () => import('$lib/components/panels/BookSettingsPanel.svelte'),
		performance: () => import('$lib/components/panels/PerformanceSettingsPanel.svelte'),
		data: () => import('$lib/components/panels/DataSettingsPanel.svelte'),
		about: () => import('$lib/components/panels/AboutPanel.svelte')
	} as const;

	const panelPromises = new Map<string, Promise<PanelModule>>();
	let imagePanelsPromise: Promise<[PanelModule, PanelModule]> | null = null;

	function getPanelPromise(tabValue: string): Promise<PanelModule> | null {
		const loadPanel = panelLoaders[tabValue as keyof typeof panelLoaders];
		if (!loadPanel) return null;

		const cached = panelPromises.get(tabValue);
		if (cached) return cached;

		const nextPromise = loadPanel();
		panelPromises.set(tabValue, nextPromise);
		return nextPromise;
	}

	function getImagePanelsPromise(): Promise<[PanelModule, PanelModule]> {
		if (!imagePanelsPromise) {
			imagePanelsPromise = Promise.all([
				import('$lib/components/panels/ImageSettingsPanel.svelte'),
				import('$lib/components/dialogs/ViewerSettingsPanel.svelte')
			]);
		}
		return imagePanelsPromise;
	}

	const tabs = [
		{ value: 'general', label: '通用', icon: Settings },
		{ value: 'system', label: '系统', icon: Monitor },
		{ value: 'image', label: '影像', icon: Palette },
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
			class="w-12 sm:w-40 shrink-0 space-y-1 border-r p-1.5 overflow-x-hidden overflow-y-auto"
			style="background-color: color-mix(in oklch, var(--sidebar) {settingsOpacity}%, transparent); backdrop-filter: blur({settingsBlur}px);"
			onmousemove={handleSidebarMouseMove}
			onmouseleave={handleSidebarMouseLeave}
		>
			{#each tabs as tab, index}
				{@const IconComponent = tab.icon}
				{@const scale = getIconScale(index)}
				<button
					bind:this={tabRefs[index]}
					class="hover:bg-accent flex w-full items-center justify-center sm:justify-start gap-0 sm:gap-2.5 rounded-lg px-0 sm:px-3 py-2.5 transition-all {activeTab ===
					tab.value
						? 'bg-primary text-primary-foreground shadow-sm'
						: 'text-muted-foreground'}"
					onclick={() => switchTab(tab.value)}
					title={tab.label}
					type="button"
				>
					<div
						class="flex items-center justify-center transition-transform duration-150 ease-out"
						style="transform: scale({scale});"
					>
						<IconComponent class="h-4.5 w-4.5 sm:h-4 sm:w-4" />
					</div>
					<span class="hidden sm:block truncate text-xs font-medium">{tab.label}</span>
				</button>
			{/each}
		</div>

		<!-- 右侧内容区 - 路由到对应的面板组件 -->
		<div 
			class="flex-1 overflow-auto"
			style="background-color: color-mix(in oklch, var(--popover) {settingsOpacity}%, transparent); backdrop-filter: blur({settingsBlur}px);"
		>
			{#if activeTab === 'general'}
				{#await getPanelPromise('general') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">通用设置加载失败</div>
				{/await}
			{:else if activeTab === 'system'}
				{#await getPanelPromise('system') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">系统设置加载失败</div>
				{/await}
			{:else if activeTab === 'view'}
				{#await getPanelPromise('view') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">视图设置加载失败</div>
				{/await}
			{:else if activeTab === 'notify'}
				{#await getPanelPromise('notify') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">通知设置加载失败</div>
				{/await}
			{:else if activeTab === 'viewer' || activeTab === 'image'}
				{#if activeTab === 'image'}
					{#await getImagePanelsPromise() then imagePanels}
						{@const ImagePanel = imagePanels[0].default as any}
						{@const ViewerPanel = imagePanels[1].default as any}
						<div class="space-y-4 p-6">
							<div class="rounded-lg border bg-card text-card-foreground p-4">
								<h3 class="text-base font-semibold">影像</h3>
								<p class="text-sm text-muted-foreground mt-1">
									这里将放置全局影像（图片和视频）相关设置，例如格式支持、默认超分行为等。
								</p>
							</div>
							<ImagePanel />
							<ViewerPanel />
						</div>
					{:catch}
						<div class="p-6 text-sm text-destructive">影像设置加载失败</div>
					{/await}
				{:else}
					{#await getImagePanelsPromise() then imagePanels}
						{@const ViewerPanel = imagePanels[1].default as any}
						<ViewerPanel />
					{:catch}
						<div class="p-6 text-sm text-destructive">阅读器设置加载失败</div>
					{/await}
				{/if}
			{:else if activeTab === 'bindings'}
				{#await getPanelPromise('bindings') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">操作绑定加载失败</div>
				{/await}
			{:else if activeTab === 'panels'}
				{#await getPanelPromise('panels') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">边栏管理加载失败</div>
				{/await}
			{:else if activeTab === 'cards'}
				{#await getPanelPromise('cards') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					<div class="p-6">
						{#if PanelComponent}
							<PanelComponent />
						{/if}
					</div>
				{:catch}
					<div class="p-6 text-sm text-destructive">卡片管理加载失败</div>
				{/await}
			{:else if activeTab === 'theme'}
				{#await getPanelPromise('theme') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">外观设置加载失败</div>
				{/await}
			{:else if activeTab === 'book'}
				{#await getPanelPromise('book') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">书籍设置加载失败</div>
				{/await}
			{:else if activeTab === 'performance'}
				{#await getPanelPromise('performance') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">性能设置加载失败</div>
				{/await}
			{:else if activeTab === 'data'}
				{#await getPanelPromise('data') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">数据设置加载失败</div>
				{/await}
			{:else if activeTab === 'about'}
				{#await getPanelPromise('about') then panelModule}
					{@const PanelComponent = panelModule?.default as any}
					{#if PanelComponent}
						<PanelComponent />
					{/if}
				{:catch}
					<div class="p-6 text-sm text-destructive">关于页面加载失败</div>
				{/await}
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
