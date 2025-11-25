<script lang="ts">
	/**
	 * NeoView - Info Panel Component
	 * 信息面板 - 显示当前图像/书籍详细信息
	 */
	import { Info, Image as ImageIcon, FileText, Calendar, HardDrive, ExternalLink, Copy, Tag, Settings, FolderOpen, Save } from '@lucide/svelte';
	import * as Separator from '$lib/components/ui/separator';
	import { infoPanelStore, type ViewerBookInfo, type ViewerImageInfo } from '$lib/stores/infoPanel.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { FileSystemAPI } from '$lib/api';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { emmMetadataStore, isCollectTagHelper, collectTagMap, emmTranslationStore } from '$lib/stores/emmMetadata.svelte';
	import type { EMMCollectTag, EMMTranslationDict } from '$lib/api/emm';
	import { open } from '@tauri-apps/plugin-dialog';
	import * as Input from '$lib/components/ui/input';
	import * as Button from '$lib/components/ui/button';
	import * as Switch from '$lib/components/ui/switch';

	let imageInfo = $state<ViewerImageInfo | null>(null);
	let bookInfo = $state<ViewerBookInfo | null>(null);
	let contextMenu = $state<{ x: number; y: number; open: boolean }>({ x: 0, y: 0, open: false });
	let collectTags = $state<EMMCollectTag[]>([]);
	
	// EMM 配置状态
	let showEMMConfig = $state(false);
	let emmDatabasePaths = $state<string[]>([]);
	let emmTranslationDbPath = $state<string>('');
	let emmSettingPath = $state<string>('');
	let emmTranslationDictPath = $state<string>('');
	let emmDatabasePathInput = $state<string>('');
	let enableEMM = $state(true);
	let fileListTagDisplayMode = $state<'all' | 'collect' | 'none'>('collect');

	let infoOverlayEnabled = $state(false);
	let infoOverlayOpacity = $state(0.85);

	// 从 store 中获取翻译字典
	const translationDict = $derived.by(() => {
		const dict = emmMetadataStore.getTranslationDict();
		if (dict) {
			console.log('[InfoPanel] 翻译字典已获取');
		}
		return dict;
	});

	// 加载收藏标签（确保初始化完成）
	$effect(() => {
		// 确保初始化完成
		emmMetadataStore.initialize().then(() => {
			collectTags = emmMetadataStore.getCollectTags();
			console.debug('[InfoPanel] 收藏标签已加载，数量:', collectTags.length);
		}).catch(err => {
			console.error('[InfoPanel] 初始化 EMM Store 失败:', err);
		});
	});

	// 获取所有标签（扁平化，高亮收藏的）
	const allTags = $derived(() => {
		if (!bookInfo?.emmMetadata?.tags) {
			return [];
		}
		
		const tags: Array<{ category: string; tag: string; isCollect: boolean; color?: string; display?: string }> = [];
		// 使用全局 store 中的 map
		const map = $collectTagMap;
		const normalize = (s: string) => s.trim().toLowerCase();

		for (const [category, tagList] of Object.entries(bookInfo.emmMetadata.tags)) {
			for (const tag of tagList) {
				// 尝试多种组合查找
				// 1. 完整 "category:tag"
				const fullTagKey = normalize(`${category}:${tag}`);
				let collectTag = map.get(fullTagKey);
				
				// 2. 仅 "tag"
				if (!collectTag) {
					collectTag = map.get(normalize(tag));
				}
				
				const isCollect = !!collectTag;

				// 翻译和缩写
				const translatedTag = emmTranslationStore.translateTag(tag, category, translationDict);
				const shortCategory = emmTranslationStore.getShortNamespace(category);
				const displayStr = `${shortCategory}:${translatedTag}`;
				
				tags.push({
					category,
					tag,
					isCollect,
					color: collectTag?.color,
					// 优先使用翻译后的显示，忽略收藏配置的 display (通常是未翻译的)
					display: displayStr
				});
			}
		}
		
		// 收藏标签优先
		return tags.sort((a, b) => {
			if (a.isCollect && !b.isCollect) return -1;
			if (!a.isCollect && b.isCollect) return 1;
			return 0;
		});
	});

	$effect(() => {
		const unsubscribe = infoPanelStore.subscribe((state) => {
			imageInfo = state.imageInfo;
			bookInfo = state.bookInfo;
		});
		return unsubscribe;
	});

	$effect(() => {
		const s = settingsManager.getSettings();
		const overlay = s.view?.infoOverlay;
		infoOverlayEnabled = overlay?.enabled ?? false;
		infoOverlayOpacity = overlay?.opacity ?? 0.85;
	});

	function updateInfoOverlay(partial: { enabled?: boolean; opacity?: number }) {
		const current = settingsManager.getSettings();
		const prev = current.view?.infoOverlay ?? { enabled: false, opacity: 0.85 };
		const next = { ...prev };

		if (partial.enabled !== undefined) {
			next.enabled = partial.enabled;
		}
		if (partial.opacity !== undefined) {
			const raw = partial.opacity;
			const base = Number.isFinite(raw) ? (raw as number) : prev.opacity ?? 0.85;
			const clamped = Math.min(1, Math.max(0.2, base));
			next.opacity = clamped;
		}

		infoOverlayEnabled = next.enabled;
		infoOverlayOpacity = next.opacity;

		settingsManager.updateNestedSettings('view', {
			infoOverlay: next
		});
	}

	function formatFileSize(bytes?: number): string {
		if (bytes === undefined) return '—';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	function formatDate(date?: string): string {
		if (!date) return '—';
		const parsed = new Date(date);
		if (Number.isNaN(parsed.getTime())) {
			return date;
		}
		return parsed.toLocaleString('zh-CN');
	}

	function formatBookType(type?: string): string {
		if (!type) return '未知';
		switch (type.toLowerCase()) {
			case 'folder':
				return '文件夹';
			case 'archive':
				return '压缩包';
			case 'pdf':
				return 'PDF';
			case 'media':
				return '媒体';
			default:
				return type;
		}
	}

	// 复制路径
	function copyPath() {
		if (bookInfo?.path) {
			navigator.clipboard.writeText(bookInfo.path);
		} else if (imageInfo?.path) {
			navigator.clipboard.writeText(imageInfo.path);
		}
		hideContextMenu();
	}

	// 在资源管理器中打开
	async function openInExplorer() {
		const path = bookInfo?.path || imageInfo?.path;
		if (path) {
			try {
				await FileSystemAPI.showInFileManager(path);
			} catch (err) {
				console.error('在资源管理器中打开失败:', err);
			}
		}
		hideContextMenu();
	}

	// 显示右键菜单
	function showContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		console.log('[InfoPanel] showContextMenu input', {
			clientX: e.clientX,
			clientY: e.clientY,
			targetTag: (e.target as HTMLElement | null)?.tagName,
			bookPath: bookInfo?.path,
			imagePath: imageInfo?.path
		});
		
		let menuX = e.clientX;
		let menuY = e.clientY;
		
		if (menuX === 0 && menuY === 0 && e.target instanceof HTMLElement) {
			const rect = e.target.getBoundingClientRect();
			menuX = rect.left + rect.width / 2;
			menuY = rect.top + rect.height / 2;
		}
		
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		
		const menuWidth = 180;
		if (e.clientX + menuWidth > viewportWidth) {
			menuX = viewportWidth - menuWidth - 10;
		}
		if (menuX < 10) {
			menuX = 10;
		}
		
		const maxMenuHeight = viewportHeight * 0.7;
		if (menuY + maxMenuHeight > viewportHeight) {
			menuY = viewportHeight - maxMenuHeight - 10;
		}
		
		console.log('[InfoPanel] showContextMenu computed', {
			menuX,
			menuY,
			viewportWidth,
			viewportHeight
		});
		
		contextMenu = { x: menuX, y: menuY, open: true };
	}

	// 隐藏右键菜单
	function hideContextMenu() {
		contextMenu = { x: 0, y: 0, open: false };
	}
	
	// 加载 EMM 配置
	function loadEMMConfig() {
		emmDatabasePaths = emmMetadataStore.getDatabasePaths();
		emmTranslationDbPath = emmMetadataStore.getTranslationDbPath() || '';
		emmSettingPath = emmMetadataStore.getSettingPath() || '';
		emmTranslationDictPath = emmMetadataStore.getTranslationDictPath() || '';
		
		// 从 store 订阅获取最新状态
		const unsubscribe = emmMetadataStore.subscribe(state => {
			enableEMM = state.enableEMM;
			fileListTagDisplayMode = state.fileListTagDisplayMode;
			// translationDict = state.translationDict;
		});
		// 立即取消订阅，我们只需要当前值
		unsubscribe();
	}
	
	// 选择数据库文件
	async function selectDatabaseFile() {
		try {
			const selected = await open({
				multiple: true,
				filters: [{
					name: 'SQLite Database',
					extensions: ['sqlite', 'db']
				}]
			});
			
			if (selected) {
				if (Array.isArray(selected)) {
					const paths = selected.map(f => {
						if (typeof f === 'string') return f;
						if (f && typeof f === 'object' && 'path' in f) return (f as { path: string }).path;
						return '';
					}).filter(p => p);
					emmDatabasePaths = [...emmDatabasePaths, ...paths];
				} else {
					const path = typeof selected === 'string' ? selected : 
						(selected && typeof selected === 'object' && 'path' in selected ? (selected as { path: string }).path : '');
					if (path) {
						emmDatabasePaths = [...emmDatabasePaths, path];
					}
				}
			}
		} catch (err) {
			console.error('选择数据库文件失败:', err);
		}
	}
	
	// 选择翻译数据库文件
	async function selectTranslationDbFile() {
		try {
			const selected = await open({
				filters: [{
					name: 'SQLite Database',
					extensions: ['sqlite', 'db']
				}]
			});
			
			if (selected) {
				let path = '';
				if (typeof selected === 'string') {
					path = selected;
				} else if (Array.isArray(selected)) {
					const arr = selected as unknown[];
					if (arr.length > 0) {
						const first = arr[0];
						path = typeof first === 'string' ? first : 
							(first && typeof first === 'object' && 'path' in first ? (first as { path: string }).path : '');
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
	
	// 选择设置文件
	async function selectSettingFile() {
		try {
			const selected = await open({
				filters: [{
					name: 'JSON File',
					extensions: ['json']
				}]
			});
			
			if (selected) {
				let path = '';
				if (typeof selected === 'string') {
					path = selected;
				} else if (Array.isArray(selected)) {
					const arr = selected as unknown[];
					if (arr.length > 0) {
						const first = arr[0];
						path = typeof first === 'string' ? first : 
							(first && typeof first === 'object' && 'path' in first ? (first as { path: string }).path : '');
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

	// 选择翻译字典文件
	async function selectTranslationDictFile() {
		try {
			const selected = await open({
				filters: [{
					name: 'JSON File',
					extensions: ['json']
				}]
			});
			
			if (selected) {
				let path = '';
				if (typeof selected === 'string') {
					path = selected;
				} else if (Array.isArray(selected)) {
					const arr = selected as unknown[];
					if (arr.length > 0) {
						const first = arr[0];
						path = typeof first === 'string' ? first : 
							(first && typeof first === 'object' && 'path' in first ? (first as { path: string }).path : '');
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
	
	// 添加数据库路径（手动输入）
	function addDatabasePath() {
		if (emmDatabasePathInput.trim()) {
			emmDatabasePaths = [...emmDatabasePaths, emmDatabasePathInput.trim()];
			emmDatabasePathInput = '';
		}
	}
	
	// 删除数据库路径
	function removeDatabasePath(index: number) {
		emmDatabasePaths = emmDatabasePaths.filter((_, i) => i !== index);
	}
	
	// 保存 EMM 配置
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
		
		// 保存新设置
		emmMetadataStore.setEnableEMM(enableEMM);
		emmMetadataStore.setFileListTagDisplayMode(fileListTagDisplayMode);
		
		showEMMConfig = false;
		// 重新加载当前书籍的元数据
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
	
	// 初始化时加载配置
	$effect(() => {
		if (showEMMConfig) {
			loadEMMConfig();
		}
	});
</script>

<div 
	class="h-full flex flex-col bg-background"
	oncontextmenu={showContextMenu}
	role="region"
	aria-label="信息面板"
>
		<!-- 标题栏 -->
		<div class="p-4 border-b">
			<div class="flex items-center gap-2">
				<Info class="h-5 w-5" />
				<h3 class="font-semibold">详细信息</h3>
			</div>
		</div>

		<div class="flex-1 overflow-auto">
		<div class="p-4 space-y-6">
			<!-- 书籍信息 -->
			{#if bookInfo}
				<div class="space-y-3">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<FileText class="h-4 w-4" />
						<span>书籍信息</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">名称:</span>
							<span
								class={bookInfo.emmMetadata?.translatedTitle && bookInfo.emmMetadata.translatedTitle !== bookInfo.name
									? 'break-words max-w-[200px] rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-xs text-primary text-right'
									: 'font-medium break-words max-w-[200px]'}
								title={bookInfo.emmMetadata?.translatedTitle || bookInfo.name}
							>
								{bookInfo.emmMetadata?.translatedTitle || bookInfo.name}
							</span>
						</div>
						{#if bookInfo.emmMetadata?.translatedTitle && bookInfo.emmMetadata.translatedTitle !== bookInfo.name}
							<div class="flex justify-between">
								<span class="text-muted-foreground">原名:</span>
								<span class="font-mono text-xs break-words max-w-[200px]" title={bookInfo.name}>
									{bookInfo.name}
								</span>
							</div>
						{/if}
						<div class="flex justify-between">
							<span class="text-muted-foreground">路径:</span>
							<span class="font-mono text-xs break-words max-w-[200px]" title={bookInfo.path}>
								{bookInfo.path}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">类型:</span>
							<span>{formatBookType(bookInfo.type)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">页码:</span>
							<span>
								{bookInfo.currentPage} / {bookInfo.totalPages}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">进度:</span>
							<span>
								{#if bookInfo.totalPages > 0}
									{(
										(Math.min(bookInfo.currentPage, bookInfo.totalPages) / bookInfo.totalPages) *
										100
									).toFixed(1)}%
								{:else}
									—
								{/if}
							</span>
						</div>
					</div>
				</div>

				<!-- 标签信息 -->
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
									console.debug('[InfoPanel] 手动刷新收藏标签');
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


				<!-- EMM 元数据配置 -->
				<Separator.Root />
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 font-semibold text-sm">
							<Settings class="h-4 w-4" />
							<span>EMM 元数据配置</span>
						</div>
						<button
							class="text-xs text-muted-foreground hover:text-foreground"
							onclick={() => showEMMConfig = !showEMMConfig}
						>
							{showEMMConfig ? '收起' : '展开'}
						</button>
					</div>
					
					{#if showEMMConfig}
						<div class="space-y-3 text-sm border rounded-lg p-3 bg-muted/30">
							<!-- 数据库路径配置 -->
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
							
							<!-- 翻译数据库路径配置 -->
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
							
							<!-- 设置文件路径配置 -->
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

							<!-- 翻译字典路径配置 -->
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

							<!-- 全局设置 -->
							<div class="space-y-3 pt-2 border-t">
								<div class="flex items-center justify-between">
									<div class="text-xs font-medium text-muted-foreground">启用 EMM 数据读取</div>
									<Switch.Root
										checked={enableEMM}
										onCheckedChange={(v) => enableEMM = v}
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
											onclick={() => fileListTagDisplayMode = 'all'}
										>
											全部显示
										</Button.Root>
										<Button.Root
											variant={fileListTagDisplayMode === 'collect' ? 'default' : 'outline'}
											size="sm"
											class="h-7 text-xs flex-1"
											onclick={() => fileListTagDisplayMode = 'collect'}
										>
											仅收藏
										</Button.Root>
										<Button.Root
											variant={fileListTagDisplayMode === 'none' ? 'default' : 'outline'}
											size="sm"
											class="h-7 text-xs flex-1"
											onclick={() => fileListTagDisplayMode = 'none'}
										>
											不显示
										</Button.Root>
									</div>
								</div>
							</div>
							
							<!-- 保存按钮 -->
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

				<!-- 信息悬浮窗 -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 font-semibold text-sm">
							<Info class="h-4 w-4" />
							<span>信息悬浮窗</span>
						</div>
						<Switch.Root
							checked={infoOverlayEnabled}
							onCheckedChange={(v) => updateInfoOverlay({ enabled: v })}
							class="scale-75"
						/>
					</div>
					<div class="space-y-2 text-xs text-muted-foreground">
						<div class="flex items-center justify-between gap-2">
							<span>透明度</span>
							<div class="flex items-center gap-2">
								<Input.Root
									type="number"
									min="20"
									max="100"
									step="5"
									class="h-7 w-20 px-2 text-xs"
									value={Math.round(infoOverlayOpacity * 100).toString()}
									oninput={(e) => {
										const target = e.currentTarget as HTMLInputElement;
										const v = parseFloat(target.value);
										if (!Number.isNaN(v)) {
											updateInfoOverlay({ opacity: v / 100 });
										}
									}}
								/>
								<span class="text-[11px]">{Math.round(infoOverlayOpacity * 100)}%</span>
							</div>
						</div>
						<p>调节悬浮信息窗的背景透明度（20% - 100%）。</p>
					</div>
				</div>

				<Separator.Root />
			{/if}
			{#if imageInfo}
				<div class="space-y-3">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<ImageIcon class="h-4 w-4" />
						<span>图像信息</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">文件名:</span>
							<span class="font-mono text-xs" title={imageInfo.name}>
								{imageInfo.name}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">格式:</span>
							<span>{imageInfo.format ?? '—'}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">尺寸:</span>
							<span>
								{#if imageInfo.width && imageInfo.height}
									{imageInfo.width} × {imageInfo.height}
								{:else}
									—
								{/if}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">色深:</span>
							<span>{imageInfo.colorDepth ?? '—'}</span>
						</div>
					</div>
				</div>

				<Separator.Root />

				<div class="space-y-3">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<HardDrive class="h-4 w-4" />
						<span>存储信息</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">路径:</span>
							<span class="font-mono text-xs break-words max-w-[200px]" title={imageInfo.path}>
								{imageInfo.path ?? '—'}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">大小:</span>
							<span>{formatFileSize(imageInfo.fileSize)}</span>
						</div>
					</div>
				</div>

				<Separator.Root />

				<!-- 时间信息 -->
				<div class="space-y-3">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<Calendar class="h-4 w-4" />
						<span>时间信息</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">创建时间:</span>
							<span class="text-xs">{formatDate(imageInfo.createdAt)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">修改时间:</span>
							<span class="text-xs">{formatDate(imageInfo.modifiedAt)}</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<div class="relative mb-4">
						<Info class="h-16 w-16 opacity-30" />
						<div class="absolute inset-0 flex items-center justify-center">
							<div class="h-2 w-2 bg-muted-foreground rounded-full animate-pulse"></div>
						</div>
					</div>
					<div class="text-center space-y-2">
						<p class="text-lg font-medium">暂无图像信息</p>
						<p class="text-sm opacity-70">打开图像文件后查看详细信息</p>
						<div class="mt-4 p-3 bg-muted/50 rounded-lg text-xs space-y-1">
							<p class="font-medium text-foreground">支持格式：</p>
							<p>• 图像：JPG, PNG, GIF, WebP, AVIF</p>
							<p>• 文档：PDF, CBZ, CBR</p>
							<p>• 视频：MP4, WebM (缩略图)</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- 右键菜单 -->
	{#if contextMenu.open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="context-menu fixed z-50 max-h-(--bits-context-menu-content-available-height) origin-(--bits-context-menu-content-transform-origin) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground p-1 shadow-md"
			style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
			role="menu"
			tabindex="-1"
			onmousedown={(e: MouseEvent) => e.stopPropagation()}
		>
			<button
				type="button"
				class="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
				onclick={copyPath}
			>
				<Copy class="h-4 w-4 mr-2" />
				<span>复制路径</span>
			</button>
			<hr class="bg-border -mx-1 my-1 h-px border-0" />
			<button
				type="button"
				class="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
				onclick={openInExplorer}
				disabled={!bookInfo?.path && !imageInfo?.path}
			>
				<ExternalLink class="h-4 w-4 mr-2" />
				<span>在资源管理器中打开</span>
			</button>
		</div>
	{/if}
</div>
