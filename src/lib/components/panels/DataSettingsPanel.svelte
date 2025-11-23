<script lang="ts">
	import { Database, Download, Upload, ListFilter, RefreshCcw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { settingsManager, type FullExportPayload } from '$lib/stores/settingsManager.svelte';
	import Table from '$lib/components/ui/table/table.svelte';
	import TableHeader from '$lib/components/ui/table/table-header.svelte';
	import TableBody from '$lib/components/ui/table/table-body.svelte';
	import TableRow from '$lib/components/ui/table/table-row.svelte';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import TableCell from '$lib/components/ui/table/table-cell.svelte';
	import TableCaption from '$lib/components/ui/table/table-caption.svelte';

	type ModuleId =
		| 'nativeSettings'
		| 'keybindings'
		| 'emmConfig'
		| 'fileBrowserSort'
		| 'uiState'
		| 'panelsLayout'
		| 'bookmarks'
		| 'history'
		| 'historySettings'
		| 'searchHistory'
		| 'upscaleSettings'
		| 'customThemes';

	interface DataModuleRow {
		id: ModuleId;
		name: string;
		panel: string;
		storage: string;
		description: string;
		defaultExport: boolean;
		defaultImport: boolean;
	}

	const DEFAULT_ROWS: DataModuleRow[] = [
		{
			id: 'keybindings',
			name: '快捷键与操作绑定',
			panel: '操作绑定面板',
			storage: 'localStorage: neoview-keybindings',
			description: '所有键盘/鼠标/触摸/区域绑定',
			defaultExport: true,
			defaultImport: true
		},
		{
			id: 'emmConfig',
			name: 'EMM 配置',
			panel: 'EMM / 元数据面板',
			storage: 'localStorage: neoview-emm-*',
			description: 'EMM 数据库、翻译字典路径及标签显示模式',
			defaultExport: true,
			defaultImport: true
		},
		{
			id: 'fileBrowserSort',
			name: '文件浏览排序',
			panel: '文件浏览器',
			storage: 'fileBrowserStore + 本地配置',
			description: '文件列表的排序字段与顺序',
			defaultExport: true,
			defaultImport: true
		},
		{
			id: 'uiState',
			name: 'UI 状态',
			panel: '查看器 / UI',
			storage: 'localStorage: neoview-ui-*',
			description: '界面状态（工具栏、布局、小部件状态等）',
			defaultExport: true,
			defaultImport: true
		},
		{
			id: 'panelsLayout',
			name: '面板与边栏布局',
			panel: '边栏管理 / Layout',
			storage: 'localStorage: neoview-panels / neoview-sidebars / neoview-sidebar-management',
			description: '面板开关、位置与边栏布局',
			defaultExport: true,
			defaultImport: true
		},
		{
			id: 'bookmarks',
			name: '书签',
			panel: '书签面板',
			storage: 'localStorage: neoview-bookmarks',
			description: '收藏的书籍/文件/文件夹（包含创建时间）',
			defaultExport: true,
			defaultImport: true
		},
		{
			id: 'history',
			name: '历史记录',
			panel: '历史记录面板',
			storage: 'localStorage: neoview-history',
			description: '最近阅读记录（默认不导出）',
			defaultExport: false,
			defaultImport: false
		},
		{
			id: 'historySettings',
			name: '历史/书签同步设置',
			panel: '历史记录 / 书签面板',
			storage: 'localStorage: neoview-history-settings',
			description: '选中历史或书签时是否同步文件树',
			defaultExport: true,
			defaultImport: true
		},
		{
			id: 'searchHistory',
			name: '搜索历史',
			panel: '文件 / 书签 / 历史搜索',
			storage: 'localStorage: neoview-*-search-history',
			description: '各列表搜索历史（默认不导出）',
			defaultExport: false,
			defaultImport: false
		},
		{
			id: 'upscaleSettings',
			name: '超分面板设置',
			panel: 'UpscalePanel',
			storage: 'localStorage: pyo3_upscale_settings',
			description: '超分模型、并发、条件规则等',
			defaultExport: true,
			defaultImport: true
		},
		{
			id: 'customThemes',
			name: '自定义主题',
			panel: '外观 / 主题面板',
			storage: 'localStorage: custom-themes',
			description: '用户自定义的配色主题列表',
			defaultExport: true,
			defaultImport: true
		}
	];

	let rows = $state<DataModuleRow[]>([...DEFAULT_ROWS]);
	let exportSelection = $state<Record<ModuleId, boolean>>({} as Record<ModuleId, boolean>);
	let importSelection = $state<Record<ModuleId, boolean>>({} as Record<ModuleId, boolean>);
	let includeNativeSettings = $state(true);
	let importNativeSettings = $state(true);
	let strategy: 'merge' | 'overwrite' = $state('merge');
	let isExporting = $state(false);
	let isImporting = $state(false);
	let lastMessage = $state('');
	let importFile: File | null = $state(null);

	function initSelections() {
		const exp: Record<ModuleId, boolean> = {} as Record<ModuleId, boolean>;
		const imp: Record<ModuleId, boolean> = {} as Record<ModuleId, boolean>;
		for (const row of rows) {
			exp[row.id] = row.defaultExport;
			imp[row.id] = row.defaultImport;
		}
		exportSelection = exp;
		importSelection = imp;
	}

	initSelections();

	function anyExportSelected() {
		return Object.values(exportSelection).some(Boolean) || includeNativeSettings;
	}

	function anyImportSelected() {
		return Object.values(importSelection).some(Boolean) || importNativeSettings;
	}

	function buildModuleFlagsFromExport(): Parameters<typeof settingsManager['applyFullPayload']>[1]['modules'] {
		return {
			nativeSettings: includeNativeSettings,
			keybindings: exportSelection.keybindings,
			emmConfig: exportSelection.emmConfig,
			fileBrowserSort: exportSelection.fileBrowserSort,
			uiState: exportSelection.uiState,
			panelsLayout: exportSelection.panelsLayout,
			bookmarks: exportSelection.bookmarks,
			history: exportSelection.history,
			historySettings: exportSelection.historySettings,
			searchHistory: exportSelection.searchHistory,
			upscaleSettings: exportSelection.upscaleSettings,
			customThemes: exportSelection.customThemes
		};
	}

	function buildModuleFlagsFromImport(): Parameters<typeof settingsManager['applyFullPayload']>[1]['modules'] {
		return {
			nativeSettings: importNativeSettings,
			keybindings: importSelection.keybindings,
			emmConfig: importSelection.emmConfig,
			fileBrowserSort: importSelection.fileBrowserSort,
			uiState: importSelection.uiState,
			panelsLayout: importSelection.panelsLayout,
			bookmarks: importSelection.bookmarks,
			history: importSelection.history,
			historySettings: importSelection.historySettings,
			searchHistory: importSelection.searchHistory,
			upscaleSettings: importSelection.upscaleSettings,
			customThemes: importSelection.customThemes
		};
	}

	async function handleExportSelected() {
		if (!includeNativeSettings && !Object.values(exportSelection).some(Boolean)) {
			lastMessage = '请至少勾选一个要导出的模块。';
			return;
		}
		isExporting = true;
		lastMessage = '';
		try {
			const payload = settingsManager.buildFullPayload({
				includeNativeSettings,
				includeExtendedData: true
			});
			if (!payload) {
				lastMessage = '没有可导出的数据。';
				return;
			}
			const modules = buildModuleFlagsFromExport();
			// 根据导出选择裁剪 payload
			if (!modules.nativeSettings) {
				delete payload.nativeSettings;
				payload.includeNativeSettings = false;
			}
			if (payload.appSettings) {
				if (!modules.keybindings) {
					delete (payload.appSettings as any).keybindings;
				}
				if (!modules.emmConfig) {
					delete (payload.appSettings as any).emmMetadata;
				}
				if (!modules.fileBrowserSort) {
					delete (payload.appSettings as any).fileBrowser;
				}
			}
			if (payload.extended) {
				if (!modules.bookmarks) delete payload.extended.bookmarks;
				if (!modules.history) delete payload.extended.history;
				if (!modules.historySettings) delete payload.extended.historySettings;
				if (!modules.searchHistory) delete payload.extended.searchHistory;
				if (!modules.uiState) payload.extended.uiState = {};
				if (!modules.panelsLayout) payload.extended.panelsLayout = {};
				if (!modules.upscaleSettings) delete payload.extended.upscalePanelSettings;
				if (!modules.customThemes && payload.extended.themeStorage) {
					payload.extended.themeStorage.customThemes = undefined;
				}
			}
			const json = JSON.stringify(payload, null, 2);
			const blob = new Blob([json], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `neoview-data-selected-${Date.now()}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			lastMessage = '已导出选中的模块。';
		} catch (error) {
			console.error('导出数据失败:', error);
			lastMessage = '导出失败，请检查控制台日志。';
		} finally {
			isExporting = false;
		}
	}

	async function handleImportSelected() {
		if (!importFile) {
			lastMessage = '请选择要导入的 JSON 文件。';
			return;
		}
		if (!anyImportSelected()) {
			lastMessage = '请至少勾选一个要导入的模块。';
			return;
		}
		isImporting = true;
		lastMessage = '';
		try {
			const text = await importFile.text();
			const payload = JSON.parse(text) as FullExportPayload;
			const modules = buildModuleFlagsFromImport();
			await settingsManager.applyFullPayload(payload, {
				importNativeSettings,
				modules,
				strategy
			});
			lastMessage = '导入完成，部分设置可能需要重新打开窗口后生效。';
		} catch (error) {
			console.error('导入数据失败:', error);
			lastMessage = '导入失败，请检查文件内容与控制台日志。';
		} finally {
			isImporting = false;
		}
	}

	function resetSelections() {
		initSelections();
		includeNativeSettings = true;
		importNativeSettings = true;
		strategy = 'merge';
		lastMessage = '';
	}
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Database class="h-5 w-5" />
			数据与备份
		</h3>
		<p class="text-muted-foreground text-sm">
			以模块为单位导出 / 导入 NeoView 的配置数据。可以精确控制原生设置、书签、布局、自定义主题等。
		</p>
	</div>

	<div class="space-y-4">
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				<ListFilter class="h-4 w-4" />
				<span>勾选需要导出 / 导入的模块。历史记录和搜索历史默认不勾选。</span>
			</div>
			<Button variant="ghost" size="sm" class="gap-1" onclick={resetSelections}>
				<RefreshCcw class="h-3 w-3" />
				重置选择
			</Button>
		</div>

		<Table class="mt-2">
			<TableHeader>
				<TableRow>
					<TableHead class="w-[70px] text-xs">导出</TableHead>
					<TableHead class="w-[70px] text-xs">导入</TableHead>
					<TableHead class="w-[140px] text-xs">模块</TableHead>
					<TableHead class="w-[160px] text-xs">所属面板</TableHead>
					<TableHead class="w-[220px] text-xs">存储位置</TableHead>
					<TableHead class="text-xs">说明</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				<TableRow>
					<TableCell>
						<input
							type="checkbox"
							class="rounded"
							bind:checked={includeNativeSettings}
						/>
					</TableCell>
					<TableCell>
						<input
							type="checkbox"
							class="rounded"
							bind:checked={importNativeSettings}
						/>
					</TableCell>
					<TableCell class="text-xs font-medium">原生设置</TableCell>
					<TableCell class="text-xs text-muted-foreground">设置窗口</TableCell>
					<TableCell class="text-xs text-muted-foreground">localStorage: neoview-settings</TableCell>
					<TableCell class="text-xs text-muted-foreground">核心 NeoViewSettings（系统、查看器、性能等）。</TableCell>
				</TableRow>
				{#each rows as row}
					<TableRow>
						<TableCell>
							<input
								type="checkbox"
								class="rounded"
								bind:checked={exportSelection[row.id]}
							/>
						</TableCell>
						<TableCell>
							<input
								type="checkbox"
								class="rounded"
								bind:checked={importSelection[row.id]}
							/>
						</TableCell>
						<TableCell class="text-xs font-medium">{row.name}</TableCell>
						<TableCell class="text-xs text-muted-foreground">{row.panel}</TableCell>
						<TableCell class="text-xs text-muted-foreground">{row.storage}</TableCell>
						<TableCell class="text-xs text-muted-foreground">{row.description}</TableCell>
					</TableRow>
				{/each}
			</TableBody>
			<TableCaption class="text-[11px] text-muted-foreground">
				部分模块（如 EMM 配置、自定义主题）在导入后可能需要重新打开应用或设置窗口才会完全生效。
			</TableCaption>
		</Table>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="space-y-3">
			<Label class="text-sm font-semibold">导出</Label>
			<p class="text-xs text-muted-foreground">
				根据表格中的勾选项导出模块。原生设置和扩展模块会一起写入一个 JSON 文件中。
			</p>
			<Button
				class="gap-2"
				onclick={handleExportSelected}
				disabled={isExporting || !anyExportSelected()}
			>
				<Download class="h-4 w-4" />
				{isExporting ? '正在导出…' : '导出选中模块为 JSON'}
			</Button>
		</div>

		<div class="space-y-3">
			<Label class="text-sm font-semibold">导入</Label>
			<p class="text-xs text-muted-foreground">
				选择 JSON 文件并勾选要导入的模块，然后选择策略：
				<strong>合并</strong>（仅追加/覆盖已有记录）或 <strong>覆盖</strong>（先清空再导入）。
			</p>
			<div class="flex flex-col gap-2 text-xs text-muted-foreground">
				<input
					type="file"
					accept="application/json"
					on:change={(e) => (importFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
				/>
				<div class="flex items-center gap-4">
					<label class="flex items-center gap-1">
						<input
							type="radio"
							name="import-strategy"
							value="merge"
							bind:group={strategy}
						/>
						<span>合并</span>
					</label>
					<label class="flex items-center gap-1">
						<input
							type="radio"
							name="import-strategy"
							value="overwrite"
							bind:group={strategy}
						/>
						<span>覆盖</span>
					</label>
				</div>
				<Button
					variant="outline"
					class="mt-1 gap-2"
					onclick={handleImportSelected}
					disabled={isImporting || !importFile || !anyImportSelected()}
				>
					<Upload class="h-4 w-4" />
					{isImporting ? '正在导入…' : '导入选中模块'}
				</Button>
			</div>
		</div>
	</div>

	{#if lastMessage}
		<p class="mt-2 text-xs text-muted-foreground">{lastMessage}</p>
	{/if}
</div>
