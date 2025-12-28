<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Database, Download, Upload, ListFilter, RefreshCcw, HardDrive, Cloud, Settings2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import {
		DropdownMenu,
		DropdownMenuCheckboxItem,
		DropdownMenuContent,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import * as Table from '$lib/components/ui/table';
	import { FlexRender, createSvelteTable } from '$lib/components/ui/data-table';
	import type {
		ColumnDef,
		ColumnFiltersState,
		PaginationState,
		RowSelectionState,
		SortingState,
		VisibilityState
	} from '@tanstack/table-core';
	import {
		getCoreRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		getSortedRowModel
	} from '@tanstack/table-core';
	import { settingsManager, type FullExportPayload } from '$lib/stores/settingsManager';
	import { getPerformanceSettings } from '$lib/api/performance';
	import StartupConfigPanel from './StartupConfigPanel.svelte';
	import GistSyncPanel from './GistSyncPanel.svelte';
	import BackupSettingsPanel from '$lib/components/settings/BackupSettingsPanel.svelte';
	import { type DataModuleId, type DataModuleRow, DEFAULT_DATA_MODULES } from './dataModules';

	let activeTab = $state('modules');

	let rows = $state<DataModuleRow[]>([...DEFAULT_DATA_MODULES]);
	let exportSelection = $state<Record<DataModuleId, boolean>>({} as Record<DataModuleId, boolean>);
	let importSelection = $state<Record<DataModuleId, boolean>>({} as Record<DataModuleId, boolean>);
	let includeNativeSettings = $state(true);
	let importNativeSettings = $state(true);
	let strategy: 'merge' | 'overwrite' = $state('merge');
	let isExporting = $state(false);
	let isImporting = $state(false);
	let lastMessage = $state('');
	let importFile: File | null = $state(null);
	let fileInputEl: HTMLInputElement | null = $state(null);

	// DataTable state
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 10 });
	let sorting = $state<SortingState>([]);
	let columnFilters = $state<ColumnFiltersState>([]);
	let rowSelection = $state<RowSelectionState>({});
	let columnVisibility = $state<VisibilityState>({});

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

	const columns: ColumnDef<DataModuleRow & { isNative?: boolean }>[] = [
		{
			id: 'selectExport',
			header: '导出',
			enableHiding: false
		},
		{
			id: 'selectImport',
			header: '导入',
			enableHiding: false
		},
		{
			accessorKey: 'name',
			header: '模块',
			cell: ({ row }) => row.getValue('name') as string
		},
		{
			accessorKey: 'panel',
			header: '所属面板',
			cell: ({ row }) => row.getValue('panel') as string
		},
		{
			accessorKey: 'storage',
			header: '存储位置',
			cell: ({ row }) => row.getValue('storage') as string
		},
		{
			accessorKey: 'description',
			header: '说明',
			cell: ({ row }) => row.getValue('description') as string,
			// 组合过滤：在说明列上注册过滤函数，用于“模块/面板/说明”联查
			filterFn: (row, _columnId, value) => {
				const v = (value as string | undefined)?.toLowerCase() ?? '';
				if (!v) return true;
				const data = row.original;
				const target = `${data.name} ${data.panel} ${data.description}`.toLowerCase();
				return target.includes(v);
			}
		}
	];

	const table = createSvelteTable({
		get data() {
			const allRows: (DataModuleRow & { isNative?: boolean })[] = [
				{
					id: 'nativeSettings',
					name: '原生设置',
					panel: '设置窗口',
					storage: 'localStorage: neoview-settings',
					description: '核心 NeoViewSettings（系统、查看器、性能等）。',
					defaultExport: true,
					defaultImport: true,
					isNative: true
				},
				...rows
			];
			return allRows;
		},
		columns,
		state: {
			get pagination() {
				return pagination;
			},
			get sorting() {
				return sorting;
			},
			get columnVisibility() {
				return columnVisibility;
			},
			get rowSelection() {
				return rowSelection;
			},
			get columnFilters() {
				return columnFilters;
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onPaginationChange: (updater) => {
			if (typeof updater === 'function') {
				pagination = updater(pagination);
			} else {
				pagination = updater;
			}
		},
		onSortingChange: (updater) => {
			if (typeof updater === 'function') {
				sorting = updater(sorting);
			} else {
				sorting = updater;
			}
		},
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				columnFilters = updater(columnFilters);
			} else {
				columnFilters = updater;
			}
		},
		onColumnVisibilityChange: (updater) => {
			if (typeof updater === 'function') {
				columnVisibility = updater(columnVisibility);
			} else {
				columnVisibility = updater;
			}
		},
		onRowSelectionChange: (updater) => {
			if (typeof updater === 'function') {
				rowSelection = updater(rowSelection);
			} else {
				rowSelection = updater;
			}
		}
	});

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
			customThemes: exportSelection.customThemes,
			performanceSettings: exportSelection.performanceSettings
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
			customThemes: importSelection.customThemes,
			performanceSettings: importSelection.performanceSettings
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
			if (modules.performanceSettings && payload.extended) {
				try {
					const perf = await getPerformanceSettings();
					payload.extended.performanceSettings = perf;
				} catch (error) {
					console.error('导出性能设置失败:', error);
				}
			}
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

<div class="space-y-4 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Database class="h-5 w-5" />
			数据与备份
		</h3>
		<p class="text-muted-foreground text-sm">
			管理应用数据的导入导出、自动备份和云同步。
		</p>
	</div>

	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="grid w-full grid-cols-4">
			<Tabs.Trigger value="modules" class="gap-1.5 text-xs">
				<Database class="h-3.5 w-3.5" />
				数据模块
			</Tabs.Trigger>
			<Tabs.Trigger value="backup" class="gap-1.5 text-xs">
				<HardDrive class="h-3.5 w-3.5" />
				自动备份
			</Tabs.Trigger>
			<Tabs.Trigger value="cloud" class="gap-1.5 text-xs">
				<Cloud class="h-3.5 w-3.5" />
				云同步
			</Tabs.Trigger>
			<Tabs.Trigger value="startup" class="gap-1.5 text-xs">
				<Settings2 class="h-3.5 w-3.5" />
				启动配置
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="modules" class="mt-4">
	<div class="space-y-4">
		<div class="flex items-center gap-3 py-1">
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				<ListFilter class="h-4 w-4" />
				<span>勾选需要导出 / 导入的模块。历史记录和搜索历史默认不勾选。</span>
			</div>
			<Button variant="ghost" size="sm" class="ml-auto gap-1" onclick={resetSelections}>
				<RefreshCcw class="h-3 w-3" />
				重置选择
			</Button>
		</div>

		<div class="flex items-center gap-3 py-2">
			<Input
				placeholder="按模块 / 面板 / 说明过滤..."
				value={(table.getColumn('description')?.getFilterValue() as string) ?? ''}
				oninput={(e) => {
					const v = (e.currentTarget as HTMLInputElement).value;
					table.getColumn('description')?.setFilterValue(v);
				}}
				class="max-w-xs"
			/>
			<DropdownMenu>
				<DropdownMenuTrigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" class="ml-auto gap-1">
							列可见性
							<ChevronDownIcon class="ml-1 h-4 w-4" />
						</Button>
					{/snippet}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{#each table.getAllColumns().filter((col) => col.getCanHide()) as column (column.id)}
						<DropdownMenuCheckboxItem
							class="capitalize"
							checked={column.getIsVisible()}
							onCheckedChange={(v) => column.toggleVisibility(!!v)}
						>
							{column.id}
						</DropdownMenuCheckboxItem>
					{/each}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>

		<div class="mt-2 rounded-md border">
			<Table.Root>
				<Table.Header>
					{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
						<Table.Row>
							{#each headerGroup.headers as header (header.id)}
								<Table.Head class="text-xs [&:has([role=checkbox])]:ps-3">
									{#if !header.isPlaceholder}
										<FlexRender
											content={header.column.columnDef.header}
											context={header.getContext()}
										/>
									{/if}
								</Table.Head>
							{/each}
						</Table.Row>
					{/each}
				</Table.Header>
				<Table.Body>
					{#each table.getRowModel().rows as row (row.id)}
						<Table.Row>
							{#each row.getVisibleCells() as cell (cell.id)}
								<Table.Cell class="text-xs [&:has([role=checkbox])]:ps-3">
									{#if cell.column.id === 'selectExport'}
										<Checkbox
											role="checkbox"
											checked={row.original.id === 'nativeSettings'
												? includeNativeSettings
												: exportSelection[row.original.id as ModuleId]}
											on:click={() => {
												if (row.original.id === 'nativeSettings') {
													includeNativeSettings = !includeNativeSettings;
												} else {
													const id = row.original.id as ModuleId;
													exportSelection = {
														...exportSelection,
														[id]: !exportSelection[id]
													};
												}
											}}
											aria-label={`导出 ${row.original.name}`}
										/>
									{:else if cell.column.id === 'selectImport'}
										<Checkbox
											role="checkbox"
											checked={row.original.id === 'nativeSettings'
												? importNativeSettings
												: importSelection[row.original.id as ModuleId]}
											on:click={() => {
												if (row.original.id === 'nativeSettings') {
													importNativeSettings = !importNativeSettings;
												} else {
													const id = row.original.id as ModuleId;
													importSelection = {
														...importSelection,
														[id]: !importSelection[id]
													};
												}
											}}
											aria-label={`导入 ${row.original.name}`}
										/>
									{:else}
										<FlexRender
											content={cell.column.columnDef.cell}
											context={cell.getContext()}
										/>
									{/if}
								</Table.Cell>
							{/each}
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={table.getAllColumns().length} class="h-20 text-center text-xs">
								暂无结果。
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<div class="flex items-center justify-end space-x-2 pt-3 text-xs text-muted-foreground">
			<div class="flex-1">
				{Object.values(exportSelection).filter(Boolean).length + (includeNativeSettings ? 1 : 0)} / {rows.length + 1} 模块勾选导出
			</div>
			<div class="space-x-2">
				<Button
					variant="outline"
					size="sm"
					onclick={() => table.previousPage()}
					disabled={!table.getCanPreviousPage()}
				>
					上一页
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() => table.nextPage()}
					disabled={!table.getCanNextPage()}
				>
					下一页
				</Button>
			</div>
		</div>
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
				<div class="flex items-center gap-3">
					<Button
						variant="outline"
						size="sm"
						class="gap-1"
						onclick={() => fileInputEl?.click()}
					>
						选择文件
					</Button>
					<span class="truncate text-[11px] text-muted-foreground">
						{importFile ? importFile.name : '未选择文件'}
					</span>
				</div>
				<input
					bind:this={fileInputEl}
					type="file"
					class="hidden"
					accept="application/json"
					onchange={(e) => (importFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
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
</Tabs.Content>

		<Tabs.Content value="backup" class="mt-4">
			<BackupSettingsPanel />
		</Tabs.Content>

		<Tabs.Content value="cloud" class="mt-4">
			<GistSyncPanel />
		</Tabs.Content>

		<Tabs.Content value="startup" class="mt-4">
			<StartupConfigPanel />
		</Tabs.Content>
	</Tabs.Root>
</div>
