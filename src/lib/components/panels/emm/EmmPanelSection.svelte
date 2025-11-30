<script lang="ts">
	import { Tag, Settings, FolderOpen, Save, ChevronUp, ChevronDown, ArrowUp, ArrowDown, Star, RefreshCcw, Download, Trash2 } from '@lucide/svelte';
	import { folderRatingStore } from '$lib/stores/emm/folderRating';
	import * as Separator from '$lib/components/ui/separator';
	import * as Input from '$lib/components/ui/input';
	import * as Button from '$lib/components/ui/button';
	import * as Switch from '$lib/components/ui/switch';
	import * as Table from '$lib/components/ui/table';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { FlexRender, createSvelteTable } from '$lib/components/ui/data-table';
	import type { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/table-core';
	import { getCoreRowModel, getSortedRowModel, getFilteredRowModel } from '@tanstack/table-core';
	import { FileSystemAPI } from '$lib/api';
	import { onMount } from 'svelte';
	import { open } from '@tauri-apps/plugin-dialog';
	import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';
	import { emmMetadataStore, collectTagMap, emmTranslationStore } from '$lib/stores/emmMetadata.svelte';
	import type { EMMCollectTag } from '$lib/api/emm';
	import { bookSettingsStore, type PerBookSettings } from '$lib/stores/bookSettings.svelte';
	import EmmSyncCard from './EmmSyncCard.svelte';

	let bookInfo = $state<ViewerBookInfo | null>(null);
	let collectTags = $state<EMMCollectTag[]>([]);

	let showEMMConfig = $state(true);
	let emmDatabasePaths = $state<string[]>([]);
	let emmTranslationDbPath = $state<string>('');
	let emmSettingPath = $state<string>('');
	let emmTranslationDictPath = $state<string>('');
	let emmDatabasePathInput = $state<string>('');
	let enableEMM = $state(true);
	let fileListTagDisplayMode = $state<'all' | 'collect' | 'none'>('collect');

	// 标签视图状态（仅影响当前书的显示）
	let tagViewMode = $state<'flat' | 'grouped'>('grouped');
	let tagFilterMode = $state<'all' | 'collect'>('all');

	// 本书级别设置（收藏、评分、阅读方向等）
	let bookSettings = $state<PerBookSettings | null>(null);

	// 卡片折叠状态
	let showTagsCard = $state(true);
	let showRawCard = $state(true);
	let showBookSettingsCard = $state(true);
	let showFolderRatingsCard = $state(true);

	// 文件夹评分管理状态
	let folderRatingStats = $state<{ count: number; lastUpdated: string | null }>({ count: 0, lastUpdated: null });
	let isUpdatingRatings = $state(false);
	let folderRatingPath = $state('');

	// 订阅文件夹评分缓存
	$effect(() => {
		const unsubscribe = folderRatingStore.subscribe((cache) => {
			const count = Object.keys(cache.ratings).length;
			const lastUpdated = cache.lastUpdated ? new Date(cache.lastUpdated).toLocaleString() : null;
			folderRatingStats = { count, lastUpdated };
		});
		return unsubscribe;
	});

	// 更新文件夹评分
	async function handleUpdateFolderRatings() {
		isUpdatingRatings = true;
		try {
			await emmMetadataStore.calculateFolderRatings();
		} finally {
			isUpdatingRatings = false;
		}
	}

	// 导出文件夹评分为 JSON
	function handleExportFolderRatings() {
		const cache = folderRatingStore.exportCache();
		const json = JSON.stringify(cache, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = `neoview-folder-ratings-${Date.now()}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	// 重置文件夹评分缓存
	function handleClearFolderRatings() {
		if (confirm('确定要清除所有文件夹评分缓存吗？')) {
			folderRatingStore.clearCache();
		}
	}

	// 按路径补充评分
	function handleCalculateForPath() {
		if (folderRatingPath.trim()) {
			folderRatingStore.calculateRatingsForPath(folderRatingPath.trim());
		}
	}

	const TAG_VIEW_MODE_STORAGE_KEY = 'neoview-emm-panel-tag-view-mode';
	const TAG_FILTER_MODE_STORAGE_KEY = 'neoview-emm-panel-tag-filter-mode';

	const translationDict = $derived.by(() => {
		const dict = emmMetadataStore.getTranslationDict();
		return dict;
	});

	const allTags = $derived(() => {
		if (!bookInfo?.emmMetadata?.tags) {
			return [];
		}

		const tags: Array<{
			category: string;
			tag: string;
			isCollect: boolean;
			color?: string;
			display?: string;
		}> = [];
		const map = $collectTagMap;
		const normalize = (s: string) => s.trim().toLowerCase();

		for (const [category, tagList] of Object.entries(bookInfo.emmMetadata.tags)) {
			for (const tag of tagList) {
				const fullTagKey = normalize(`${category}:${tag}`);
				let collectTag = map.get(fullTagKey);

				if (!collectTag) {
					collectTag = map.get(normalize(tag));
				}

				const isCollect = !!collectTag;

				const translatedTag = emmTranslationStore.translateTag(tag, category, translationDict);
				const shortCategory = emmTranslationStore.getShortNamespace(category);
				const displayStr = `${shortCategory}:${translatedTag}`;

				tags.push({
					category,
					tag,
					isCollect,
					color: collectTag?.color,
					display: displayStr
				});
			}
		}

		return tags.sort((a, b) => {
			if (a.isCollect && !b.isCollect) return -1;
			if (!a.isCollect && b.isCollect) return 1;
			return 0;
		});
	});

	const displayTags = $derived(() => {
		const tags = allTags();
		if (tagFilterMode === 'collect') {
			return tags.filter((t) => t.isCollect);
		}
		return tags;
	});

	const groupedTags = $derived(() => {
		const tags = displayTags();
		const groups: Array<{
			category: string;
			shortCategory: string;
			items: any[];
		}> = [];

		const groupMap = new Map<string, { category: string; shortCategory: string; items: any[] }>();

		for (const tag of tags) {
			const key = tag.category;
			let group = groupMap.get(key);
			if (!group) {
				group = {
					category: key,
					shortCategory: emmTranslationStore.getShortNamespace(key),
					items: []
				};
				groupMap.set(key, group);
				groups.push(group);
			}
			group.items.push(tag);
		}

		return groups;
	});

	type EmmCardId = 'tags' | 'config' | 'raw' | 'bookSettings';
	const EMM_CARD_ORDER_STORAGE_KEY = 'neoview-emm-panel-card-order';

	let emmCardOrder = $state<EmmCardId[]>(['tags', 'config', 'raw', 'bookSettings']);

	const emmCardOrderIndex = $derived(() => {
		const map = new Map<EmmCardId, number>();
		for (let i = 0; i < emmCardOrder.length; i++) {
			map.set(emmCardOrder[i], i);
		}
		return map;
	});

	function getEmmCardOrder(id: EmmCardId): number {
		return emmCardOrderIndex().get(id) ?? 0;
	}

	function getVisibleEmmCards(): EmmCardId[] {
		const present: EmmCardId[] = [];
		if (allTags().length > 0) present.push('tags');
		present.push('config');
		if (emmRawEntries().length > 0) present.push('raw');
		if (bookSettings) present.push('bookSettings');
		return emmCardOrder.filter((id) => present.includes(id));
	}

	function canMoveEmmCard(id: EmmCardId, dir: 'up' | 'down'): boolean {
		const visible = getVisibleEmmCards();
		const idx = visible.indexOf(id);
		if (idx === -1) return false;
		if (dir === 'up') return idx > 0;
		return idx < visible.length - 1;
	}

	function moveEmmCard(id: EmmCardId, dir: 'up' | 'down') {
		const visible = getVisibleEmmCards();
		const idx = visible.indexOf(id);
		if (idx === -1) return;
		const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
		if (targetIdx < 0 || targetIdx >= visible.length) return;
		const otherId = visible[targetIdx];
		const next = [...emmCardOrder];
		const a = next.indexOf(id);
		const b = next.indexOf(otherId);
		if (a === -1 || b === -1) return;
		[next[a], next[b]] = [next[b], next[a]];
		emmCardOrder = next;
	}

	const emmRawEntries = $derived(() => {
		const raw = bookInfo?.emmMetadata?.raw as Record<string, unknown> | undefined;
		if (!raw) return [] as Array<{ key: string; value: string }>;
		const entries: Array<{ key: string; value: string }> = [];
		for (const [key, value] of Object.entries(raw)) {
			if (value === undefined || value === null) continue;
			entries.push({ key, value: String(value) });
		}
		// 固定顺序：按 key 排一下，避免每次渲染顺序抖动
		entries.sort((a, b) => a.key.localeCompare(b.key));
		return entries;
	});

	type EMMRawRow = { key: string; value: string };
	type EMMFieldType = 'string' | 'path' | 'url' | 'datetime' | 'timestamp' | 'number' | 'boolean';

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

	function getFieldMeta(key: string): { label: string; type: EMMFieldType } {
		const meta = EMM_FIELD_META[key];
		if (meta) return meta;
		return { label: key, type: 'string' };
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
		if (key === 'filesize' || key === 'bundleSize') {
			return formatFileSizeNumber(n);
		}
		if (key === 'rating') {
			return n.toFixed(1);
		}
		return value;
	}

	function formatBoolean(value: string): string {
		return value === '1' || value.toLowerCase() === 'true' ? '是' : '否';
	}

	async function openPath(path: string) {
		try {
			await FileSystemAPI.showInFileManager(path);
		} catch (err) {
			console.error('[EmmPanelSection] 打开路径失败:', err);
		}
	}

	function openUrl(url: string) {
		try {
			window.open(url, '_blank');
		} catch (err) {
			console.error('[EmmPanelSection] 打开链接失败:', err);
		}
	}

	const emmRawColumns: ColumnDef<EMMRawRow>[] = [
		{
			accessorKey: 'key',
			header: '字段',
			cell: ({ row }) => row.getValue('key') as string,
			// 简单过滤：在 key 列上注册 filterFn，同时对 key + value 做模糊匹配
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

	let emmRawSorting = $state<SortingState>([]);
	let emmRawFilters = $state<ColumnFiltersState>([]);

	const emmRawTable = createSvelteTable({
		get data() {
			return emmRawEntries();
		},
		columns: emmRawColumns,
		state: {
			get sorting() {
				return emmRawSorting;
			},
			get columnFilters() {
				return emmRawFilters;
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onSortingChange: (updater) => {
			if (typeof updater === 'function') {
				emmRawSorting = updater(emmRawSorting);
			} else {
				emmRawSorting = updater;
			}
		},
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				emmRawFilters = updater(emmRawFilters);
			} else {
				emmRawFilters = updater;
			}
		}
	});

	function getTagTitle(tagInfo: { category: string; tag: string; display?: string; isCollect: boolean }) {
		const raw = `${tagInfo.category}:${tagInfo.tag}`;
		const lines: string[] = [`原始: ${raw}`];
		if (tagInfo.display && tagInfo.display !== raw) {
			lines.push(`显示: ${tagInfo.display}`);
		}
		if (tagInfo.isCollect) {
			lines.push('状态: 收藏标签');
		}
		return lines.join('\n');
	}

	function updateBookSetting(partial: Partial<PerBookSettings>) {
		if (!bookInfo?.path) return;
		const current = bookSettings ?? {};
		const next = { ...current, ...partial };
		bookSettings = next;
		bookSettingsStore.updateFor(bookInfo.path, partial);
	}

	onMount(() => {
		const unsubscribe = infoPanelStore.subscribe((state) => {
			const nextBookInfo = state.bookInfo;
			bookInfo = nextBookInfo;
			if (nextBookInfo?.path) {
				const stored = bookSettingsStore.get(nextBookInfo.path);
				const base: PerBookSettings = {};
				const emmRating = nextBookInfo.emmMetadata?.rating;
				if (typeof emmRating === 'number' && !stored?.rating) {
					base.rating = emmRating;
				}
				bookSettings = { ...base, ...(stored ?? {}) };
			} else {
				bookSettings = null;
			}
		});
		return unsubscribe;
	});

	onMount(() => {
		emmMetadataStore
			.initialize()
			.then(() => {
				collectTags = emmMetadataStore.getCollectTags();
			})
			.catch((err) => {
				console.error('[EmmPanelSection] 初始化 EMM Store 失败:', err);
			});
	});

	onMount(() => {
		if (typeof localStorage === 'undefined') return;
		try {
			const storedView = localStorage.getItem(TAG_VIEW_MODE_STORAGE_KEY) as 'flat' | 'grouped' | null;
			if (storedView === 'flat' || storedView === 'grouped') {
				tagViewMode = storedView;
			}
			const storedFilter = localStorage.getItem(TAG_FILTER_MODE_STORAGE_KEY) as 'all' | 'collect' | null;
			if (storedFilter === 'all' || storedFilter === 'collect') {
				tagFilterMode = storedFilter;
			}
		} catch (err) {
			console.error('[EmmPanelSection] 读取标签视图偏好失败:', err);
		}
	});

	$effect(() => {
		const mode = tagViewMode;
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(TAG_VIEW_MODE_STORAGE_KEY, mode);
		} catch (err) {
			console.error('[EmmPanelSection] 保存标签视图模式失败:', err);
		}
	});

	$effect(() => {
		const filter = tagFilterMode;
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(TAG_FILTER_MODE_STORAGE_KEY, filter);
		} catch (err) {
			console.error('[EmmPanelSection] 保存标签过滤模式失败:', err);
		}
	});

	onMount(() => {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(EMM_CARD_ORDER_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as unknown;
				if (Array.isArray(parsed)) {
					const valid: EmmCardId[] = [];
					for (const id of parsed) {
						if (id === 'tags' || id === 'config' || id === 'raw' || id === 'bookSettings') {
							if (!valid.includes(id)) valid.push(id);
						}
					}
					const defaults: EmmCardId[] = ['tags', 'config', 'raw', 'bookSettings'];
					for (const id of defaults) {
						if (!valid.includes(id)) valid.push(id);
					}
					if (valid.length) {
						emmCardOrder = valid;
					}
				}
			}
		} catch (err) {
			console.error('[EmmPanelSection] 读取卡片顺序失败:', err);
		}
	});

	$effect(() => {
		const order = emmCardOrder;
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(EMM_CARD_ORDER_STORAGE_KEY, JSON.stringify(order));
		} catch (err) {
			console.error('[EmmPanelSection] 保存卡片顺序失败:', err);
		}
	});

	function loadEMMConfig() {
		// 【修复】加载手动配置的路径，而不是合并后的路径
		// 这样保存时不会把自动检测的路径错误地保存为手动路径
		emmDatabasePaths = emmMetadataStore.getManualDatabasePaths();
		emmTranslationDbPath = emmMetadataStore.getManualTranslationDbPath() || '';
		emmSettingPath = emmMetadataStore.getManualSettingPath() || '';
		emmTranslationDictPath = emmMetadataStore.getManualTranslationDictPath() || '';

		const unsubscribe = emmMetadataStore.subscribe((state) => {
			enableEMM = state.enableEMM;
			fileListTagDisplayMode = state.fileListTagDisplayMode;
		});
		unsubscribe();
	}

	async function selectDatabaseFile() {
		try {
			const selected = await open({
				multiple: true,
				filters: [
					{
						name: 'SQLite Database',
						extensions: ['sqlite', 'db']
					}
				]
			});

			if (selected) {
				if (Array.isArray(selected)) {
					const paths = selected
						.map((f) => {
							if (typeof f === 'string') return f;
							if (f && typeof f === 'object' && 'path' in f) return (f as { path: string }).path;
							return '';
						})
						.filter((p) => p);
					emmDatabasePaths = [...emmDatabasePaths, ...paths];
				} else {
					const path =
						typeof selected === 'string'
							? selected
							: selected && typeof selected === 'object' && 'path' in selected
									? (selected as { path: string }).path
									: '';
					if (path) {
						emmDatabasePaths = [...emmDatabasePaths, path];
					}
				}
			}
		} catch (err) {
			console.error('选择数据库文件失败:', err);
		}
	}

	async function selectTranslationDbFile() {
		try {
			const selected = await open({
				filters: [
					{
						name: 'SQLite Database',
						extensions: ['sqlite', 'db']
					}
				]
			});

			if (selected) {
				let path = '';
				if (typeof selected === 'string') {
					path = selected;
				} else if (Array.isArray(selected)) {
					const arr = selected as unknown[];
					if (arr.length > 0) {
						const first = arr[0];
						path =
							typeof first === 'string'
								? first
								: first && typeof first === 'object' && 'path' in first
										? (first as { path: string }).path
										: '';
					}
				} else if (selected && typeof selected === 'object' && 'path' in selected) {
					path = (selected as { path: string }).path;
				}

				if (path) {
					emmTranslationDbPath = path;
				}
			}
		} catch (err) {
			console.error('选择翻译数据库文件失败:', err);
		}
	}

	async function selectSettingFile() {
		try {
			const selected = await open({
				filters: [
					{
						name: 'JSON File',
						extensions: ['json']
					}
				]
			});

			if (selected) {
				let path = '';
				if (typeof selected === 'string') {
					path = selected;
				} else if (Array.isArray(selected)) {
					const arr = selected as unknown[];
					if (arr.length > 0) {
						const first = arr[0];
						path =
							typeof first === 'string'
								? first
								: first && typeof first === 'object' && 'path' in first
										? (first as { path: string }).path
										: '';
					}
				} else if (selected && typeof selected === 'object' && 'path' in selected) {
					path = (selected as { path: string }).path;
				}

				if (path) {
					emmSettingPath = path;
				}
			}
		} catch (err) {
			console.error('选择设置文件失败:', err);
		}
	}

	async function selectTranslationDictFile() {
		try {
			const selected = await open({
				filters: [
					{
						name: 'JSON File',
						extensions: ['json']
					}
				]
			});

			if (selected) {
				let path = '';
				if (typeof selected === 'string') {
					path = selected;
				} else if (Array.isArray(selected)) {
					const arr = selected as unknown[];
					if (arr.length > 0) {
						const first = arr[0];
						path =
							typeof first === 'string'
								? first
								: first && typeof first === 'object' && 'path' in first
										? (first as { path: string }).path
										: '';
					}
				} else if (selected && typeof selected === 'object' && 'path' in selected) {
					path = (selected as { path: string }).path;
				}

				if (path) {
					emmTranslationDictPath = path;
				}
			}
		} catch (err) {
			console.error('选择翻译字典文件失败:', err);
		}
	}

	function addDatabasePath() {
		if (emmDatabasePathInput.trim()) {
			emmDatabasePaths = [...emmDatabasePaths, emmDatabasePathInput.trim()];
			emmDatabasePathInput = '';
		}
	}

	function removeDatabasePath(index: number) {
		emmDatabasePaths = emmDatabasePaths.filter((_, i) => i !== index);
	}

	async function saveEMMConfig() {
		emmMetadataStore.setManualDatabasePaths(emmDatabasePaths);
		if (emmTranslationDbPath) {
			emmMetadataStore.setManualTranslationDbPath(emmTranslationDbPath);
		}
		if (emmSettingPath) {
			await emmMetadataStore.setManualSettingPath(emmSettingPath);
		}
		if (emmTranslationDictPath) {
			await emmMetadataStore.setManualTranslationDictPath(emmTranslationDictPath);
		}

		emmMetadataStore.setEnableEMM(enableEMM);
		emmMetadataStore.setFileListTagDisplayMode(fileListTagDisplayMode);

		showEMMConfig = false;
		if (bookInfo?.path && enableEMM) {
			const metadata = await emmMetadataStore.loadMetadataByPath(bookInfo.path);
			if (metadata) {
				infoPanelStore.setBookInfo({
					...bookInfo,
					emmMetadata: {
						translatedTitle: metadata.translated_title,
						tags: metadata.tags
					}
				});
			}
		}
	}

	$effect(() => {
		if (showEMMConfig) {
			loadEMMConfig();
		}
	});
</script>

{#if bookInfo}
	<div class="flex flex-col gap-3">
		{#if allTags().length > 0}
			<div class="rounded-lg border bg-muted/10 p-3 space-y-3" style={`order: ${getEmmCardOrder('tags')}`}>
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<Tag class="h-4 w-4" />
						<span>标签</span>
						<span class="text-[10px] text-muted-foreground font-normal ml-2 opacity-50">
							(已加载收藏: {collectTags.length})
						</span>
						<div class="flex items-center gap-1 ml-auto text-[10px] font-normal">
							<span class="text-muted-foreground">视图</span>
							<Button.Root
								variant={tagViewMode === 'flat' ? 'default' : 'outline'}
								size="sm"
								class="h-6 px-2 text-[10px]"
								onclick={() => (tagViewMode = 'flat')}
							>
								扁平
							</Button.Root>
							<Button.Root
								variant={tagViewMode === 'grouped' ? 'default' : 'outline'}
								size="sm"
								class="h-6 px-2 text-[10px]"
								onclick={() => (tagViewMode = 'grouped')}
							>
								分组
							</Button.Root>
							<span class="mx-1 text-border">|</span>
							<Button.Root
								variant={tagFilterMode === 'all' ? 'default' : 'outline'}
								size="sm"
								class="h-6 px-2 text-[10px]"
								onclick={() => (tagFilterMode = 'all')}
							>
								全部
							</Button.Root>
							<Button.Root
								variant={tagFilterMode === 'collect' ? 'default' : 'outline'}
								size="sm"
								class="h-6 px-2 text-[10px]"
								onclick={() => (tagFilterMode = 'collect')}
							>
								收藏
							</Button.Root>
						</div>
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5 ml-1"
							title="重新加载收藏标签"
							onclick={() => {
								console.debug('[EmmPanelSection] 手动刷新收藏标签');
								emmMetadataStore.initialize(true).then(() => {
									collectTags = emmMetadataStore.getCollectTags();
								});
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
								<path d="M3 3v5h5" />
							</svg>
						</Button.Root>
					</div>
					<div class="flex items-center gap-1 text-[10px]">
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5"
							onclick={() => (showTagsCard = !showTagsCard)}
							title={showTagsCard ? '收起' : '展开'}
						>
							{#if showTagsCard}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</Button.Root>
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5"
							onclick={() => moveEmmCard('tags', 'up')}
							disabled={!canMoveEmmCard('tags', 'up')}
							title="上移"
						>
							<ArrowUp class="h-3 w-3" />
						</Button.Root>
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5"
							onclick={() => moveEmmCard('tags', 'down')}
							disabled={!canMoveEmmCard('tags', 'down')}
							title="下移"
						>
							<ArrowDown class="h-3 w-3" />
						</Button.Root>
					</div>
				</div>

				{#if showTagsCard}
					{#if tagViewMode === 'flat'}
						<div class="flex flex-wrap gap-1.5">
							{#each displayTags() as tagInfo}
								<span
									class="inline-flex items-center rounded px-2 py-1 text-xs border {tagInfo.isCollect
										? 'font-semibold'
										: 'bg-muted border-border/60 text-muted-foreground'}"
									style={tagInfo.isCollect
										? `background-color: ${(tagInfo.color || '#409EFF')}20; border-color: ${(tagInfo.color || '#409EFF')}40; color: ${tagInfo.color || '#409EFF'};`
										: ''}
									title={getTagTitle(tagInfo)}
								>
									{tagInfo.display}
								</span>
							{/each}
						</div>
					{:else}
						<div class="space-y-2">
							{#each groupedTags() as group}
								<div class="space-y-1">
									<div class="text-[10px] text-muted-foreground">
										{group.shortCategory}:{group.category} ({group.items.length})
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each group.items as tagInfo}
											<span
												class="inline-flex items-center rounded px-2 py-1 text-xs border {tagInfo.isCollect
													? 'font-semibold'
													: 'bg-muted border-border/60 text-muted-foreground'}"
												style={tagInfo.isCollect
													? `background-color: ${(tagInfo.color || '#409EFF')}20; border-color: ${(tagInfo.color || '#409EFF')}40; color: ${tagInfo.color || '#409EFF'};`
													: ''}
												title={getTagTitle(tagInfo)}
											>
												{tagInfo.display}
											</span>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<div class="rounded-lg border bg-muted/10 p-3 space-y-3" style={`order: ${getEmmCardOrder('config')}`}>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 font-semibold text-sm">
					<Settings class="h-4 w-4" />
					<span>EMM 元数据配置</span>
				</div>
				<div class="flex items-center gap-2">
					<Button.Root
						variant="ghost"
						size="icon"
						class="h-5 w-5"
						onclick={() => (showEMMConfig = !showEMMConfig)}
						title={showEMMConfig ? '收起' : '展开'}
					>
						{#if showEMMConfig}
							<ChevronUp class="h-3 w-3" />
						{:else}
							<ChevronDown class="h-3 w-3" />
						{/if}
					</Button.Root>
					<div class="flex items-center gap-1 text-[10px]">
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5"
							onclick={() => moveEmmCard('config', 'up')}
							disabled={!canMoveEmmCard('config', 'up')}
							title="上移"
						>
							<ArrowUp class="h-3 w-3" />
						</Button.Root>
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5"
							onclick={() => moveEmmCard('config', 'down')}
							disabled={!canMoveEmmCard('config', 'down')}
							title="下移"
						>
							<ArrowDown class="h-3 w-3" />
						</Button.Root>
					</div>
				</div>
			</div>

			{#if showEMMConfig}
				<div class="space-y-3 text-sm">
					<!-- 主数据库路径 -->
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-xs text-muted-foreground">主数据库路径</span>
							<Button.Root
								variant="outline"
								size="sm"
								class="h-7 px-2 text-[11px] flex items-center gap-1"
								onclick={selectDatabaseFile}
							>
								<FolderOpen class="h-3 w-3" />
								<span>浏览</span>
							</Button.Root>
						</div>
						<div class="flex items-center gap-2">
							<Input.Root
									class="h-8 flex-1 text-xs"
									placeholder="手动添加数据库路径"
									value={emmDatabasePathInput}
									oninput={(e) => {
										const target = e.currentTarget as HTMLInputElement;
										emmDatabasePathInput = target.value;
									}}
								/>
							<Button.Root
								variant="outline"
								size="sm"
								class="h-8 px-2 text-[11px]"
								onclick={addDatabasePath}
							>
								添加
							</Button.Root>
						</div>
						{#if emmDatabasePaths.length > 0}
							<ul class="space-y-1 max-h-32 overflow-auto text-xs mt-1">
								{#each emmDatabasePaths as path, index}
									<li class="flex items-center justify-between gap-2">
										<span class="truncate" title={path}>{path}</span>
										<Button.Root
											variant="ghost"
											size="icon"
											class="h-6 w-6 text-[11px]"
											onclick={() => removeDatabasePath(index)}
										>
											×
										</Button.Root>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-xs text-muted-foreground mt-1">
								未手动配置数据库路径时，将尝试自动检测。
							</p>
						{/if}
					</div>

					<Separator.Root />

					<!-- 翻译数据库路径 -->
					<div class="space-y-1">
						<div class="flex items-center justify-between">
							<span class="text-xs text-muted-foreground">翻译数据库路径</span>
							<Button.Root
								variant="outline"
								size="sm"
								class="h-7 px-2 text-[11px] flex items-center gap-1"
								onclick={selectTranslationDbFile}
							>
								<FolderOpen class="h-3 w-3" />
								<span>浏览</span>
							</Button.Root>
						</div>
						<Input.Root
								class="h-8 text-xs"
								placeholder="留空则自动查找 translations.db"
								value={emmTranslationDbPath}
								oninput={(e) => {
									const target = e.currentTarget as HTMLInputElement;
									emmTranslationDbPath = target.value;
								}}
						/>
					</div>

					<!-- 设置文件路径 -->
					<div class="space-y-1">
						<div class="flex items-center justify-between">
							<span class="text-xs text-muted-foreground">设置文件路径 (setting.json)</span>
							<Button.Root
								variant="outline"
								size="sm"
								class="h-7 px-2 text-[11px] flex items-center gap-1"
								onclick={selectSettingFile}
							>
								<FolderOpen class="h-3 w-3" />
								<span>浏览</span>
							</Button.Root>
						</div>
						<Input.Root
								class="h-8 text-xs"
								placeholder="用于加载收藏标签等设置"
								value={emmSettingPath}
								oninput={(e) => {
									const target = e.currentTarget as HTMLInputElement;
									emmSettingPath = target.value;
								}}
						/>
					</div>

					<!-- 翻译字典路径 -->
					<div class="space-y-1">
						<div class="flex items-center justify-between">
							<span class="text-xs text-muted-foreground">翻译字典路径 (db.text.json)</span>
							<Button.Root
								variant="outline"
								size="sm"
								class="h-7 px-2 text-[11px] flex items-center gap-1"
								onclick={selectTranslationDictFile}
							>
								<FolderOpen class="h-3 w-3" />
								<span>浏览</span>
							</Button.Root>
						</div>
						<Input.Root
								class="h-8 text-xs"
								placeholder="留空则自动查找 db.text.json"
								value={emmTranslationDictPath}
								oninput={(e) => {
									const target = e.currentTarget as HTMLInputElement;
									emmTranslationDictPath = target.value;
								}}
						/>
					</div>

					<Separator.Root />

					<!-- 行为设置 -->
					<div class="space-y-2 text-xs">
						<div class="flex items-center justify-between">
							<span>启用 EMM</span>
							<Switch.Root
									checked={enableEMM}
									onCheckedChange={(v) => (enableEMM = v)}
									class="scale-75"
								/>
						</div>
						<div class="space-y-1">
							<div class="flex items-center justify-between">
								<span>文件列表标签显示</span>
								<div class="flex gap-1">
									<Button.Root
											variant={fileListTagDisplayMode === 'all' ? 'default' : 'outline'}
											size="sm"
											class="h-7 px-2 text-[10px]"
											onclick={() => (fileListTagDisplayMode = 'all')}
										>
											全部
										</Button.Root>
										<Button.Root
											variant={fileListTagDisplayMode === 'collect' ? 'default' : 'outline'}
											size="sm"
											class="h-7 px-2 text-[10px]"
											onclick={() => (fileListTagDisplayMode = 'collect')}
										>
											收藏
										</Button.Root>
										<Button.Root
											variant={fileListTagDisplayMode === 'none' ? 'default' : 'outline'}
											size="sm"
											class="h-7 px-2 text-[10px]"
											onclick={() => (fileListTagDisplayMode = 'none')}
										>
											隐藏
										</Button.Root>
									</div>
							</div>
							<p class="text-[11px] text-muted-foreground">
								仅影响文件列表中的标签显示，不影响当前属性面板的标签视图。
							</p>
						</div>
					</div>

					<div class="flex justify-end pt-1">
						<Button.Root
							variant="default"
							size="sm"
							class="h-7 px-3 text-xs flex items-center gap-1"
							onclick={saveEMMConfig}
						>
							<Save class="h-3 w-3" />
							<span>保存配置</span>
						</Button.Root>
					</div>

					<Separator.Root class="my-3" />

					<!-- EMM 数据同步卡片 -->
					<EmmSyncCard />
				</div>
			{/if}
		</div>

		{#if emmRawEntries().length > 0}
			<div class="rounded-lg border bg-muted/10 p-3 space-y-2" style={`order: ${getEmmCardOrder('raw')}`}>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<Settings class="h-4 w-4" />
						<span>EMM 原始记录（mangas）</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-[10px] text-muted-foreground">只读 · 调试用</span>
						<Input.Root
								class="h-6 w-40 px-2 text-[10px]"
								placeholder="过滤字段/值..."
								value={(emmRawTable.getColumn('key')?.getFilterValue() as string) ?? ''}
								oninput={(e) => {
									const v = (e.currentTarget as HTMLInputElement).value;
									emmRawTable.getColumn('key')?.setFilterValue(v);
								}}
							/>
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5"
							onclick={() => (showRawCard = !showRawCard)}
							title={showRawCard ? '收起' : '展开'}
						>
							{#if showRawCard}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</Button.Root>
						<div class="flex items-center gap-1 text-[10px]">
							<Button.Root
								variant="ghost"
								size="icon"
								class="h-5 w-5"
								onclick={() => moveEmmCard('raw', 'up')}
								disabled={!canMoveEmmCard('raw', 'up')}
								title="上移"
							>
								<ArrowUp class="h-3 w-3" />
							</Button.Root>
							<Button.Root
								variant="ghost"
								size="icon"
								class="h-5 w-5"
								onclick={() => moveEmmCard('raw', 'down')}
								disabled={!canMoveEmmCard('raw', 'down')}
								title="下移"
							>
								<ArrowDown class="h-3 w-3" />
							</Button.Root>
						</div>
					</div>
				</div>
				{#if showRawCard}
					<div class="max-h-40 overflow-auto rounded-md border">
					<Table.Root class="text-xs">
						<Table.Header>
							{#each emmRawTable.getHeaderGroups() as headerGroup (headerGroup.id)}
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
							{#each emmRawTable.getRowModel().rows as row (row.id)}
								<Table.Row>
									{#each row.getVisibleCells() as cell (cell.id)}
										{#if cell.column.id === 'key'}
											{@const original = row.original as EMMRawRow}
											{@const meta = getFieldMeta(original.key)}
											<Table.Cell class="px-2 py-0.5 align-top text-muted-foreground max-w-[160px] truncate">
												<Tooltip.Root>
													<Tooltip.Trigger>
														<span class="inline-block w-full text-left truncate">{meta.label}</span>
													</Tooltip.Trigger>
													<Tooltip.Content>
														<p class="break-all text-[10px]">{original.key}</p>
													</Tooltip.Content>
												</Tooltip.Root>
											</Table.Cell>
										{:else}
											{@const original = row.original as EMMRawRow}
											{@const meta = getFieldMeta(original.key)}
											<Table.Cell class="px-2 py-0.5 align-top text-right max-w-[260px] truncate">
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
																<span>{formatDateTime(original.value)}</span>
															{:else if meta.type === 'timestamp'}
																<span>{formatTimestampSeconds(original.value)}</span>
															{:else if meta.type === 'number'}
																<span>{formatNumberValue(original.key, original.value)}</span>
															{:else if meta.type === 'boolean'}
																<span>{formatBoolean(original.value)}</span>
															{:else}
																<span>{original.value}</span>
															{/if}
														</span>
													</Tooltip.Trigger>
													<Tooltip.Content>
														<p class="break-all text-[10px] max-w-[320px] text-right">{original.value}</p>
													</Tooltip.Content>
												</Tooltip.Root>
											</Table.Cell>
										{/if}
									{/each}
								</Table.Row>
							{:else}
								<Table.Row>
									<Table.Cell colspan={2} class="px-2 py-1 text-center text-[10px] text-muted-foreground">
										暂无记录
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
				{/if}
			</div>
		{/if}

		<div class="rounded-lg border bg-muted/10 p-3 space-y-3" style={`order: ${getEmmCardOrder('bookSettings')}`}>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 font-semibold text-sm">
					<Tag class="h-4 w-4" />
					<span>本书设置</span>
				</div>
				<div class="flex items-center gap-2">
					{#if bookSettings && typeof bookSettings.rating === 'number'}
						<span class="text-[10px] text-muted-foreground">
							评分: {bookSettings.rating}/5
						</span>
					{/if}
					<div class="flex items-center gap-1 text-[10px]">
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5"
							onclick={() => (showBookSettingsCard = !showBookSettingsCard)}
							title={showBookSettingsCard ? '收起' : '展开'}
						>
							{#if showBookSettingsCard}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</Button.Root>
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5"
							onclick={() => moveEmmCard('bookSettings', 'up')}
							disabled={!canMoveEmmCard('bookSettings', 'up')}
							title="上移"
						>
							<ArrowUp class="h-3 w-3" />
						</Button.Root>
						<Button.Root
							variant="ghost"
							size="icon"
							class="h-5 w-5"
							onclick={() => moveEmmCard('bookSettings', 'down')}
							disabled={!canMoveEmmCard('bookSettings', 'down')}
							title="下移"
						>
							<ArrowDown class="h-3 w-3" />
						</Button.Root>
					</div>
				</div>
			</div>

			{#if bookSettings && showBookSettingsCard}
				{@const bs = bookSettings}
				<div class="space-y-2 text-xs">
					<div class="flex items-center justify-between">
						<span>收藏</span>
						<Button.Root
							variant={bs.favorite ? 'default' : 'outline'}
							size="sm"
							class="h-7 px-3 text-xs"
							onclick={() => updateBookSetting({ favorite: !bs.favorite })}
						>
							{#if bs.favorite}
								已收藏
							{:else}
								未收藏
							{/if}
						</Button.Root>
					</div>

					<div class="flex items-center justify-between">
						<span>评分</span>
						<div class="flex items-center gap-1">
							{#each [1, 2, 3, 4, 5] as value}
								<button
									type="button"
									class="h-6 w-6 flex items-center justify-center rounded text-[12px] {bs.rating && bs.rating >= value ? 'text-yellow-400' : 'text-muted-foreground'}"
									onclick={() => updateBookSetting({ rating: value })}
									title={'评分 ' + value + ' 星'}
								>
									{bs.rating && bs.rating >= value ? '★' : '☆'}
								</button>
							{/each}
						</div>
					</div>

					<div class="flex items-center justify-between">
						<span>阅读方向</span>
						<div class="flex gap-1">
							<Button.Root
								variant={bs.readingDirection === 'left-to-right' || !bs.readingDirection ? 'default' : 'outline'}
								size="sm"
								class="h-7 px-2 text-[10px]"
								onclick={() => updateBookSetting({ readingDirection: 'left-to-right' })}
							>
								左→右
							</Button.Root>
							<Button.Root
								variant={bs.readingDirection === 'right-to-left' ? 'default' : 'outline'}
								size="sm"
								class="h-7 px-2 text-[10px]"
								onclick={() => updateBookSetting({ readingDirection: 'right-to-left' })}
							>
								右→左
							</Button.Root>
						</div>
					</div>

					<div class="flex items-center justify-between">
						<span>显示模式</span>
						<div class="flex gap-1">
							<Button.Root
								variant={!bs.doublePageView ? 'default' : 'outline'}
								size="sm"
								class="h-7 px-2 text-[10px]"
								onclick={() => updateBookSetting({ doublePageView: false })}
							>
								单页
							</Button.Root>
							<Button.Root
								variant={bs.doublePageView ? 'default' : 'outline'}
								size="sm"
								class="h-7 px-2 text-[10px]"
								onclick={() => updateBookSetting({ doublePageView: true })}
							>
								双页
							</Button.Root>
						</div>
					</div>

					<div class="flex items-center justify-between">
						<span>横版本子</span>
						<Switch.Root
							checked={bs.horizontalBook ?? false}
							onCheckedChange={(v) => updateBookSetting({ horizontalBook: v })}
							class="scale-75"
						/>
					</div>
				</div>
		{/if}
		</div>
	</div>
{/if}

<!-- 文件夹评分管理 -->
<div class="border rounded-lg bg-muted/30">
	<button
		type="button"
		class="w-full p-2 flex items-center justify-between text-xs font-medium"
		onclick={() => (showFolderRatingsCard = !showFolderRatingsCard)}
	>
		<div class="flex items-center gap-1.5">
			<Star class="h-3.5 w-3.5 text-amber-500" />
			<span>文件夹平均评分</span>
			<span class="text-muted-foreground">({folderRatingStats.count})</span>
		</div>
		{#if showFolderRatingsCard}
			<ChevronUp class="h-3.5 w-3.5 text-muted-foreground" />
		{:else}
			<ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
		{/if}
	</button>
	{#if showFolderRatingsCard}
		<div class="p-2 pt-0 space-y-2 text-xs">
			<p class="text-muted-foreground">
				基于 EMM 数据库计算的文件夹平均评分缓存。
				{#if folderRatingStats.lastUpdated}
					<br />更新: {folderRatingStats.lastUpdated}
				{/if}
			</p>
			<div class="flex flex-wrap gap-1.5">
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button.Root
							variant="outline"
							size="sm"
							class="h-7 px-2 gap-1 text-[10px]"
							onclick={handleUpdateFolderRatings}
							disabled={isUpdatingRatings}
						>
							<RefreshCcw class="h-3 w-3" />
							{isUpdatingRatings ? '更新中...' : '重算'}
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>重新计算所有文件夹的平均评分</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button.Root
							variant="outline"
							size="sm"
							class="h-7 px-2 gap-1 text-[10px]"
							onclick={handleExportFolderRatings}
							disabled={folderRatingStats.count === 0}
						>
							<Download class="h-3 w-3" />
							导出
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>导出评分缓存为 JSON 文件</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button.Root
							variant="outline"
							size="sm"
							class="h-7 px-2 gap-1 text-[10px] text-destructive hover:text-destructive"
							onclick={handleClearFolderRatings}
							disabled={folderRatingStats.count === 0}
						>
							<Trash2 class="h-3 w-3" />
							清除
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>清除所有评分缓存</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
			<!-- 按路径补充评分 -->
			<div class="flex gap-1.5 items-center">
				<Input.Root
					type="text"
					bind:value={folderRatingPath}
					placeholder="输入路径补充评分..."
					class="h-7 text-[10px] flex-1"
				/>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button.Root
							variant="outline"
							size="sm"
							class="h-7 px-2 gap-1 text-[10px]"
							onclick={handleCalculateForPath}
							disabled={!folderRatingPath || isUpdatingRatings}
						>
							补充
						</Button.Root>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>根据子文件夹评分补充该路径的评分</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
		</div>
	{/if}
</div>
