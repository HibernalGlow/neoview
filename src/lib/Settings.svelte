<script lang="ts">
	/**
	 * NeoView - Settings Window
	 * 设置窗口主组件 - 多标签页设计
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import { Settings, Keyboard, Palette, Zap, Mouse, Hand, X, Minimize, Info } from '@lucide/svelte';
	import ViewerSettingsPanel from '$lib/components/dialogs/ViewerSettingsPanel.svelte';
	import UnifiedBindingPanel from '$lib/components/dialogs/UnifiedBindingPanel.svelte';

	const appWindow = getCurrentWebviewWindow();

	const tabs = [
		{ value: 'general', label: '通用', icon: Settings },
		{ value: 'viewer', label: '查看器', icon: Palette },
		{ value: 'bindings', label: '操作绑定', icon: Keyboard },
		{ value: 'performance', label: '性能', icon: Zap }
	];

	let activeTab = $state('general');

	async function minimizeWindow() {
		await appWindow.minimize();
	}

	async function closeWindow() {
		await appWindow.close();
	}

	function saveSettings() {
		// TODO: 实现设置保存逻辑
		alert('设置已保存');
	}
</script>

<div class="h-screen w-screen flex flex-col bg-background">
	<!-- 自定义标题栏 -->
	<div
		data-tauri-drag-region
		class="h-10 bg-secondary/50 flex items-center justify-between px-4 select-none border-b"
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
	<div class="flex-1 flex overflow-hidden">
		<!-- 左侧标签栏 -->
		<div class="w-48 border-r p-2 space-y-1 bg-secondary/30">
			{#each tabs as tab}
				{@const IconComponent = tab.icon}
				<button
					class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors {activeTab ===
					tab.value
						? 'bg-primary text-primary-foreground'
						: ''}"
					onclick={() => (activeTab = tab.value)}
				>
					<IconComponent class="h-5 w-5" />
					<span class="font-medium">{tab.label}</span>
				</button>
			{/each}
		</div>

		<!-- 右侧内容区 -->
		<div class="flex-1 overflow-auto">
			{#if activeTab === 'general'}
				<div class="p-6 space-y-6">
					<div class="space-y-2">
						<h3 class="text-lg font-semibold flex items-center gap-2">
							<Settings class="h-5 w-5" />
							通用设置
						</h3>
						<p class="text-sm text-muted-foreground">配置 NeoView 的基本行为和外观</p>
					</div>

					<div class="space-y-4">
						<!-- 语言设置 -->
						<div class="space-y-2">
							<h4 class="text-sm font-semibold">语言</h4>
							<select class="w-full max-w-xs p-2 border rounded-md">
								<option value="zh-CN">简体中文</option>
								<option value="en-US">English</option>
								<option value="ja-JP">日本語</option>
							</select>
						</div>

						<!-- 主题设置 -->
						<div class="space-y-2">
							<h4 class="text-sm font-semibold">主题</h4>
							<select class="w-full max-w-xs p-2 border rounded-md">
								<option value="light">浅色</option>
								<option value="dark">深色</option>
								<option value="auto">跟随系统</option>
							</select>
						</div>

						<!-- 启动设置 -->
						<div class="space-y-2">
							<h4 class="text-sm font-semibold">启动</h4>
							<label class="flex items-center gap-2">
								<input type="checkbox" class="rounded" />
								<span class="text-sm">启动时打开上次的文件</span>
							</label>
							<label class="flex items-center gap-2">
								<input type="checkbox" class="rounded" />
								<span class="text-sm">最小化到系统托盘</span>
							</label>
						</div>

						<!-- 文件关联 -->
						<div class="space-y-2">
							<h4 class="text-sm font-semibold">文件关联</h4>
							<div class="space-y-1">
								<label class="flex items-center gap-2">
									<input type="checkbox" class="rounded" checked />
									<span class="text-sm">图像文件 (jpg, png, webp, avif, jxl)</span>
								</label>
								<label class="flex items-center gap-2">
									<input type="checkbox" class="rounded" checked />
									<span class="text-sm">压缩包 (zip, cbz, rar, cbr)</span>
								</label>
								<label class="flex items-center gap-2">
									<input type="checkbox" class="rounded" />
									<span class="text-sm">PDF 文件</span>
								</label>
							</div>
						</div>
					</div>
				</div>
			{:else if activeTab === 'viewer'}
				<ViewerSettingsPanel />
			{:else if activeTab === 'bindings'}
				<UnifiedBindingPanel />
			{:else if activeTab === 'performance'}
				<div class="p-6 space-y-6">
					<div class="space-y-2">
						<h3 class="text-lg font-semibold flex items-center gap-2">
							<Zap class="h-5 w-5" />
							性能设置
						</h3>
						<p class="text-sm text-muted-foreground">优化应用性能和资源使用</p>
					</div>

					<div class="space-y-4">
						<!-- 缓存设置 -->
						<div class="space-y-2">
							<h4 class="text-sm font-semibold">缓存</h4>
							<div class="space-y-2">
								<label class="flex items-center justify-between">
									<span class="text-sm">图像缓存大小</span>
									<span class="text-xs text-muted-foreground">512 MB</span>
								</label>
								<input type="range" min="128" max="2048" value="512" step="128" class="w-full" />
							</div>
						</div>

						<!-- 预加载设置 -->
						<div class="space-y-2">
							<h4 class="text-sm font-semibold">预加载</h4>
							<label class="flex items-center gap-2">
								<input type="checkbox" class="rounded" checked />
								<span class="text-sm">启用页面预加载</span>
							</label>
							<div class="space-y-2">
								<label class="flex items-center justify-between">
									<span class="text-sm">预加载页面数</span>
									<span class="text-xs text-muted-foreground">3</span>
								</label>
								<input type="range" min="1" max="10" value="3" class="w-full" />
							</div>
						</div>

						<!-- GPU 加速 -->
						<div class="space-y-2">
							<h4 class="text-sm font-semibold">硬件加速</h4>
							<label class="flex items-center gap-2">
								<input type="checkbox" class="rounded" checked />
								<span class="text-sm">启用 GPU 渲染</span>
							</label>
							<label class="flex items-center gap-2">
								<input type="checkbox" class="rounded" />
								<span class="text-sm">使用硬件解码</span>
							</label>
						</div>

						<!-- 线程设置 -->
						<div class="space-y-2">
							<h4 class="text-sm font-semibold">多线程</h4>
							<div class="space-y-2">
								<label class="flex items-center justify-between">
									<span class="text-sm">解码线程数</span>
									<span class="text-xs text-muted-foreground">4</span>
								</label>
								<input type="range" min="1" max="16" value="4" class="w-full" />
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- 底部按钮 -->
	<div class="h-14 border-t flex items-center justify-between px-4 gap-2 bg-secondary/30">
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<Info class="h-3 w-3" />
			<span>更改将自动保存</span>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={closeWindow}>关闭</Button>
			<Button onclick={saveSettings}>应用</Button>
		</div>
	</div>
</div>
