<script lang="ts">
/**
 * EMM 配置卡片
 * 提供 EMM 数据库路径、翻译字典等配置
 */
import { Settings, FolderOpen, Save } from '@lucide/svelte';
import * as Separator from '$lib/components/ui/separator';
import * as Input from '$lib/components/ui/input';
import * as Button from '$lib/components/ui/button';
import * as Switch from '$lib/components/ui/switch';
import { onMount } from 'svelte';
import { open } from '@tauri-apps/plugin-dialog';
import { emmMetadataStore } from '$lib/stores/emmMetadata.svelte';
import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';

let bookInfo = $state<ViewerBookInfo | null>(null);
let emmDatabasePaths = $state<string[]>([]);
let emmTranslationDbPath = $state<string>('');
let emmSettingPath = $state<string>('');
let emmTranslationDictPath = $state<string>('');
let emmDatabasePathInput = $state<string>('');
let enableEMM = $state(true);
let fileListTagDisplayMode = $state<'all' | 'collect' | 'none'>('collect');

function loadEMMConfig() {
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

onMount(() => {
	loadEMMConfig();

	const unsubscribe = infoPanelStore.subscribe((state) => {
		bookInfo = state.bookInfo;
	});
	return unsubscribe;
});
</script>

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
</div>
