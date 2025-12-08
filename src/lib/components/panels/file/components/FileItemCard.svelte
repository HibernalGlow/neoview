<script lang="ts">
	/**
	 * FileItemCard - 共用的文件项展示组件（容器组件）
	 * 负责数据获取和状态管理，根据 viewMode 渲染对应视图组件
	 * 用于 FileBrowser、HistoryPanel、BookmarkPanel
	 */
	import type { FsItem } from '$lib/types';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import {
		emmMetadataStore,
		collectTagMap,
		emmTranslationStore
	} from '$lib/stores/emmMetadata.svelte';
	import { mixedGenderStore, categoryColors } from '$lib/stores/emm/favoriteTagStore.svelte';
	import type { EMMTranslationDict } from '$lib/api/emm';
	import { getFileMetadata } from '$lib/api';
	import FileItemListView from './FileItemListView.svelte';
	import FileItemGridView from './FileItemGridView.svelte';
	import { aiTranslationStore } from '$lib/stores/ai/translationStore.svelte';
	import { translateText, needsTranslation } from '$lib/services/translationService';
	import { tabPenetrateMode } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
	import { FileSystemAPI } from '$lib/api';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';

	let {
		item,
		thumbnail = undefined,
		viewMode = 'list' as 'list' | 'content' | 'banner' | 'thumbnail',
		isSelected = false,
		isCheckMode = false,
		isDeleteMode = false,
		isChecked = false,
		showReadMark = false,
		showBookmarkMark = true,
		showSizeAndModified = false,
		currentPage = undefined,
		totalPages = undefined,
		videoPosition = undefined,
		videoDuration = undefined,
		timestamp = undefined,
		thumbnailSize = 48,
		onClick = undefined,
		onDoubleClick = undefined,
		onContextMenu = undefined,
		onToggleSelection = undefined,
		onDelete = undefined,
		onOpenAsBook = undefined,
		onOpenInNewTab = undefined
	}: {
		item: FsItem;
		thumbnail?: string;
		viewMode?: 'list' | 'content' | 'banner' | 'thumbnail';
		isSelected?: boolean;
		isChecked?: boolean;
		isCheckMode?: boolean;
		isDeleteMode?: boolean;
		showReadMark?: boolean;
		showBookmarkMark?: boolean;
		showSizeAndModified?: boolean;
		currentPage?: number;
		totalPages?: number;
		videoPosition?: number;
		videoDuration?: number;
		timestamp?: number;
		thumbnailSize?: number;
		onClick?: () => void;
		onDoubleClick?: () => void;
		onContextMenu?: (e: MouseEvent) => void;
		onToggleSelection?: () => void;
		onDelete?: () => void;
		onOpenAsBook?: () => void;
		onOpenInNewTab?: () => void;
	} = $props();

	// 检查是否为收藏（使用 $derived 避免在每次渲染时调用）
	const isBookmarked = $derived.by(() => {
		if (!showBookmarkMark) return false;
		try {
			const bookmarks = bookmarkStore.getAll();
			return bookmarks.some((b) => b.path === item.path);
		} catch (err) {
			console.debug('检查收藏状态失败:', err);
			return false;
		}
	});

	// 判断文件类型
	const isArchive = $derived(
		item.name.endsWith('.zip') ||
			item.name.endsWith('.cbz') ||
			item.name.endsWith('.rar') ||
			item.name.endsWith('.cbr') ||
			item.name.endsWith('.7z') ||
			item.name.endsWith('.cb7')
	);

	// EMM 元数据
	let emmMetadata = $state<{ translatedTitle?: string; tags?: Record<string, string[]>; rating?: number } | null>(
		null
	);
	// let collectTags = $state<EMMCollectTag[]>([]); // No longer needed locally
	let metadataLoading = $state(false);
	let lastLoadedPath = $state<string | null>(null);

	// AI 翻译状态
	let aiTranslatedTitle = $state<string | null>(null);
	let aiTranslationEnabled = $state(false);
	let aiAutoTranslate = $state(true);
	let aiTargetLanguage = $state('zh');

	// 订阅 AI 翻译设置
	$effect(() => {
		const unsubscribe = aiTranslationStore.subscribe((state) => {
			aiTranslationEnabled = state.config.enabled;
			aiAutoTranslate = state.config.autoTranslate;
			aiTargetLanguage = state.config.targetLanguage;
		});
		return unsubscribe;
	});

	// 订阅全局 EMM 设置
	let enableEMM = $state(true);
	let fileListTagDisplayMode = $state<'all' | 'collect' | 'none'>('collect');
	let translationDict = $state<EMMTranslationDict | undefined>(undefined);

	$effect(() => {
		const unsubscribe = emmMetadataStore.subscribe((state) => {
			enableEMM = state.enableEMM;
			fileListTagDisplayMode = state.fileListTagDisplayMode;
			translationDict = state.translationDict;
		});
		return unsubscribe;
	});

	// 穿透模式：文件夹显示内部压缩包信息
	let penetrateModeEnabled = $state(false);
	let penetrateShowInnerFile = $state<'none' | 'single' | 'all'>('single');
	let penetrateChildFile = $state<{ name: string; path: string } | null>(null);
	let penetrateChildMetadata = $state<{ translatedTitle?: string } | null>(null);
	let penetrateAiTranslatedTitle = $state<string | null>(null);

	// 订阅穿透模式
	$effect(() => {
		const unsubscribe = tabPenetrateMode.subscribe((enabled) => {
			penetrateModeEnabled = enabled;
		});
		return unsubscribe;
	});

	// 订阅穿透显示配置
	$effect(() => {
		const unsubscribe = fileBrowserStore.subscribe((state) => {
			penetrateShowInnerFile = state.penetrateShowInnerFile;
		});
		return unsubscribe;
	});

	// 穿透模式：加载文件夹内的单个文件信息
	$effect(() => {
		// 不是文件夹则跳过
		if (!item.isDir) {
			penetrateChildFile = null;
			penetrateChildMetadata = null;
			penetrateAiTranslatedTitle = null;
			return;
		}
		
		// 配置为 'none' 时不显示
		if (penetrateShowInnerFile === 'none') {
			penetrateChildFile = null;
			penetrateChildMetadata = null;
			penetrateAiTranslatedTitle = null;
			return;
		}

		// 配置为 'single' 时只在穿透模式开启时显示
		// 配置为 'all' 时始终显示
		if (penetrateShowInnerFile === 'single' && !penetrateModeEnabled) {
			penetrateChildFile = null;
			penetrateChildMetadata = null;
			penetrateAiTranslatedTitle = null;
			return;
		}

		// 加载文件夹内容，找单个压缩包
		FileSystemAPI.browseDirectory(item.path).then((children) => {
			// 只有一个文件且是压缩包时才穿透显示
			if (children.length === 1 && !children[0].isDir) {
				const child = children[0];
				const isChildArchive = /\.(zip|cbz|rar|cbr|7z|cb7)$/i.test(child.name);
				if (isChildArchive) {
					penetrateChildFile = { name: child.name, path: child.path };
					// 加载 EMM 元数据
					if (enableEMM) {
						emmMetadataStore.loadMetadataByPath(child.path).then((metadata) => {
							if (metadata) {
								penetrateChildMetadata = { translatedTitle: metadata.translated_title };
							}
						});
					}
					// AI 翻译
					if (aiTranslationEnabled && aiAutoTranslate) {
						const nameWithoutExt = child.name.replace(/\.[^.]+$/, '');
						const childExt = child.name.split('.').pop()?.toLowerCase() || 'archive';
						const cached = aiTranslationStore.getCachedTranslation(nameWithoutExt);
						if (cached) {
							penetrateAiTranslatedTitle = cached;
						} else if (needsTranslation(nameWithoutExt, aiTargetLanguage)) {
							translateText(nameWithoutExt, { fileExtension: childExt }).then((result) => {
								if (result.success && result.translated) {
									penetrateAiTranslatedTitle = result.translated;
								}
							});
						}
					}
				}
			}
		}).catch(() => {
			// 忽略错误
		});
	});

	// 评分（文件夹和文件都使用统一的 ratingStore）
	let itemRating = $state<number | null>(null);
	let ratingStoreRef: typeof import('$lib/stores/emm/ratingStore').ratingStore | null = null;

	// 加载评分（文件夹或文件）
	$effect(() => {
		if (enableEMM && item.path) {
			import('$lib/stores/emm/ratingStore').then(({ ratingStore }) => {
				ratingStoreRef = ratingStore;
				ratingStore.getRating(item.path).then((rating) => {
					itemRating = rating?.value ?? null;
				});
			});
		} else {
			itemRating = null;
		}
	});

	// 获取有效评分
	function getEffectiveRating(): number | null {
		// 文件夹：使用 itemRating（从缩略图数据库获取）
		// 文件（压缩包）：优先使用 emmMetadata 中的 rating，否则使用 itemRating
		if (item.isDir) {
			return itemRating;
		}
		return emmMetadata?.rating ?? itemRating;
	}

	// 设置手动评分
	async function handleSetRating(rating: number | null) {
		if (ratingStoreRef && item.path) {
			if (rating === null) {
				await ratingStoreRef.clearRating(item.path);
			} else {
				await ratingStoreRef.setRating(item.path, rating);
			}
			itemRating = rating;
		}
	}

	// 加载 EMM 元数据（仅针对压缩包，且路径变化时加载）
	$effect(() => {
		if (
			enableEMM &&
			isArchive &&
			item.path &&
			!item.isDir &&
			item.path !== lastLoadedPath &&
			!metadataLoading
		) {
			metadataLoading = true;
			lastLoadedPath = item.path;
			aiTranslatedTitle = null; // 重置 AI 翻译

			// console.debug('[FileItemCard] 开始加载 EMM 元数据 (Archive):', item.name);

			// 立即加载，不使用随机延迟
			emmMetadataStore
				.loadMetadataByPath(item.path)
				.then((metadata) => {
					if (metadata && item.path === lastLoadedPath) {
						emmMetadata = {
							translatedTitle: metadata.translated_title,
							tags: metadata.tags,
							rating: metadata.rating
						};
						// console.debug('[FileItemCard] EMM 元数据加载成功:', item.name);
					}
					metadataLoading = false;
				})
				.catch((err) => {
					console.error('[FileItemCard] EMM 元数据加载失败:', item.name, err);
					metadataLoading = false;
				});

			return () => {
				metadataLoading = false;
			};
		} else if (!enableEMM) {
			// 如果禁用了 EMM，清除元数据
			emmMetadata = null;
			lastLoadedPath = null;
		}
	});

	// AI 自动翻译：当没有 EMM 翻译标题且需要翻译时
	$effect(() => {
		// 条件检查
		if (!aiTranslationEnabled || !aiAutoTranslate) return;
		if (metadataLoading) return;
		if (emmMetadata?.translatedTitle) return; // 已有 EMM 翻译，不需要 AI 翻译
		if (aiTranslatedTitle) return; // 已有 AI 翻译

		// 获取文件名（不含扩展名）
		const nameWithoutExt = item.name.replace(/\.[^.]+$/, '');
		
		// 检测是否需要翻译（源语言 ≠ 目标语言）
		if (!needsTranslation(nameWithoutExt, aiTargetLanguage)) return;

		// 检查缓存
		const cached = aiTranslationStore.getCachedTranslation(nameWithoutExt);
		if (cached) {
			aiTranslatedTitle = cached;
			return;
		}

		// 获取扩展名：文件夹用 'folder'，文件用实际扩展名
		const itemExt = item.isDir ? 'folder' : (item.name.split('.').pop()?.toLowerCase() || '');
		
		// 异步翻译（不阻塞）
		translateText(nameWithoutExt, { fileExtension: itemExt }).then((result) => {
			if (result.success && result.translated && item.path === lastLoadedPath) {
				aiTranslatedTitle = result.translated;
			}
		});
	});

	// 性别类别（用于混合匹配）
	const genderCategories = ['female', 'male', 'mixed'];

	// 获取显示的标签（高亮收藏的，支持混合匹配）
	const displayTags = $derived(() => {
		if (!emmMetadata?.tags || fileListTagDisplayMode === 'none') return [];

		const map = $collectTagMap; // Use the shared map
		const normalize = (s: string) => s.trim().toLowerCase();
		const isMixedEnabled = mixedGenderStore.enabled;

		const allTags: Array<{ tag: string; isCollect: boolean; color?: string; display: string; isMixedVariant?: boolean }> = [];
		const addedTagKeys = new Set<string>();

		for (const [category, tags] of Object.entries(emmMetadata.tags)) {
			for (const tag of tags) {
				const fullTagKey = normalize(`${category}:${tag}`);
				
				// 避免重复添加
				if (addedTagKeys.has(fullTagKey)) continue;
				addedTagKeys.add(fullTagKey);

				// 尝试多种组合查找
				let collectTag = map.get(fullTagKey);
				if (!collectTag) {
					collectTag = map.get(normalize(tag));
				}

				// 混合匹配：如果是性别类别，检查其他性别类别的收藏
				let matchedByMixed = false;
				let mixedCollectTag = collectTag;
				if (!collectTag && isMixedEnabled && genderCategories.includes(category)) {
					for (const altCat of genderCategories) {
						if (altCat === category) continue;
						const altKey = normalize(`${altCat}:${tag}`);
						const altCollect = map.get(altKey);
						if (altCollect) {
							mixedCollectTag = altCollect;
							matchedByMixed = true;
							break;
						}
					}
				}

				const isCollect = !!collectTag || matchedByMixed;

				// 根据显示模式过滤
				if (fileListTagDisplayMode === 'collect' && !isCollect) {
					continue;
				}

				// 翻译和缩写
				const translatedTag = emmTranslationStore.translateTag(tag, category, translationDict);
				const shortCategory = emmTranslationStore.getShortNamespace(category);
				const displayStr = `${shortCategory}:${translatedTag}`;

				// 使用类别颜色或收藏颜色
				const tagColor = collectTag?.color || (matchedByMixed ? mixedCollectTag?.color : categoryColors[category]);

				allTags.push({
					tag: `${category}:${tag}`,
					isCollect,
					color: tagColor,
					display: displayStr,
					isMixedVariant: matchedByMixed
				});
			}
		}

		// 收藏标签优先显示
		const collectTagsList = allTags.filter((t) => t.isCollect);
		const normalTagsList = allTags.filter((t) => !t.isCollect);

		// 如果有收藏标签，优先展示收藏标签；否则展示普通标签
		return [...collectTagsList, ...normalTagsList];
	});

	// 文件夹预览相关
	let showPreview = $state(false);
	let previewItems = $state<FsItem[]>([]);
	let previewLoading = $state(false);
	let previewIconElement = $state<HTMLElement | null>(null);
	let folderTotalSize = $state<number | null>(null);
	let folderSizeLoading = $state(false);

	// 加载文件夹预览内容
	async function loadFolderPreview() {
		if (!item.isDir || previewLoading) return;

		previewLoading = true;
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			const items = await invoke<FsItem[]>('read_directory', { path: item.path });
			// 只取前10个项目作为预览
			previewItems = items.slice(0, 10);
		} catch (error) {
			console.error('加载文件夹预览失败:', error);
			previewItems = [];
		} finally {
			previewLoading = false;
		}
	}

	// 异步加载目录总字节大小（仅在需要显示大小+时间时，对目录生效）
	$effect(() => {
		if (!showSizeAndModified) return;
		if (!item.isDir) return;
		if (folderTotalSize !== null || folderSizeLoading) return;

		folderSizeLoading = true;
		getFileMetadata(item.path)
			.then((meta) => {
				folderTotalSize = meta.size ?? 0;
			})
			.catch((err) => {
				console.debug('获取文件夹总大小失败:', item.path, err);
			})
			.finally(() => {
				folderSizeLoading = false;
			});
	});

	// 格式化时间
	function formatTime(ts?: number): string {
		if (!ts) return '';
		const now = Date.now();
		const diff = now - ts;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return '刚刚';
		if (minutes < 60) return `${minutes}分钟前`;
		if (hours < 24) return `${hours}小时前`;
		if (days < 7) return `${days}天前`;
		return new Date(ts).toLocaleDateString();
	}

	// 格式化文件大小
	function formatSize(bytes: number, isDir: boolean): string {
		if (isDir) {
			return bytes === 0 ? '空文件夹' : `${bytes} 项`;
		}
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
	}

	const isReadCompleted = $derived(
		currentPage !== undefined &&
			totalPages !== undefined &&
			totalPages > 0 &&
			currentPage >= totalPages - 1
	);

	// 穿透模式：内部压缩包信息（独立显示，不覆盖文件夹标题）
	const penetrateInfo = $derived.by(() => {
		if (!item.isDir || !penetrateModeEnabled || !penetrateChildFile) return null;
		
		const childNameWithoutExt = penetrateChildFile.name.replace(/\.[^.]+$/, '');
		const childTitle = penetrateChildMetadata?.translatedTitle || penetrateAiTranslatedTitle;
		const isAiTranslated = !!(penetrateAiTranslatedTitle && !penetrateChildMetadata?.translatedTitle);
		
		return {
			originalName: childNameWithoutExt,
			translatedTitle: childTitle,
			isAiTranslated
		};
	});

	// 合并 EMM 元数据和 AI 翻译
	// 如果有 AI 翻译但没有 EMM 翻译，则使用 AI 翻译并标记为 AI 翻译
	const mergedEmmMetadata = $derived.by(() => {
		if (!emmMetadata && !aiTranslatedTitle) return null;
		
		const base = emmMetadata || { tags: undefined, rating: undefined };
		
		// 如果已有 EMM 翻译标题，直接使用
		if (base.translatedTitle) {
			return base;
		}
		
		// 如果有 AI 翻译标题，使用 AI 翻译并添加标记
		if (aiTranslatedTitle) {
			return {
				...base,
				translatedTitle: `🤖 ${aiTranslatedTitle}`,
				isAiTranslated: true
			};
		}
		
		return base;
	});
</script>

{#if viewMode === 'list' || viewMode === 'content'}
	<!-- 列表视图和内容视图使用 FileItemListView -->
	<FileItemListView
		{item}
		{thumbnail}
		{isSelected}
		{isChecked}
		{isCheckMode}
		{isDeleteMode}
		{showReadMark}
		showSizeAndModified={viewMode === 'content' || showSizeAndModified}
		{currentPage}
		{totalPages}
		{videoPosition}
		{videoDuration}
		{timestamp}
		{thumbnailSize}
		{folderTotalSize}
		{folderSizeLoading}
		{isBookmarked}
		{isArchive}
		{isReadCompleted}
		emmMetadata={mergedEmmMetadata}
		{penetrateInfo}
		folderAverageRating={itemRating}
		folderManualRating={null}
		{displayTags}
		{getEffectiveRating}
		{showPreview}
		{previewLoading}
		{previewItems}
		bind:previewIconElement
		{onClick}
		{onContextMenu}
		{onToggleSelection}
		{onDelete}
		{onOpenAsBook}
		{onOpenInNewTab}
		onSetRating={handleSetRating}
		onPreviewEnter={() => {
			showPreview = true;
			loadFolderPreview();
		}}
		onPreviewLeave={() => {
			showPreview = false;
		}}
	/>
{:else}
	<!-- 横幅视图和缩略图视图使用 FileItemGridView -->
	<FileItemGridView
		{item}
		{thumbnail}
		{isSelected}
		{showReadMark}
		{showSizeAndModified}
		{currentPage}
		{totalPages}
		{videoPosition}
		{videoDuration}
		{timestamp}
		{folderTotalSize}
		{folderSizeLoading}
		{isBookmarked}
		{isArchive}
		{isReadCompleted}
		emmMetadata={mergedEmmMetadata}
		folderAverageRating={itemRating}
		folderManualRating={null}
		{displayTags}
		{getEffectiveRating}
		{onClick}
		{onContextMenu}
		{onOpenAsBook}
		onSetRating={handleSetRating}
	/>
{/if}
