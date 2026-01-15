<script lang="ts">
	import {
		Database,
		Download,
		Upload,
		RefreshCcw,
		HardDrive,
		Cloud,
		Settings2,
		Search,
		MapPin,
		FileJson,
		Settings,
		ArrowUp,
		ArrowDown,
		ArrowUpDown
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Badge } from '$lib/components/ui/badge';
	import { settingsManager, type FullExportPayload } from '$lib/stores/settingsManager';
	import { getPerformanceSettings } from '$lib/api/performance';
	import StartupConfigPanel from './StartupConfigPanel.svelte';
	import GistSyncPanel from './GistSyncPanel.svelte';
	import BackupSettingsPanel from '$lib/components/settings/BackupSettingsPanel.svelte';
	import { type DataModuleId, type DataModuleRow, DEFAULT_DATA_MODULES } from './dataModules';
	import type { ComponentType } from 'svelte';
	import { cn } from '$lib/utils';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let activeTab = $state('modules');

	let rows = $state<DataModuleRow[]>([...DEFAULT_DATA_MODULES]);
	
	// Refactored unified selection state
	let selections = $state<Record<DataModuleId, boolean>>({} as Record<DataModuleId, boolean>);
	let nativeSelected = $state(true);
	
	let strategy: 'merge' | 'overwrite' = $state('merge');
	let isExporting = $state(false);
	let isImporting = $state(false);
	let lastMessage = $state('');
	let importFile: File | null = $state(null);
	let fileInputEl: HTMLInputElement | null = $state(null);
	let searchQuery = $state('');

	// Sorting state: Added 'selected' key
	let sortConfig = $state<{ key: 'name' | 'storage' | 'selected' | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });

	// Initialize selections
	function initSelections() {
		const sel: Record<DataModuleId, boolean> = {} as Record<DataModuleId, boolean>;
		for (const row of rows) {
			// Default to selected if it supports export/import by default
			sel[row.id] = row.defaultExport || row.defaultImport;
		}
		selections = sel;
		nativeSelected = true;
	}

	initSelections();

	function handleSort(key: 'name' | 'storage' | 'selected') {
		if (sortConfig.key === key) {
			if (sortConfig.dir === 'asc') {
				sortConfig.dir = 'desc';
			} else {
				sortConfig.key = null;
				sortConfig.dir = 'asc';
			}
		} else {
			sortConfig.key = key;
			// For selection, defaulting to desc (Checked first) often feels more natural? 
			// But let's stick to asc default, which usually means False -> True.
			sortConfig.dir = 'asc';
		}
	}

	// Selection Helpers (Defined early for usage in filteredRows)
	function isChecked(id: string, isNative: boolean) {
		return isNative ? nativeSelected : selections[id as DataModuleId];
	}

	function anySelected() {
		return Object.values(selections).some(Boolean) || nativeSelected;
	}

	function toggleSelection(id: string, isNative: boolean) {
		if (isNative) {
			nativeSelected = !nativeSelected;
		} else {
			selections[id as DataModuleId] = !selections[id as DataModuleId];
		}
	}

	// Derived state for filtering and grouping
	const filteredRows = $derived.by(() => {
		const allRows: (DataModuleRow & { isNative?: boolean })[] = [
			{
				id: 'nativeSettings',
				name: '原生设置',
				panel: '设置窗口',
				storage: 'localStorage: neoview-settings',
				description: '核心 NeoViewSettings（系统、查看器、性能等）。',
				defaultExport: true,
				defaultImport: true,
				isNative: true,
				icon: Settings2 as unknown as ComponentType
			},
			...rows
		];

		let result = allRows;

		// Filter
		const query = searchQuery.toLowerCase().trim();
		if (query) {
			result = result.filter((row) => {
				const target = `${row.name} ${row.panel} ${row.description}`.toLowerCase();
				return target.includes(query);
			});
		}

		// Sort
		if (sortConfig.key) {
			result = [...result].sort((a, b) => {
				if (sortConfig.key === 'selected') {
					const selA = isChecked(a.id, !!a.isNative);
					const selB = isChecked(b.id, !!b.isNative);
					if (selA === selB) return 0;
					// asc: Unchecked (false) -> Checked (true)
					// desc: Checked (true) -> Unchecked (false)
					const valA = selA ? 1 : 0;
					const valB = selB ? 1 : 0;
					return sortConfig.dir === 'asc' ? valA - valB : valB - valA;
				}

				const key = sortConfig.key!;
				const valA = (a[key as keyof typeof a] || '').toString();
				const valB = (b[key as keyof typeof b] || '').toString();
				return sortConfig.dir === 'asc' 
					? valA.localeCompare(valB, 'zh-CN') 
					: valB.localeCompare(valA, 'zh-CN');
			});
		}

		return result;
	});

	const groupedRows = $derived.by(() => {
		const groups: Record<string, typeof filteredRows> = {};
		for (const row of filteredRows) {
			if (!groups[row.panel]) {
				groups[row.panel] = [];
			}
			groups[row.panel].push(row);
		}
		return groups;
	});

	// Updated build flags based on unified selection
	function buildModuleFlags(): Parameters<typeof settingsManager['applyFullPayload']>[1]['modules'] {
		return {
			nativeSettings: nativeSelected,
			keybindings: selections.keybindings,
			emmConfig: selections.emmConfig,
			fileBrowserSort: selections.fileBrowserSort,
			uiState: selections.uiState,
			panelsLayout: selections.panelsLayout,
			bookmarks: selections.bookmarks,
			history: selections.history,
			historySettings: selections.historySettings,
			searchHistory: selections.searchHistory,
			upscaleSettings: selections.upscaleSettings,
			customThemes: selections.customThemes,
			performanceSettings: selections.performanceSettings,
			insightsCards: selections.insightsCards,
			folderPanelSettings: selections.folderPanelSettings,
			folderRatings: selections.folderRatings
		};
	}

	async function handleExportSelected() {
		if (!anySelected()) {
			lastMessage = '请至少勾选一个要导出的模块。';
			return;
		}
		isExporting = true;
		lastMessage = '';
		try {
			// Reuse nativeSelected for includeNativeSettings arg
			const payload = settingsManager.buildFullPayload({
				includeNativeSettings: nativeSelected,
				includeExtendedData: true
			});
			if (!payload) {
				lastMessage = '没有可导出的数据。';
				return;
			}
			const modules = buildModuleFlags();
			if (modules.performanceSettings && payload.extended) {
				try {
					const perf = await getPerformanceSettings();
					payload.extended.performanceSettings = perf;
				} catch (error) {
					console.error('导出性能设置失败:', error);
				}
			}
			
			// Clip payload based on unified selection
			if (!modules.nativeSettings) {
				delete payload.nativeSettings;
				payload.includeNativeSettings = false;
			}
			if (payload.appSettings) {
				if (!modules.keybindings) delete (payload.appSettings as any).keybindings;
				if (!modules.emmConfig) delete (payload.appSettings as any).emmMetadata;
				if (!modules.fileBrowserSort) delete (payload.appSettings as any).fileBrowser;
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
				if (!modules.insightsCards && payload.extended.insightsCards) {
					delete payload.extended.insightsCards;
				}
				if (!modules.folderPanelSettings && payload.extended.folderPanelSettings) {
					delete payload.extended.folderPanelSettings;
				}
				if (!modules.folderRatings && payload.extended.folderRatings) {
					delete payload.extended.folderRatings;
				}
			}

			const json = JSON.stringify(payload, null, 2);
			const blob = new Blob([json], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `neoview-data-${Date.now()}.json`;
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
			lastMessage = '请先选择 JSON 文件。';
			// Trigger file selection if not selected
			fileInputEl?.click();
			return;
		}
		if (!anySelected()) {
			lastMessage = '请至少勾选一个要导入的模块。';
			return;
		}
		isImporting = true;
		lastMessage = '';
		try {
			const text = await importFile.text();
			const payload = JSON.parse(text) as FullExportPayload;
			const modules = buildModuleFlags();
			
			// Reuse nativeSelected for importNativeSettings
			await settingsManager.applyFullPayload(payload, {
				importNativeSettings: nativeSelected,
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
		strategy = 'merge';
		lastMessage = '';
		searchQuery = '';
		sortConfig = { key: null, dir: 'asc' };
	}

	// Batch selection helpers
	function selectAll() {
		nativeSelected = true;
		Object.keys(selections).forEach(k => selections[k as DataModuleId] = true);
	}

	function selectNone() {
		nativeSelected = false;
		Object.keys(selections).forEach(k => selections[k as DataModuleId] = false);
	}
</script>

<div class="h-full flex flex-col p-1 gap-6 overflow-hidden">
	<div class="flex flex-col gap-1.5 px-1">
		<h3 class="flex items-center gap-2 text-xl font-bold tracking-tight">
			<Database class="h-5 w-5" />
			数据与备份
		</h3>
		<p class="text-muted-foreground text-sm">
			管理应用数据的导入导出、自动备份和云同步。
		</p>
	</div>

	<Tabs.Root bind:value={activeTab} class="flex-1 flex flex-col overflow-hidden">
		<Tabs.List class="grid w-full grid-cols-4 shrink-0 mb-4">
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

		<Tabs.Content value="modules" class="flex-1 flex flex-col min-h-0">
			<!-- Toolbar: Search & Main Actions -->
			<div class="flex flex-wrap items-center justify-between gap-4 px-1 pb-4 shrink-0">
				<!-- Left: Search -->
				<div class="relative w-full max-w-[240px]">
					<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
					<Input
						bind:value={searchQuery}
						placeholder="搜索模块..."
						class="h-9 rounded-xl pl-9 text-xs"
					/>
				</div>

				<!-- Right: Actions -->
				<div class="flex items-center gap-2">
					<!-- File Select for Import -->
					<div class="flex items-center gap-2 mr-2">
						<Tooltip.Provider>
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Button variant="outline" size="icon" class="h-9 w-9 rounded-xl" onclick={() => fileInputEl?.click()}>
										<FileJson class="h-4 w-4" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>选择导入文件: {importFile ? importFile.name : '未选择'}</Tooltip.Content>
							</Tooltip.Root>
						</Tooltip.Provider>
						<input
							bind:this={fileInputEl}
							type="file"
							class="hidden"
							accept="application/json"
							onchange={(e) => (importFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
						/>
					</div>

					<!-- Import Strategy -->
					<div class="flex bg-muted rounded-lg p-0.5 h-9 mr-2">
						<button 
							class={cn("px-3 text-[10px] rounded-md transition-all font-medium flex items-center gap-1", strategy === 'merge' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
							onclick={() => strategy = 'merge'}
							title="合并策略: 追加/更新已有数据"
						>
							合并
						</button>
						<button 
							class={cn("px-3 text-[10px] rounded-md transition-all font-medium flex items-center gap-1", strategy === 'overwrite' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
							onclick={() => strategy = 'overwrite'}
							title="覆盖策略: 清空原有数据后导入"
						>
							覆盖
						</button>
					</div>

					<div class="w-px h-6 bg-border mx-1"></div>

					<!-- Export Button -->
					<Tooltip.Provider>
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button 
									variant="default" 
									size="icon" 
									class="h-9 w-9 rounded-xl bg-blue-600 hover:bg-blue-700" 
									disabled={isExporting || !anySelected()}
									onclick={handleExportSelected}
								>
									<Download class="h-4 w-4" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>导出选中模块</Tooltip.Content>
						</Tooltip.Root>
					</Tooltip.Provider>

					<!-- Import Button -->
					<Tooltip.Provider>
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button 
									variant="default" 
									size="icon" 
									class="h-9 w-9 rounded-xl bg-green-600 hover:bg-green-700"
									disabled={isImporting || !anySelected()}
									onclick={handleImportSelected}
								>
									<Upload class="h-4 w-4" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>导入 ({importFile?.name ?? '需先选择文件'})</Tooltip.Content>
						</Tooltip.Root>
					</Tooltip.Provider>
					
					<div class="w-px h-6 bg-border mx-1"></div>

					<Button variant="ghost" size="icon" class="h-9 w-9 rounded-xl" onclick={resetSelections} title="重置">
						<RefreshCcw class="h-4 w-4" />
					</Button>
				</div>
			</div>

			<!-- List Content -->
			<div class="bg-card flex-1 overflow-y-auto rounded-2xl border shadow-sm">
				<div class="flex flex-col text-sm">
					<!-- Header Row -->
					<div class="flex items-center bg-muted/50 backdrop-blur-md sticky top-0 z-10 border-b px-2 py-2 text-xs font-medium text-muted-foreground select-none">
						<!-- Selection Column (Sortable) -->
						<div 
							class="w-10 flex justify-center items-center cursor-pointer hover:bg-muted/50 rounded transition-colors group relative"
							onclick={(e) => {
								// Prevent sorting when clicking specifically on the valid checkbox area?
								// Actually, the Checkbox component handles its own events. 
								// But to be safe, we check target.
								if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
								handleSort('selected');
							}}
							title="点击排序选中项"
							role="button"
							tabindex="0"
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSort('selected')}
						>
							{#if sortConfig.key === 'selected'}
								<div class="absolute -left-1 text-primary animate-in fade-in zoom-in spin-in-180 duration-300">
									{#if sortConfig.dir === 'asc'}
										<ArrowUp class="h-2.5 w-2.5" />
									{:else}
										<ArrowDown class="h-2.5 w-2.5" />
									{/if}
								</div>
							{/if}
							
							<Checkbox 
								checked={anySelected()} 
								indeterminate={anySelected() && Object.values(selections).some(v => !v)}
								onCheckedChange={(v) => v ? selectAll() : selectNone()}
							/>
						</div>

						<div 
							class="flex-1 px-2 flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors group"
							onclick={() => handleSort('name')}
							role="button"
							tabindex="0"
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSort('name')}
						>
							模块名称 / 说明
							{#if sortConfig.key === 'name'}
								<div class="transition-transform duration-200" class:rotate-180={sortConfig.dir === 'desc'}>
									<ArrowUp class="h-3 w-3" />
								</div>
							{:else}
								<ArrowUpDown class="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
							{/if}
						</div>
						<div 
							class="w-32 text-right pr-4 flex items-center justify-end gap-1 cursor-pointer hover:text-foreground transition-colors group"
							onclick={() => handleSort('storage')}
							role="button"
							tabindex="0"
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSort('storage')}
						>
							{#if sortConfig.key === 'storage'}
								<div class="transition-transform duration-200" class:rotate-180={sortConfig.dir === 'desc'}>
									<ArrowUp class="h-3 w-3" />
								</div>
							{:else}
								<ArrowUpDown class="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
							{/if}
							存储位置
						</div>
					</div>

					{#if Object.keys(groupedRows).length === 0}
						<div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
							<Database class="mb-4 h-12 w-12 opacity-10" />
							<p class="text-sm">未找到匹配的模块</p>
						</div>
					{:else}
						{#each Object.entries(groupedRows) as [panelName, groupRows]}
							<!-- Group Header -->
							<div class="bg-muted/20 px-4 py-1.5 border-b sticky top-[33px] z-0 backdrop-blur-sm">
								<div class="text-muted-foreground/60 flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase">
									<MapPin class="h-3 w-3" />
									{panelName}
								</div>
							</div>

							{#each groupRows as row (row.id)}
								<div 
									class={cn(
										"flex items-center py-2 px-2 border-b last:border-b-0 hover:bg-muted/40 transition-colors cursor-pointer group select-none",
										isChecked(row.id, !!row.isNative) && "bg-primary/5"
									)}
									onclick={() => toggleSelection(row.id, !!row.isNative)}
									role="button"
									tabindex="0"
									onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSelection(row.id, !!row.isNative)}
								>
									<!-- Checkbox -->
									<div class="w-10 flex justify-center shrink-0">
										<Checkbox 
											checked={isChecked(row.id, !!row.isNative)} 
											class="pointer-events-none"
										/>
									</div>

									<!-- Icon & Info -->
									<div class="flex-1 min-w-0 pr-4 flex items-center gap-3">
										<div class="bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm transition-all duration-300">
											{#if row.icon}
												{@const Icon = row.icon}
												<Icon class="h-4.5 w-4.5" />
											{:else}
												<Database class="h-4.5 w-4.5" />
											{/if}
										</div>
										<div class="flex flex-col min-w-0">
											<div class="flex items-baseline gap-2">
												<span class="font-medium truncate text-sm">{row.name}</span>
												<span class="text-[9px] text-muted-foreground font-mono opacity-50 uppercase">{row.id}</span>
											</div>
											<p class="text-[11px] text-muted-foreground truncate opacity-80" title={row.description}>
												{row.description}
											</p>
										</div>
									</div>

									<!-- Storage Info (Right Aligned) -->
									<div class="w-32 text-right pr-4 shrink-0">
										<Badge variant="outline" class="text-[9px] font-mono text-muted-foreground/60 max-w-full truncate inline-block">
											{row.storage.split(':')[0]}
										</Badge>
									</div>
								</div>
							{/each}
						{/each}
					{/if}
				</div>
			</div>

			{#if lastMessage}
				<div class="mt-2 px-1 text-xs text-center text-muted-foreground animate-pulse">
					{lastMessage}
				</div>
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
