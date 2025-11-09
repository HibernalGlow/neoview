<script lang="ts">
	/**
	 * NeoView - Settings Panel Component
	 * 设置面板 - 参考 NeeView AppSettings.cs 和 SettingPage.cs
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Switch } from '$lib/components/ui/switch';

	// 设置状态
	let settings = $state({
		// 显示设置
		display: {
			imageScaling: 'fit' as 'fit' | 'width' | 'height' | 'original',
			backgroundColor: '#000000',
			allowStretch: false,
			keepAspectRatio: true,
			smoothScaling: true,
		},
		// 操作设置
		operation: {
			mouseWheelAction: 'zoom' as 'zoom' | 'page',
			doubleClickAction: 'fullscreen' as 'fullscreen' | 'close' | 'none',
			rightClickAction: 'menu' as 'menu' | 'back' | 'none',
		},
		// 性能设置
		performance: {
			cacheSize: 500,
			preloadPages: 3,
			enableGpuAcceleration: true,
			maxThreads: 4,
		},
		// 文件关联
		fileTypes: {
			images: true,
			archives: true,
			pdf: false,
		}
	});

	// 快捷键绑定
	let keyBindings = $state([
		{ action: 'nextPage', key: 'ArrowRight', description: '下一页' },
		{ action: 'prevPage', key: 'ArrowLeft', description: '上一页' },
		{ action: 'zoomIn', key: 'Plus', description: '放大' },
		{ action: 'zoomOut', key: 'Minus', description: '缩小' },
		{ action: 'fullscreen', key: 'F11', description: '全屏' },
		{ action: 'openFile', key: 'Ctrl+O', description: '打开文件' },
		{ action: 'closeBook', key: 'Ctrl+W', description: '关闭书籍' },
	]);

	// 正在编辑的快捷键
	let editingKeyIndex = $state<number | null>(null);

	function handleKeyCapture(event: KeyboardEvent, index: number) {
		event.preventDefault();
		event.stopPropagation();
		
		const key = event.key;
		const modifiers = [];
		if (event.ctrlKey) modifiers.push('Ctrl');
		if (event.shiftKey) modifiers.push('Shift');
		if (event.altKey) modifiers.push('Alt');
		
		const keyString = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
		keyBindings[index].key = keyString;
		editingKeyIndex = null;
	}

	function saveSettings() {
		localStorage.setItem('neoview-settings', JSON.stringify(settings));
		localStorage.setItem('neoview-keybindings', JSON.stringify(keyBindings));
		alert('设置已保存！');
	}

	function resetSettings() {
		if (confirm('确定要重置所有设置吗？')) {
			localStorage.removeItem('neoview-settings');
			localStorage.removeItem('neoview-keybindings');
			location.reload();
		}
	}

	// 加载保存的设置
	$effect(() => {
		const savedSettings = localStorage.getItem('neoview-settings');
		if (savedSettings) {
			try {
				settings = JSON.parse(savedSettings);
			} catch (e) {
				console.error('Failed to load settings:', e);
			}
		}

		const savedKeys = localStorage.getItem('neoview-keybindings');
		if (savedKeys) {
			try {
				keyBindings = JSON.parse(savedKeys);
			} catch (e) {
				console.error('Failed to load key bindings:', e);
			}
		}
	});
</script>

<div class="h-full flex flex-col bg-background">
	<div class="p-4 border-b">
		<h2 class="text-2xl font-bold">设置</h2>
		<p class="text-sm text-muted-foreground">自定义 NeoView 的行为和外观</p>
	</div>

	<div class="flex-1 overflow-auto">
		<Tabs value="display" class="w-full">
			<TabsList class="w-full justify-start border-b rounded-none h-auto p-0">
				<TabsTrigger value="display" class="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">显示</TabsTrigger>
				<TabsTrigger value="operation" class="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">操作</TabsTrigger>
				<TabsTrigger value="keyboard" class="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">快捷键</TabsTrigger>
				<TabsTrigger value="performance" class="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">性能</TabsTrigger>
				<TabsTrigger value="files" class="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">文件</TabsTrigger>
			</TabsList>

			<!-- 显示设置 -->
			<TabsContent value="display" class="p-4 space-y-6">
				<div class="space-y-2">
					<Label>图像缩放模式</Label>
					<select bind:value={settings.display.imageScaling} class="w-full px-3 py-2 rounded-md border bg-background">
						<option value="fit">适应窗口</option>
						<option value="width">适应宽度</option>
						<option value="height">适应高度</option>
						<option value="original">原始大小</option>
					</select>
				</div>

				<div class="space-y-2">
					<Label>背景颜色</Label>
					<Input type="color" bind:value={settings.display.backgroundColor} />
				</div>

				<div class="flex items-center justify-between">
					<Label>允许拉伸图像</Label>
					<Switch bind:checked={settings.display.allowStretch} />
				</div>

				<div class="flex items-center justify-between">
					<Label>保持宽高比</Label>
					<Switch bind:checked={settings.display.keepAspectRatio} />
				</div>

				<div class="flex items-center justify-between">
					<Label>平滑缩放</Label>
					<Switch bind:checked={settings.display.smoothScaling} />
				</div>
			</TabsContent>

			<!-- 操作设置 -->
			<TabsContent value="operation" class="p-4 space-y-6">
				<div class="space-y-2">
					<Label>鼠标滚轮动作</Label>
					<select bind:value={settings.operation.mouseWheelAction} class="w-full px-3 py-2 rounded-md border bg-background">
						<option value="zoom">缩放</option>
						<option value="page">翻页</option>
					</select>
				</div>

				<div class="space-y-2">
					<Label>双击动作</Label>
					<select bind:value={settings.operation.doubleClickAction} class="w-full px-3 py-2 rounded-md border bg-background">
						<option value="fullscreen">全屏</option>
						<option value="close">关闭</option>
						<option value="none">无</option>
					</select>
				</div>

				<div class="space-y-2">
					<Label>右键动作</Label>
					<select bind:value={settings.operation.rightClickAction} class="w-full px-3 py-2 rounded-md border bg-background">
						<option value="menu">菜单</option>
						<option value="back">返回</option>
						<option value="none">无</option>
					</select>
				</div>
			</TabsContent>

			<!-- 快捷键设置 -->
			<TabsContent value="keyboard" class="p-4">
				<div class="space-y-2">
					<div class="flex items-center justify-between py-2 border-b font-semibold">
						<span class="w-1/3">动作</span>
						<span class="w-1/3">快捷键</span>
						<span class="w-1/3">说明</span>
					</div>
					{#each keyBindings as binding, index (binding.action)}
						<div class="flex items-center justify-between py-2 border-b">
							<span class="w-1/3 text-sm">{binding.action}</span>
							<div class="w-1/3">
								{#if editingKeyIndex === index}
									<Input
										value={binding.key}
										placeholder="按下按键..."
										onkeydown={(e) => handleKeyCapture(e, index)}
										onfocus={(e) => {
											const target = e.target as HTMLInputElement;
											if (target) target.select();
										}}
										class="h-8"
										autofocus
									/>
								{:else}
									<Button
										variant="outline"
										size="sm"
										onclick={() => (editingKeyIndex = index)}
										class="h-8"
									>
										{binding.key}
									</Button>
								{/if}
							</div>
							<span class="w-1/3 text-sm text-muted-foreground">{binding.description}</span>
						</div>
					{/each}
				</div>
			</TabsContent>

			<!-- 性能设置 -->
			<TabsContent value="performance" class="p-4 space-y-6">
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label>缓存大小 (MB)</Label>
						<span class="text-sm text-muted-foreground">{settings.performance.cacheSize}</span>
					</div>
					<input
						type="range"
						bind:value={settings.performance.cacheSize}
						min={100}
						max={2000}
						step={100}
						class="w-full"
					/>
				</div>

				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label>预加载页数</Label>
						<span class="text-sm text-muted-foreground">{settings.performance.preloadPages}</span>
					</div>
					<input
						type="range"
						bind:value={settings.performance.preloadPages}
						min={0}
						max={10}
						step={1}
						class="w-full"
					/>
				</div>

				<div class="flex items-center justify-between">
					<Label>启用 GPU 加速</Label>
					<Switch bind:checked={settings.performance.enableGpuAcceleration} />
				</div>

				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label>最大线程数</Label>
						<span class="text-sm text-muted-foreground">{settings.performance.maxThreads}</span>
					</div>
					<input
						type="range"
						bind:value={settings.performance.maxThreads}
						min={1}
						max={16}
						step={1}
						class="w-full"
					/>
				</div>
			</TabsContent>

			<!-- 文件设置 -->
			<TabsContent value="files" class="p-4 space-y-6">
				<div class="flex items-center justify-between">
					<Label>支持图像文件</Label>
					<Switch bind:checked={settings.fileTypes.images} />
				</div>

				<div class="flex items-center justify-between">
					<Label>支持压缩包</Label>
					<Switch bind:checked={settings.fileTypes.archives} />
				</div>

				<div class="flex items-center justify-between">
					<Label>支持 PDF</Label>
					<Switch bind:checked={settings.fileTypes.pdf} />
				</div>
			</TabsContent>
		</Tabs>
	</div>

	<!-- 底部按钮 -->
	<div class="p-4 border-t flex justify-end gap-2">
		<Button variant="outline" onclick={resetSettings}>重置</Button>
		<Button onclick={saveSettings}>保存设置</Button>
	</div>
</div>
