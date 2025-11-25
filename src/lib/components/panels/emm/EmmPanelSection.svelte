<script lang="ts">
	import { Tag, Settings, FolderOpen, Save } from '@lucide/svelte';
	import * as Separator from '$lib/components/ui/separator';
	import * as Input from '$lib/components/ui/input';
	import * as Button from '$lib/components/ui/button';
	import * as Switch from '$lib/components/ui/switch';
	import { open } from '@tauri-apps/plugin-dialog';
	import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';
	import { emmMetadataStore, collectTagMap, emmTranslationStore } from '$lib/stores/emmMetadata.svelte';
	import type { EMMCollectTag } from '$lib/api/emm';

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

	$effect(() => {
		const unsubscribe = infoPanelStore.subscribe((state) => {
			bookInfo = state.bookInfo;
		});
		return unsubscribe;
	});

	$effect(() => {
		emmMetadataStore
			.initialize()
			.then(() => {
				collectTags = emmMetadataStore.getCollectTags();
			})
			.catch((err) => {
				console.error('[EmmPanelSection] 初始化 EMM Store 失败:', err);
			});
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
				<Button.Root
					variant="ghost"
					size="icon"
					class="h-5 w-5 ml-auto"
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
			<div class="flex flex-wrap gap-1.5">
				{#each allTags() as tagInfo}
					<span
						class="inline-flex items-center rounded px-2 py-1 text-xs border {tagInfo.isCollect
							? 'font-semibold'
							: 'bg-muted border-border/60 text-muted-foreground'}"
						style={tagInfo.isCollect
							? `background-color: ${(tagInfo.color || '#409EFF')}20; border-color: ${(tagInfo.color || '#409EFF')}40; color: ${tagInfo.color || '#409EFF'};`
							: ''}
						title="{tagInfo.category}:{tagInfo.tag}"
					>
						{tagInfo.display}
					</span>
				{/each}
			</div>
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
				<div class="space-y-2">
					<div class="text-xs font-medium text-muted-foreground">元数据数据库路径</div>
					<div class="space-y-2">
						{#each emmDatabasePaths as path, index}
							<div class="flex items-center gap-2">
								<Input.Root
									value={path}
									readonly
									class="flex-1 text-xs font-mono"
								/>
								<Button.Root
									variant="ghost"
									size="sm"
									onclick={() => removeDatabasePath(index)}
									class="h-8 w-8 p-0"
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</Button.Root>
							</div>
						{/each}
						<div class="flex items-center gap-2">
							<Input.Root
								bind:value={emmDatabasePathInput}
								placeholder="输入数据库路径或点击选择..."
								class="flex-1 text-xs"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										addDatabasePath();
									}
								}}
							/>
							<Button.Root
								variant="outline"
								size="sm"
								onclick={selectDatabaseFile}
								class="h-8"
							>
								<FolderOpen class="h-3 w-3 mr-1" />
								选择
							</Button.Root>
							<Button.Root
								variant="ghost"
								size="sm"
								onclick={addDatabasePath}
								class="h-8"
								disabled={!emmDatabasePathInput.trim()}
							>
								添加
							</Button.Root>
						</div>
					</div>
				</div>

				<div class="space-y-2">
					<div class="text-xs font-medium text-muted-foreground">翻译数据库路径 (translations.db)</div>
					<div class="flex items-center gap-2">
						<Input.Root
							bind:value={emmTranslationDbPath}
							placeholder="输入翻译数据库路径或点击选择..."
							class="flex-1 text-xs font-mono"
						/>
						<Button.Root
							variant="outline"
							size="sm"
							onclick={selectTranslationDbFile}
							class="h-8"
						>
							<FolderOpen class="h-3 w-3 mr-1" />
							选择
						</Button.Root>
					</div>
				</div>

				<div class="space-y-2">
					<div class="text-xs font-medium text-muted-foreground">设置文件路径 (setting.json)</div>
					<div class="flex items-center gap-2">
						<Input.Root
							bind:value={emmSettingPath}
							placeholder="输入设置文件路径或点击选择..."
							class="flex-1 text-xs font-mono"
						/>
						<Button.Root
							variant="outline"
							size="sm"
							onclick={selectSettingFile}
							class="h-8"
						>
							<FolderOpen class="h-3 w-3 mr-1" />
							选择
						</Button.Root>
					</div>
				</div>

				<div class="space-y-2">
					<div class="text-xs font-medium text-muted-foreground">翻译字典路径 (db.text.json)</div>
					<div class="flex items-center gap-2">
						<Input.Root
							bind:value={emmTranslationDictPath}
							placeholder="输入翻译字典路径或点击选择..."
							class="flex-1 text-xs font-mono"
						/>
						<Button.Root
							variant="outline"
							size="sm"
							onclick={selectTranslationDictFile}
							class="h-8"
						>
							<FolderOpen class="h-3 w-3 mr-1" />
							选择
						</Button.Root>
					</div>
				</div>

				<div class="space-y-3 pt-2 border-t">
					<div class="flex items-center justify-between">
						<div class="text-xs font-medium text-muted-foreground">启用 EMM 数据读取</div>
						<Switch.Root
							checked={enableEMM}
							onCheckedChange={(v) => (enableEMM = v)}
							class="scale-75"
						/>
					</div>

					<div class="space-y-2">
						<div class="text-xs font-medium text-muted-foreground">文件列表标签显示模式</div>
						<div class="flex gap-2">
							<Button.Root
								variant={fileListTagDisplayMode === 'all' ? 'default' : 'outline'}
								size="sm"
								class="h-7 text-xs flex-1"
								onclick={() => (fileListTagDisplayMode = 'all')}
							>
								全部显示
							</Button.Root>
							<Button.Root
								variant={fileListTagDisplayMode === 'collect' ? 'default' : 'outline'}
								size="sm"
								class="h-7 text-xs flex-1"
								onclick={() => (fileListTagDisplayMode = 'collect')}
							>
								仅收藏
							</Button.Root>
							<Button.Root
								variant={fileListTagDisplayMode === 'none' ? 'default' : 'outline'}
								size="sm"
								class="h-7 text-xs flex-1"
								onclick={() => (fileListTagDisplayMode = 'none')}
							>
								不显示
							</Button.Root>
						</div>
					</div>
				</div>

				<div class="flex items-center justify-end gap-2 pt-2 border-t">
					<Button.Root
						variant="default"
						size="sm"
						onclick={saveEMMConfig}
						class="h-8"
					>
						<Save class="h-3 w-3 mr-1" />
						保存并重新加载
					</Button.Root>
				</div>
			</div>
		{/if}
	</div>
{/if}
