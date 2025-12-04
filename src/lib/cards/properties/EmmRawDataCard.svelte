<script lang="ts">
/**
 * EMM 原始数据卡片
 * 显示当前 book 在数据库中的记录表格
 */
import * as Table from '$lib/components/ui/table';
import * as Tooltip from '$lib/components/ui/tooltip';
import * as Input from '$lib/components/ui/input';
import { FlexRender, createSvelteTable } from '$lib/components/ui/data-table';
import type { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/table-core';
import { getCoreRowModel, getSortedRowModel, getFilteredRowModel } from '@tanstack/table-core';
import { FileSystemAPI } from '$lib/api';
import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';

type EMMRawRow = { key: string; value: string };
type EMMFieldType = 'string' | 'path' | 'url' | 'datetime' | 'timestamp' | 'number' | 'boolean';

// 字段元数据
const EMM_FIELD_META: Record<string, { label: string; type: EMMFieldType }> = {
	bundleSize: { label: '打包大小', type: 'number' },
	category: { label: '类别', type: 'string' },
	coverHash: { label: '封面哈希', type: 'string' },
	coverPath: { label: '封面路径', type: 'path' },
	createdAt: { label: '创建时间', type: 'datetime' },
	updatedAt: { label: '更新时间', type: 'datetime' },
	mtime: { label: '修改时间', type: 'datetime' },
	exist: { label: '存在', type: 'boolean' },
	filecount: { label: '文件数', type: 'number' },
	filepath: { label: '文件路径', type: 'path' },
	filesize: { label: '文件大小', type: 'number' },
	hash: { label: '哈希', type: 'string' },
	hiddenBook: { label: '隐藏书籍', type: 'boolean' },
	id: { label: 'ID', type: 'string' },
	mark: { label: '标记', type: 'number' },
	pageCount: { label: '页数', type: 'number' },
	posted: { label: '发布时间', type: 'timestamp' },
	readCount: { label: '阅读次数', type: 'number' },
	title: { label: '标题', type: 'string' },
	title_jpn: { label: '日文标题', type: 'string' },
	type: { label: '类型', type: 'string' },
	url: { label: '链接', type: 'url' },
	rating: { label: '评分', type: 'number' },
	status: { label: '状态', type: 'string' },
	date: { label: '日期', type: 'timestamp' }
};

let bookInfo = $state<ViewerBookInfo | null>(null);

$effect(() => {
	const unsubscribe = infoPanelStore.subscribe((state) => {
		bookInfo = state.bookInfo;
	});
	return unsubscribe;
});

// 从 bookInfo 中提取原始数据
const emmRawEntries = $derived.by(() => {
	const raw = bookInfo?.emmMetadata?.raw as Record<string, unknown> | undefined;
	if (!raw) return [] as EMMRawRow[];
	const entries: EMMRawRow[] = [];
	for (const [key, value] of Object.entries(raw)) {
		if (value === undefined || value === null) continue;
		entries.push({ key, value: String(value) });
	}
	entries.sort((a, b) => a.key.localeCompare(b.key));
	return entries;
});

// 辅助函数
function getFieldMeta(key: string): { label: string; type: EMMFieldType } {
	return EMM_FIELD_META[key] ?? { label: key, type: 'string' };
}

function formatFileSizeNumber(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return String(bytes);
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDateTime(value: string): string {
	const d = new Date(value);
	if (!Number.isFinite(d.getTime())) return value;
	return d.toLocaleString('zh-CN');
}

function formatTimestampSeconds(value: string): string {
	const n = Number(value);
	if (!Number.isFinite(n)) return value;
	const d = new Date(n * 1000);
	if (!Number.isFinite(d.getTime())) return value;
	return d.toLocaleString('zh-CN');
}

function formatNumberValue(key: string, value: string): string {
	const n = Number(value);
	if (!Number.isFinite(n)) return value;
	if (key === 'filesize' || key === 'bundleSize') return formatFileSizeNumber(n);
	if (key === 'rating') return n.toFixed(1);
	return value;
}

function formatBoolean(value: string): string {
	return value === '1' || value.toLowerCase() === 'true' ? '是' : '否';
}

async function openPath(path: string) {
	try {
		await FileSystemAPI.showInFileManager(path);
	} catch (err) {
		console.error('[EmmRawDataCard] 打开路径失败:', err);
	}
}

function openUrl(url: string) {
	window.open(url, '_blank');
}

// 表格列定义
const columns: ColumnDef<EMMRawRow>[] = [
	{
		accessorKey: 'key',
		header: '字段',
		cell: ({ row }) => row.getValue('key') as string,
		filterFn: (row, _columnId, value) => {
			const v = (value as string | undefined)?.toLowerCase() ?? '';
			if (!v) return true;
			const key = String(row.getValue('key') ?? '').toLowerCase();
			const val = String(row.getValue('value') ?? '').toLowerCase();
			return (key + ' ' + val).includes(v);
		}
	},
	{
		accessorKey: 'value',
		header: '值',
		cell: ({ row }) => row.getValue('value') as string
	}
];

let sorting = $state<SortingState>([]);
let columnFilters = $state<ColumnFiltersState>([]);

const table = createSvelteTable({
	get data() { return emmRawEntries; },
	columns,
	state: {
		get sorting() { return sorting; },
		get columnFilters() { return columnFilters; }
	},
	getCoreRowModel: getCoreRowModel(),
	getSortedRowModel: getSortedRowModel(),
	getFilteredRowModel: getFilteredRowModel(),
	onSortingChange: (updater) => {
		sorting = typeof updater === 'function' ? updater(sorting) : updater;
	},
	onColumnFiltersChange: (updater) => {
		columnFilters = typeof updater === 'function' ? updater(columnFilters) : updater;
	}
});
</script>

<div class="space-y-2">
	{#if emmRawEntries.length === 0}
		<p class="text-xs text-muted-foreground text-center py-4">暂无 EMM 数据库记录</p>
	{:else}
		<!-- 过滤输入 -->
		<div class="flex items-center gap-2">
			<Input.Root
				class="h-6 flex-1 px-2 text-[10px]"
				placeholder="过滤字段/值..."
				value={String(table.getColumn('key')?.getFilterValue() ?? '')}
				oninput={(e) => {
					const v = e.currentTarget.value;
					table.getColumn('key')?.setFilterValue(v);
				}}
			/>
			<span class="text-[10px] text-muted-foreground">{emmRawEntries.length} 条</span>
		</div>
		
		<!-- 数据表格 -->
		<div class="max-h-48 overflow-auto rounded-md border">
			<Table.Root class="text-xs">
				<Table.Header>
					{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
						<Table.Row>
							{#each headerGroup.headers as header (header.id)}
								<Table.Head class="px-2 py-1 text-[11px] text-muted-foreground first:text-left last:text-right">
									{#if !header.isPlaceholder}
										<button
											type="button"
											class="flex w-full items-center justify-between gap-1 hover:text-foreground"
											onclick={header.column.getToggleSortingHandler()}
										>
											<FlexRender
												content={header.column.columnDef.header}
												context={header.getContext()}
											/>
										</button>
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
								{#if cell.column.id === 'key'}
									{@const original = row.original}
									{@const meta = getFieldMeta(original.key)}
									<Table.Cell class="px-2 py-0.5 align-top text-muted-foreground max-w-[140px] truncate">
										<Tooltip.Root>
											<Tooltip.Trigger>
												<span class="inline-block w-full text-left truncate">{meta.label}</span>
											</Tooltip.Trigger>
											<Tooltip.Content>
												<p class="text-[10px]">{original.key}</p>
											</Tooltip.Content>
										</Tooltip.Root>
									</Table.Cell>
								{:else}
									{@const original = row.original}
									{@const meta = getFieldMeta(original.key)}
									<Table.Cell class="px-2 py-0.5 align-top text-right max-w-[200px] truncate">
										<Tooltip.Root>
											<Tooltip.Trigger>
												<span class="inline-block w-full truncate">
													{#if meta.type === 'url'}
														<button
															type="button"
															class="underline-offset-2 hover:underline text-xs text-primary w-full text-right"
															onclick={() => openUrl(original.value)}
														>
															{original.value}
														</button>
													{:else if meta.type === 'path'}
														<button
															type="button"
															class="underline-offset-2 hover:underline text-xs text-foreground/80 w-full text-right"
															onclick={() => openPath(original.value)}
														>
															{original.value}
														</button>
													{:else if meta.type === 'datetime'}
														{formatDateTime(original.value)}
													{:else if meta.type === 'timestamp'}
														{formatTimestampSeconds(original.value)}
													{:else if meta.type === 'number'}
														{formatNumberValue(original.key, original.value)}
													{:else if meta.type === 'boolean'}
														{formatBoolean(original.value)}
													{:else}
														{original.value}
													{/if}
												</span>
											</Tooltip.Trigger>
											<Tooltip.Content>
												<p class="max-w-xs break-all text-[10px]">{original.value}</p>
											</Tooltip.Content>
										</Tooltip.Root>
									</Table.Cell>
								{/if}
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</div>
