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
		{timestamp}
		{thumbnailSize}
		{folderTotalSize}
		{folderSizeLoading}
		{isBookmarked}
		{isArchive}
		{isReadCompleted}
		{emmMetadata}
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
		{timestamp}
		{folderTotalSize}
		{folderSizeLoading}
		{isBookmarked}
		{isArchive}
		{isReadCompleted}
		{emmMetadata}
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
