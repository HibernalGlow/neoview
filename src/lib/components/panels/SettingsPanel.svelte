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
	import * as Select from '$lib/components/ui/select';
	import { settingsManager } from '$lib/stores/settingsManager.svelte';
	import { Upload, Download, RotateCcw } from '@lucide/svelte';

	// 设置状态
	let settings = $state({
		// 显示设置
		display: {
			imageScaling: 'fit' as 'fit' | 'width' | 'height' | 'original',
			backgroundColor: '#000000',
			allowStretch: false,
			keepAspectRatio: true,
			smoothScaling: true
		},
		// 操作设置
		operation: {
			mouseWheelAction: 'zoom' as 'zoom' | 'page',
			doubleClickAction: 'fullscreen' as 'fullscreen' | 'close' | 'none',
			rightClickAction: 'menu' as 'menu' | 'back' | 'none'
		},
		// 性能设置
		performance: {
			cacheSize: 500,
			preloadPages: 3,
			enableGpuAcceleration: true,
			maxThreads: 4
		},
		// 文件关联
		fileTypes: {
			images: true,
			archives: true,
			pdf: false
		}
	});

	// 快捷键绑定
	let keyBindings = $state([
		{ action: 'nextPage', key: 'ArrowRight', description: '下一页', category: '导航' },
		{ action: 'prevPage', key: 'ArrowLeft', description: '上一页', category: '导航' },
		{ action: 'firstPage', key: 'Home', description: '第一页', category: '导航' },
		{ action: 'lastPage', key: 'End', description: '最后一页', category: '导航' },
		{ action: 'nextBook', key: 'Ctrl+]', description: '下一个书籍', category: '导航' },
		{ action: 'prevBook', key: 'Ctrl+[', description: '上一个书籍', category: '导航' },
		{ action: 'zoomIn', key: 'Ctrl++', description: '放大', category: '缩放' },
		{ action: 'zoomOut', key: 'Ctrl+-', description: '缩小', category: '缩放' },
		{ action: 'zoomReset', key: 'Ctrl+0', description: '重置缩放', category: '缩放' },
		{ action: 'fullscreen', key: 'F11', description: '全屏', category: '视图' },
		{ action: 'openFile', key: 'Ctrl+O', description: '打开文件', category: '文件' },
		{ action: 'closeBook', key: 'Ctrl+W', description: '关闭书籍', category: '文件' },
		{ action: 'toggleLeftSidebar', key: 'F2', description: '切换左侧边栏', category: '视图' }
	]);

	// 正在编辑的快捷键
	let editingKeyIndex = $state<number | null>(null);
	let capturedKeys = $state<Set<string>>(new Set());

	// 改进的按键捕获（参考 NeeView 的实现）
	function handleKeyDown(event: KeyboardEvent, index: number) {
		event.preventDefault();
		event.stopPropagation();

		// 捕获修饰键状态
		const ctrl = event.ctrlKey;
		const shift = event.shiftKey;
		const alt = event.altKey;

		// 忽略单独的修饰键
		if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
			return;
		}

		// 格式化按键名称
		let keyName = event.key;

		// 特殊键名映射（与 NeeView 一致）
		const keyMap: Record<string, string> = {
			' ': 'Space',
			'+': 'Plus',
			'-': 'Minus',
			'=': 'Equal',
			ArrowUp: 'Up',
			ArrowDown: 'Down',
			ArrowLeft: 'Left',
			ArrowRight: 'Right'
		};

		if (keyMap[keyName]) {
			keyName = keyMap[keyName];
		} else if (keyName.length === 1) {
			// 字母/数字大写
			keyName = keyName.toUpperCase();
		}

		// 构建快捷键字符串
		const modifiers: string[] = [];
		if (ctrl) modifiers.push('Ctrl');
		if (shift) modifiers.push('Shift');
		if (alt) modifiers.push('Alt');

		const keyString = modifiers.length > 0 ? `${modifiers.join('+')}+${keyName}` : keyName;

		keyBindings[index].key = keyString;
		editingKeyIndex = null;
	}

	function startEditKey(index: number) {
		editingKeyIndex = index;
	}

	function cancelEditKey() {
		editingKeyIndex = null;
	}

	function saveSettings() {
		localStorage.setItem('neoview-settings', JSON.stringify(settings));
		localStorage.setItem('neoview-keybindings', JSON.stringify(keyBindings));
		alert('设置已保存！');
	}

	function resetSettings() {
		if (confirm('确定要重置所有设置吗？')) {
			settingsManager.resetAllSettings();
			localStorage.removeItem('neoview-settings');
			localStorage.removeItem('neoview-keybindings');
			location.reload();
		}
	}

	// 导出设置到JSON文件
	async function exportSettings() {
		try {
			await settingsManager.exportToFile();
			alert('设置已导出！');
		} catch (error) {
			console.error('导出设置失败:', error);
			alert('导出设置失败，请检查控制台。');
		}
	}

	// 导入设置从JSON文件
	async function importSettings() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/json,.json';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement)?.files?.[0];
			if (!file) return;

			try {
				await settingsManager.importFromFile(file);
				alert('设置已导入！页面将重新加载。');
				location.reload();
			} catch (error) {
				console.error('导入设置失败:', error);
				alert('导入设置失败，请检查文件格式。');
			}
		};
		input.click();
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

<div class="bg-background flex h-full flex-col">
	<div class="border-b p-4">
		<h2 class="text-2xl font-bold">设置</h2>
		<p class="text-muted-foreground text-sm">自定义 NeoView 的行为和外观</p>
	</div>

	<div class="flex-1 overflow-auto">
		<Tabs value="display" class="w-full">
			<TabsList class="h-auto w-full justify-start rounded-none border-b p-0">
				<TabsTrigger
					value="display"
					class="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
					>显示</TabsTrigger
				>
				<TabsTrigger
					value="operation"
					class="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
					>操作</TabsTrigger
				>
				<TabsTrigger
					value="keyboard"
					class="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
					>快捷键</TabsTrigger
				>
				<TabsTrigger
					value="performance"
					class="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
					>性能</TabsTrigger
				>
				<TabsTrigger
					value="files"
					class="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
					>文件</TabsTrigger
				>
			</TabsList>

			<!-- 显示设置 -->
			<TabsContent value="display" class="space-y-6 p-4">
				<div class="space-y-2">
					<Label>图像缩放模式</Label>
					<Select.Root
						selected={{
							value: settings.display.imageScaling,
							label:
								settings.display.imageScaling === 'fit'
									? '适应窗口'
									: settings.display.imageScaling === 'width'
										? '适应宽度'
										: settings.display.imageScaling === 'height'
											? '适应高度'
											: '原始大小'
						}}
						onSelectedChange={(v) => v && (settings.display.imageScaling = v.value as any)}
					>
						<Select.Trigger class="w-full" />
						<Select.Content>
							<Select.Item value="fit">适应窗口</Select.Item>
							<Select.Item value="width">适应宽度</Select.Item>
							<Select.Item value="height">适应高度</Select.Item>
							<Select.Item value="original">原始大小</Select.Item>
						</Select.Content>
					</Select.Root>
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
			<TabsContent value="operation" class="space-y-6 p-4">
				<div class="space-y-2">
					<Label>鼠标滚轮动作</Label>
					<Select.Root
						selected={{
							value: settings.operation.mouseWheelAction,
							label: settings.operation.mouseWheelAction === 'zoom' ? '缩放' : '翻页'
						}}
						onSelectedChange={(v) => v && (settings.operation.mouseWheelAction = v.value as any)}
					>
						<Select.Trigger class="w-full" />
						<Select.Content>
							<Select.Item value="zoom">缩放</Select.Item>
							<Select.Item value="page">翻页</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>

				<div class="space-y-2">
					<Label>双击动作</Label>
					<Select.Root
						selected={{
							value: settings.operation.doubleClickAction,
							label:
								settings.operation.doubleClickAction === 'fullscreen'
									? '全屏'
									: settings.operation.doubleClickAction === 'close'
										? '关闭'
										: '无'
						}}
						onSelectedChange={(v) => v && (settings.operation.doubleClickAction = v.value as any)}
					>
						<Select.Trigger class="w-full" />
						<Select.Content>
							<Select.Item value="fullscreen">全屏</Select.Item>
							<Select.Item value="close">关闭</Select.Item>
							<Select.Item value="none">无</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>

				<div class="space-y-2">
					<Label>右键动作</Label>
					<Select.Root
						selected={{
							value: settings.operation.rightClickAction,
							label:
								settings.operation.rightClickAction === 'menu'
									? '菜单'
									: settings.operation.rightClickAction === 'back'
										? '返回'
										: '无'
						}}
						onSelectedChange={(v) => v && (settings.operation.rightClickAction = v.value as any)}
					>
						<Select.Trigger class="w-full" />
						<Select.Content>
							<Select.Item value="menu">菜单</Select.Item>
							<Select.Item value="back">返回</Select.Item>
							<Select.Item value="none">无</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
			</TabsContent>

			<!-- 快捷键设置 -->
			<TabsContent value="keyboard" class="p-4">
				<div class="space-y-4">
					<!-- 快捷键分组显示（参考 NeeView） -->
					{#each [...new Set(keyBindings.map((k) => k.category))] as category}
						<div class="space-y-2">
							<h4 class="text-muted-foreground px-2 text-sm font-semibold">{category}</h4>
							<div class="space-y-1">
								{#each keyBindings.filter((k) => k.category === category) as binding, index}
									{@const globalIndex = keyBindings.indexOf(binding)}
									<div
										class="hover:bg-accent/50 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
									>
										<div class="flex-1">
											<div class="text-sm font-medium">{binding.description}</div>
											<div class="text-muted-foreground text-xs">{binding.action}</div>
										</div>
										<div class="flex items-center gap-2">
											{#if editingKeyIndex === globalIndex}
												<div class="relative">
													<Input
														value="等待按键..."
														onkeydown={(e) => handleKeyDown(e, globalIndex)}
														onfocus={(e) => {
															const target = e.target as HTMLInputElement;
															if (target) target.select();
														}}
														class="h-9 w-48 text-center font-mono"
														autofocus
													/>
													<Button
														variant="ghost"
														size="sm"
														onclick={cancelEditKey}
														class="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
													>
														×
													</Button>
												</div>
											{:else}
												<Button
													variant="outline"
													size="sm"
													onclick={() => startEditKey(globalIndex)}
													class="h-9 min-w-[120px] font-mono"
												>
													{binding.key || '未设置'}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onclick={() => {
														keyBindings[globalIndex].key = '';
													}}
													class="h-9 px-3"
													title="清除快捷键"
												>
													清除
												</Button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</TabsContent>

			<!-- 性能设置 -->
			<TabsContent value="performance" class="space-y-6 p-4">
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label>缓存大小 (MB)</Label>
						<span class="text-muted-foreground text-sm">{settings.performance.cacheSize}</span>
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
						<span class="text-muted-foreground text-sm">{settings.performance.preloadPages}</span>
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
						<span class="text-muted-foreground text-sm">{settings.performance.maxThreads}</span>
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

				<!-- 缩略图设置 -->
				<div class="border-t pt-6">
					<h3 class="mb-4 font-semibold">🖼️ 缩略图设置</h3>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label>本地文件并发数</Label>
							<span class="text-muted-foreground text-sm"
								>{settings.performance.thumbnail?.maxConcurrentLocal || 6}</span
							>
						</div>
						<input
							type="range"
							bind:value={settings.performance.thumbnail.maxConcurrentLocal}
							min={1}
							max={16}
							step={1}
							class="w-full"
						/>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label>压缩包并发数</Label>
							<span class="text-muted-foreground text-sm"
								>{settings.performance.thumbnail?.maxConcurrentArchive || 3}</span
							>
						</div>
						<input
							type="range"
							bind:value={settings.performance.thumbnail.maxConcurrentArchive}
							min={1}
							max={8}
							step={1}
							class="w-full"
						/>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label>视频处理并发数</Label>
							<span class="text-muted-foreground text-sm"
								>{settings.performance.thumbnail?.maxConcurrentVideo || 2}</span
							>
						</div>
						<input
							type="range"
							bind:value={settings.performance.thumbnail.maxConcurrentVideo}
							min={1}
							max={4}
							step={1}
							class="w-full"
						/>
					</div>
				</div>
			</TabsContent>

			<!-- 文件设置 -->
			<TabsContent value="files" class="space-y-6 p-4">
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
	<div class="flex items-center justify-between gap-2 border-t p-4">
		<div class="flex gap-2">
			<Button variant="outline" onclick={importSettings} class="gap-2">
				<Upload class="h-4 w-4" />
				导入设置
			</Button>
			<Button variant="outline" onclick={exportSettings} class="gap-2">
				<Download class="h-4 w-4" />
				导出设置
			</Button>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={resetSettings} class="gap-2">
				<RotateCcw class="h-4 w-4" />
				重置
			</Button>
			<Button onclick={saveSettings}>保存设置</Button>
		</div>
	</div>
</div>
