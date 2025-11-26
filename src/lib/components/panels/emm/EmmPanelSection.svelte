<script lang="ts">
	import { Tag, Settings, FolderOpen, Save } from '@lucide/svelte';
	import * as Separator from '$lib/components/ui/separator';
	import * as Input from '$lib/components/ui/input';
	import * as Button from '$lib/components/ui/button';
	import * as Switch from '$lib/components/ui/switch';
	import { onMount } from 'svelte';
	import { open } from '@tauri-apps/plugin-dialog';
	import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';
	import { emmMetadataStore, collectTagMap, emmTranslationStore } from '$lib/stores/emmMetadata.svelte';
	import type { EMMCollectTag } from '$lib/api/emm';
	import { bookSettingsStore, type PerBookSettings } from '$lib/stores/bookSettings.svelte';

	let bookInfo = $state<ViewerBookInfo | null>(null);
	let collectTags = $state<EMMCollectTag[]>([]);

	let showEMMConfig = $state(false);
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

	function loadEMMConfig() {
		emmDatabasePaths = emmMetadataStore.getDatabasePaths();
		emmTranslationDbPath = emmMetadataStore.getTranslationDbPath() || '';
		emmSettingPath = emmMetadataStore.getSettingPath() || '';
		emmTranslationDictPath = emmMetadataStore.getTranslationDictPath() || '';

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
	{#if allTags().length > 0}
		<Separator.Root />
		<div class="space-y-3">
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
		</div>
	{/if}

	<Separator.Root />
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2 font-semibold text-sm">
				<Settings class="h-4 w-4" />
				<span>EMM 元数据配置</span>
			</div>
			<button
				class="text-xs text-muted-foreground hover:text-foreground"
				onclick={() => (showEMMConfig = !showEMMConfig)}
			>
				{showEMMConfig ? '收起' : '展开'}
			</button>
		</div>

		{#if showEMMConfig}
			<div class="space-y-3 text-sm border rounded-lg p-3 bg-muted/30">
				<!-- ... -->
			</div>
		{/if}
	</div>

	<Separator.Root />
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2 font-semibold text-sm">
				<Tag class="h-4 w-4" />
				<span>本书设置</span>
			</div>
			{#if bookSettings && typeof bookSettings.rating === 'number'}
				<span class="text-[10px] text-muted-foreground">
					评分: {bookSettings.rating}/5
				</span>
			{/if}
		</div>

		{#if bookSettings}
			<div class="space-y-2 text-xs">
				<div class="flex items-center justify-between">
					<span>收藏</span>
					<Button.Root
						variant={bookSettings.favorite ? 'default' : 'outline'}
						size="sm"
						class="h-7 px-3 text-xs"
						onclick={() => updateBookSetting({ favorite: !bookSettings.favorite })}
					>
						{#if bookSettings.favorite}
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
								class="h-6 w-6 flex items-center justify-center rounded text-[12px] {bookSettings.rating && bookSettings.rating >= value ? 'text-yellow-400' : 'text-muted-foreground'}"
								onclick={() => updateBookSetting({ rating: value })}
								title={'评分 ' + value + ' 星'}
							>
								{bookSettings.rating && bookSettings.rating >= value ? '★' : '☆'}
							</button>
						{/each}
					</div>
				</div>

				<div class="flex items-center justify-between">
					<span>阅读方向</span>
					<div class="flex gap-1">
						<Button.Root
							variant={bookSettings.readingDirection === 'left-to-right' || !bookSettings.readingDirection ? 'default' : 'outline'}
							size="sm"
							class="h-7 px-2 text-[10px]"
							onclick={() => updateBookSetting({ readingDirection: 'left-to-right' })}
						>
							左→右
						</Button.Root>
						<Button.Root
							variant={bookSettings.readingDirection === 'right-to-left' ? 'default' : 'outline'}
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
							variant={!bookSettings.doublePageView ? 'default' : 'outline'}
							size="sm"
							class="h-7 px-2 text-[10px]"
							onclick={() => updateBookSetting({ doublePageView: false })}
						>
							单页
						</Button.Root>
						<Button.Root
							variant={bookSettings.doublePageView ? 'default' : 'outline'}
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
						checked={bookSettings.horizontalBook ?? false}
						onCheckedChange={(v) => updateBookSetting({ horizontalBook: v })}
						class="scale-75"
					/>
				</div>
			</div>
		{/if}
	</div>
{/if}
