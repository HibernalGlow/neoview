<script lang="ts">
	import { onMount } from 'svelte';
	import { Settings, FolderOpen, Palette, Power, Link } from '@lucide/svelte';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as FileSystemAPI from '$lib/api/filesystem';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { DEFAULT_THUMBNAIL_DIRECTORY } from '$lib/config/paths';

	let activeTab = $state('basic');

	let explorerContextMenuEnabled = $state(false);
	let explorerContextMenuLoading = $state(true);
	let explorerContextMenuError: string | null = $state(null);
	let explorerContextMenuInitialized = $state(false);
	let explorerContextMenuSyncing = $state(false);
	let currentSettings = $state(settingsManager.getSettings());

	onMount(async () => {
		try {
			const enabled = await FileSystemAPI.getExplorerContextMenuEnabled();
			explorerContextMenuEnabled = enabled;
		} catch (err) {
			console.error('读取资源管理器上下文菜单状态失败:', err);
			explorerContextMenuError = '读取状态失败';
		} finally {
			explorerContextMenuLoading = false;
		}
	});

	settingsManager.addListener((s) => {
		currentSettings = s;
	});

	$effect(() => {
		if (explorerContextMenuLoading || explorerContextMenuSyncing) return;
		if (!explorerContextMenuInitialized) {
			explorerContextMenuInitialized = true;
			return;
		}
		// 用户切换开关时，同步到后端
		void toggleExplorerContextMenu(explorerContextMenuEnabled);
	});

	async function toggleExplorerContextMenu(value: boolean) {
		const previous = explorerContextMenuEnabled;
		explorerContextMenuEnabled = value;
		explorerContextMenuError = null;
		explorerContextMenuSyncing = true;
		try {
			const result = await FileSystemAPI.setExplorerContextMenuEnabled(value);
			explorerContextMenuEnabled = result;
		} catch (err) {
			console.error('更新资源管理器上下文菜单失败:', err);
			explorerContextMenuEnabled = previous;
			explorerContextMenuError = '更新失败，请检查权限';
		} finally {
			explorerContextMenuSyncing = false;
		}
	}

	function getThumbnailDirectoryLabel() {
		const dir = currentSettings.system.thumbnailDirectory?.trim();
		return dir || DEFAULT_THUMBNAIL_DIRECTORY;
	}

	async function selectThumbnailDirectory() {
		try {
			const path = await FileSystemAPI.selectFolder();
			if (path) {
				settingsManager.updateNestedSettings('system', { thumbnailDirectory: path });
			}
		} catch (err) {
			console.error('选择缩略图目录失败:', err);
		}
	}

	function resetThumbnailDirectory() {
		settingsManager.updateNestedSettings('system', { thumbnailDirectory: '' });
	}

	async function downloadExplorerContextMenuReg() {
		try {
			const content = await FileSystemAPI.generateExplorerContextMenuReg();
			const blob = new Blob([content], { type: 'application/octet-stream' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'neoview_explorer_context_menu.reg';
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('导出注册表文件失败:', err);
			explorerContextMenuError = '导出 .reg 失败';
		}
	}
</script>

<div class="space-y-4 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Settings class="h-5 w-5" />
			通用设置
		</h3>
		<p class="text-muted-foreground text-sm">配置 NeoView 的基本行为和外观</p>
	</div>

	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="grid w-full grid-cols-3">
			<Tabs.Trigger value="basic" class="gap-1.5 text-xs">
				<Palette class="h-3.5 w-3.5" />
				基本
			</Tabs.Trigger>
			<Tabs.Trigger value="startup" class="gap-1.5 text-xs">
				<Power class="h-3.5 w-3.5" />
				启动
			</Tabs.Trigger>
			<Tabs.Trigger value="integration" class="gap-1.5 text-xs">
				<Link class="h-3.5 w-3.5" />
				集成
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="basic" class="mt-4 space-y-4">
		<!-- 语言设置 -->
		<div class="space-y-2">
			<Label class="text-sm font-semibold">语言</Label>
			<NativeSelect class="w-full max-w-xs" value="zh-CN">
				<NativeSelectOption value="zh-CN">简体中文</NativeSelectOption>
				<NativeSelectOption value="en-US">English</NativeSelectOption>
				<NativeSelectOption value="ja-JP">日本語</NativeSelectOption>
			</NativeSelect>
		</div>

		<!-- 主题设置 -->
		<div class="space-y-2">
			<Label class="text-sm font-semibold">主题</Label>
			<NativeSelect class="w-full max-w-xs" value="auto">
				<NativeSelectOption value="light">浅色</NativeSelectOption>
				<NativeSelectOption value="dark">深色</NativeSelectOption>
				<NativeSelectOption value="auto">跟随系统</NativeSelectOption>
			</NativeSelect>
		</div>
		</Tabs.Content>

		<Tabs.Content value="startup" class="mt-4 space-y-4">
		<!-- 启动设置 -->
		<div class="space-y-2">
			<Label class="text-sm font-semibold">启动行为</Label>
			<label class="flex items-center justify-between gap-2">
				<span class="text-sm">启动时打开上次的文件</span>
				<button
					type="button"
					class="cursor-pointer"
					onclick={() =>
						settingsManager.updateNestedSettings('startup', {
							openLastFile: !currentSettings.startup.openLastFile
						})}
				>
					<Checkbox
						checked={currentSettings.startup.openLastFile}
						aria-label="启动时打开上次的文件"
					/>
				</button>
			</label>
			<label class="flex items-center justify-between gap-2">
				<span class="text-sm">最小化到系统托盘</span>
				<button
					type="button"
					class="cursor-pointer"
					onclick={() =>
						settingsManager.updateNestedSettings('startup', {
							minimizeToTray: !currentSettings.startup.minimizeToTray
						})}
				>
					<Checkbox
						checked={currentSettings.startup.minimizeToTray}
						aria-label="最小化到系统托盘"
					/>
				</button>
			</label>
			<label class="flex items-center justify-between gap-2">
				<span class="text-sm">启动时恢复上次浏览的文件夹（书架位置）</span>
				<button
					type="button"
					class="cursor-pointer"
					onclick={() =>
						settingsManager.updateNestedSettings('startup', {
							openLastFolder: !currentSettings.startup.openLastFolder
						})}
				>
					<Checkbox
						checked={currentSettings.startup.openLastFolder}
						aria-label="启动时恢复上次浏览的文件夹（书架位置）"
					/>
				</button>
			</label>
		</div>
		</Tabs.Content>

		<Tabs.Content value="integration" class="mt-4 space-y-4">
		<!-- 资源管理器集成 -->
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<FolderOpen class="h-4 w-4 text-muted-foreground" />
				<Label class="text-sm font-semibold">资源管理器集成</Label>
			</div>
			<div class="space-y-1">
				<label class="flex items-center justify-between gap-2">
					<span class="text-sm">在资源管理器右键菜单中添加“在 NeoView 中打开”</span>
					<Switch
						bind:checked={explorerContextMenuEnabled}
						disabled={explorerContextMenuLoading}
					/>
				</label>
				<div class="flex items-center justify-between gap-2">
					<span class="text-xs text-muted-foreground">需要时可下载 .reg 手动导入注册表</span>
					<Button variant="outline" size="xs" onclick={downloadExplorerContextMenuReg}>
						导出 .reg
					</Button>
				</div>
				{#if explorerContextMenuError}
					<p class="text-xs text-destructive">{explorerContextMenuError}</p>
				{:else if explorerContextMenuLoading}
					<p class="text-xs text-muted-foreground">正在读取当前状态...</p>
				{:else}
					<p class="text-xs text-muted-foreground">
						该设置使用当前可执行文件路径在 HKCU\Software\Classes 中注册右键菜单，适用于便携版。
					</p>
				{/if}
			</div>
		</div>

		<!-- 缩略图目录 -->
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<FolderOpen class="h-4 w-4 text-muted-foreground" />
				<Label class="text-sm font-semibold">缩略图目录</Label>
			</div>
			<p class="text-xs text-muted-foreground">
				用于存储缩略图数据库和缓存文件。若未设置，将使用默认目录 {DEFAULT_THUMBNAIL_DIRECTORY}。
			</p>
			<div class="flex items-center gap-2">
				<div class="flex-1 truncate rounded-md border px-2 py-1 text-xs">
					{getThumbnailDirectoryLabel()}
				</div>
				<Button variant="outline" size="sm" class="gap-1" onclick={selectThumbnailDirectory}>
					<FolderOpen class="h-4 w-4" />
					选择文件夹
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-xs text-muted-foreground"
					onclick={resetThumbnailDirectory}
				>
					重置
				</Button>
			</div>
		</div>

		<!-- 文件关联 -->
		<div class="space-y-2">
			<Label class="text-sm font-semibold">文件关联</Label>
			<div class="space-y-1">
				<label class="flex items-center justify-between gap-2">
					<span class="text-sm">图像文件 (jpg, png, webp, avif, jxl)</span>
					<Checkbox checked aria-label="图像文件 (jpg, png, webp, avif, jxl)" />
				</label>
				<label class="flex items-center justify-between gap-2">
					<span class="text-sm">压缩包 (zip, cbz, rar, cbr)</span>
					<Checkbox checked aria-label="压缩包 (zip, cbz, rar, cbr)" />
				</label>
				<label class="flex items-center justify-between gap-2">
					<span class="text-sm">PDF 文件</span>
					<Checkbox aria-label="PDF 文件" />
				</label>
			</div>
		</div>
		</Tabs.Content>
	</Tabs.Root>
</div>
