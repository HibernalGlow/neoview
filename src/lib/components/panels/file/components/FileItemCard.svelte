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
	import {
		fileListTagSettings,
		type FileListTagDisplayMode
	} from '$lib/stores/fileListTagSettings.svelte';
	import { mixedGenderStore, categoryColors } from '$lib/stores/emm/favoriteTagStore.svelte';
	import { collectTagCountStore } from '$lib/stores/emm/collectTagCountStore';
	import type { EMMTranslationDict } from '$lib/api/emm';
	import { getManualTags, type ManualTag } from '$lib/stores/emm/manualTagStore.svelte';
	import { isPathBlacklisted, addToRuntimeBlacklist } from '$lib/stores/pathBlacklist.svelte';
	import {
		getFolderSizeSmart,
		getCachedFolderSize,
		setFolderSizeCache
	} from '$lib/stores/folderSizeCache.svelte';
	import FileItemListView from './FileItemListView.svelte';
	import FileItemGridView from './FileItemGridView.svelte';
	import { aiTranslationStore } from '$lib/stores/ai/translationStore.svelte';
	import { translateText, needsTranslation } from '$lib/services/translationService';
	import { tabPenetrateMode } from '$lib/components/panels/folderPanel/stores/folderTabStore';
	import { FileSystemAPI } from '$lib/api';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import {
		generateThumbKey,
		unifiedThumbnailStore,
		type ThumbnailRequest,
		type ThumbnailSource
	} from '$lib/stores/unifiedThumbnailStore.svelte';
	import {
		isMediaFile,
		isArchiveFile,
		formatRelativeTime,
		formatFileSize,
		genderCategories,
		normalizeTagKey
	} from './fileItemUtils';
	import { loadFolderPreviewCandidates, type FolderPreviewCandidate } from './folderPreviewLoader';

	const namespaceDisplayCache = new Map<string, string>();
	const tagTranslationCache = new Map<string, string>();
	const objectIdMap = new WeakMap<object, number>();
	let objectIdSeed = 1;

	function getObjectId(value: unknown): number {
		if (!value || typeof value !== 'object') return 0;
		const objectValue = value as object;
		const existing = objectIdMap.get(objectValue);
		if (existing) return existing;
		const next = objectIdSeed++;
		objectIdMap.set(objectValue, next);
		return next;
	}

	function getShortNamespaceCached(category: string): string {
		const cached = namespaceDisplayCache.get(category);
		if (cached) return cached;
		const shortName = emmTranslationStore.getShortNamespace(category);
		namespaceDisplayCache.set(category, shortName);
		return shortName;
	}

	function translateTagCached(
		tag: string,
		category: string,
		dict: EMMTranslationDict | undefined
	): string {
		const dictId = getObjectId(dict as unknown as object);
		const cacheKey = `${dictId}|${category}|${tag}`;
		const cached = tagTranslationCache.get(cacheKey);
		if (cached) return cached;
		const translated = emmTranslationStore.translateTag(tag, category, dict);
		tagTranslationCache.set(cacheKey, translated);
		if (tagTranslationCache.size > 10000) {
			const first = tagTranslationCache.keys().next().value;
			if (first) tagTranslationCache.delete(first);
		}
		return translated;
	}

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
			return bookmarkStore.hasPath(item.path);
		} catch (err) {
			console.debug('检查收藏状态失败:', err);
			return false;
		}
	});

	// 判断文件类型
	const isArchive = $derived(isArchiveFile(item.targetPath ?? item.name));

	// EMM 元数据
	let emmMetadata = $state<{
		translatedTitle?: string;
		tags?: Record<string, string[]>;
		rating?: number;
	} | null>(null);
	// let collectTags = $state<EMMCollectTag[]>([]); // No longer needed locally
	let metadataLoading = $state(false);
	let lastLoadedPath = $state<string | null>(null);

	// 手动标签
	let manualTags = $state<ManualTag[]>([]);

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
	let translationDict = $state<EMMTranslationDict | undefined>(undefined);

	$effect(() => {
		const unsubscribe = emmMetadataStore.subscribe((state) => {
			enableEMM = state.enableEMM;
			translationDict = state.translationDict;
		});
		return unsubscribe;
	});

	// 独立的文件列表标签显示设置（直接从 localStorage 读取，不依赖 emmMetadataStore 初始化）
	let fileListTagDisplayMode = $state<FileListTagDisplayMode>(fileListTagSettings.mode);

	$effect(() => {
		const unsubscribe = fileListTagSettings.subscribe((mode) => {
			fileListTagDisplayMode = mode;
		});
		return unsubscribe;
	});

	// 穿透模式：文件夹显示内部压缩包信息
	let penetrateModeEnabled = $state(false);
	let penetrateShowInnerFile = $state<'none' | 'penetrate' | 'always'>('penetrate');
	let penetrateInnerFileCount = $state<'single' | 'all'>('single');
	let penetratePureMediaFolderOpen = $state(true);
	// 文件夹预览缩略图 URL 数组
	let folderThumbnails = $state<string[]>([]);
	let folderPreviewCandidates = $state<FolderPreviewCandidate[]>([]);
	let folderPreviewLoading = $state(false);
	let folderPreviewRequestId = 0;
	// 文件夹预览网格模式和预览数量
	const folderPreviewGridEnabled = $derived($fileBrowserStore.folderPreviewGrid);
	const folderPreviewCount = $derived($fileBrowserStore.folderPreviewCount);
	// 支持多个内部文件
	let penetrateChildFiles = $state<
		Array<{
			name: string;
			path: string;
			translatedTitle?: string;
			isAiTranslated?: boolean;
		}>
	>([]);
	// 穿透模式：纯媒体文件夹（只包含图片/视频/文本，不包含压缩包和子文件夹）
	let isPureMediaFolder = $state(false);

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
			penetrateInnerFileCount = state.penetrateInnerFileCount;
			penetratePureMediaFolderOpen = state.penetratePureMediaFolderOpen;
		});
		return unsubscribe;
	});

	function toFolderPreviewSource(candidate: FolderPreviewCandidate): ThumbnailSource {
		if (candidate.kind === 'directoryCover') {
			return {
				kind: 'directoryCover',
				dirPath: candidate.path,
				representative: candidate.representative ?? candidate.path,
				fileSize: 0,
				modified: 0
			};
		}

		return { kind: 'file', path: candidate.path, fileSize: 0, modified: 0 };
	}

	function getFolderPreviewThumbKey(candidate: FolderPreviewCandidate): string {
		const source = toFolderPreviewSource(candidate);
		return generateThumbKey(source, 256);
	}

	function toFolderPreviewRequest(candidate: FolderPreviewCandidate): ThumbnailRequest {
		const source = toFolderPreviewSource(candidate);
		return { key: generateThumbKey(source, 256), source, maxSize: 256 };
	}

	// 文件夹多图预览加载
	$effect(() => {
		const isDir = item.isDir;
		const enabled = folderPreviewGridEnabled;
		const count = folderPreviewCount;
		const itemPath = item.path;
		const modified = item.modified ?? 0;

		if (!isDir || !enabled) {
			folderThumbnails = [];
			folderPreviewCandidates = [];
			folderPreviewLoading = false;
			folderPreviewRequestId += 1;
			return;
		}

		const requestId = ++folderPreviewRequestId;
		folderThumbnails = [];
		folderPreviewCandidates = [];
		folderPreviewLoading = true;

		const timeoutId = setTimeout(() => {
			loadFolderPreviewCandidates(itemPath, count, modified)
				.then((candidates) => {
					if (requestId !== folderPreviewRequestId) return;
					folderPreviewCandidates = candidates;
				})
				.catch((error) => {
					if (requestId !== folderPreviewRequestId) return;
					console.debug('加载文件夹预览路径失败:', error);
					folderPreviewCandidates = [];
				})
				.finally(() => {
					if (requestId === folderPreviewRequestId) {
						folderPreviewLoading = false;
					}
				});
		}, 80);

		return () => {
			clearTimeout(timeoutId);
			folderPreviewRequestId += 1;
			folderPreviewLoading = false;
		};
	});

	$effect(() => {
		const isDir = item.isDir;
		const enabled = folderPreviewGridEnabled;
		const itemPath = item.path;
		const candidates = folderPreviewCandidates;

		if (!isDir || !enabled || candidates.length === 0) return;

		void unifiedThumbnailStore.requestThumbnails(
			candidates.map(toFolderPreviewRequest),
			`folder-preview:${itemPath}`,
			'visible'
		);
	});

	const folderPreviewStatus = $derived.by(() => {
		const urls: string[] = [];
		let hasPending = false;

		for (const candidate of folderPreviewCandidates) {
			const entry = unifiedThumbnailStore.getEntry(getFolderPreviewThumbKey(candidate));
			if (entry?.status === 'ready' && entry.url) {
				urls.push(entry.url);
			} else if (!entry || entry.status === 'pending' || entry.status === 'loading') {
				hasPending = true;
			}
		}

		return { urls, hasPending };
	});

	$effect(() => {
		folderThumbnails = folderPreviewStatus.urls;
	});

	const folderPreviewExpectedCount = $derived(
		folderPreviewCandidates.length > 0
			? folderPreviewCandidates.length
			: Math.max(1, Math.min(16, folderPreviewCount))
	);
	const folderPreviewIsLoading = $derived(
		folderPreviewLoading ||
			(folderPreviewCandidates.length > 0 &&
				folderPreviewStatus.urls.length === 0 &&
				folderPreviewStatus.hasPending)
	);

	// 穿透模式：加载文件夹内的压缩包信息（延迟加载避免影响初始渲染）
	$effect(() => {
		// 在 effect 开始时读取所有依赖，确保被追踪
		const showMode = penetrateShowInnerFile;
		const countMode = penetrateInnerFileCount;
		const isPenetrate = penetrateModeEnabled;
		const itemPath = item.path;
		const isDir = item.isDir;

		// 不是文件夹则跳过
		if (!isDir) {
			penetrateChildFiles = [];
			isPureMediaFolder = false;
			return;
		}

		// 配置为 'none' 时不显示
		if (showMode === 'none') {
			penetrateChildFiles = [];
			isPureMediaFolder = false;
			return;
		}

		// 配置为 'penetrate' 时只在穿透模式开启时显示
		if (showMode === 'penetrate' && !isPenetrate) {
			penetrateChildFiles = [];
			isPureMediaFolder = false;
			return;
		}

		// 延迟加载，避免影响初始列表渲染
		const timeoutId = setTimeout(() => {
			// 加载文件夹内容
			FileSystemAPI.browseDirectory(itemPath)
				.then(async (children) => {
					// 检测是否为纯媒体文件夹
					// 反向判断：只要没有子文件夹和压缩包，且有文件，就认为是纯媒体文件夹
					// 这样 .nfo、.ass 等附属文件不会阻止穿透
					const hasSubDir = children.some((c) => c.isDir);
					const hasArchive = children.some((c) => !c.isDir && isArchiveFile(c.name));
					const hasFiles = children.some((c) => !c.isDir);

					// 纯媒体文件夹：无子文件夹、无压缩包、且至少有一个文件
					isPureMediaFolder = !hasSubDir && !hasArchive && hasFiles;

					// 过滤出压缩包文件
					const archives = children.filter((c) => !c.isDir && isArchiveFile(c.name));

					// countMode: 'single' 只处理单个压缩包，'all' 处理所有
					if (countMode === 'single' && archives.length !== 1) {
						penetrateChildFiles = [];
						return;
					}

					if (archives.length === 0) {
						penetrateChildFiles = [];
						return;
					}

					// 先立即显示文件列表（无翻译），然后异步加载翻译
					const initialResults = archives.map((child) => ({
						name: child.name,
						path: child.path,
						translatedTitle: undefined as string | undefined,
						isAiTranslated: false
					}));

					// 立即显示（不等待翻译）
					penetrateChildFiles = initialResults;

					// 异步加载翻译（不阻塞显示）
					Promise.all(
						archives.map(async (child, idx) => {
							let translatedTitle: string | undefined;
							let isAiTranslated = false;

							// 加载 EMM 元数据
							if (enableEMM) {
								try {
									const metadata = await emmMetadataStore.loadMetadataByPath(child.path);
									if (metadata?.translated_title) {
										translatedTitle = metadata.translated_title;
									}
								} catch {
									/* 忽略 */
								}
							}

							// AI 翻译（如果没有 EMM 翻译）
							if (!translatedTitle && aiTranslationEnabled && aiAutoTranslate) {
								const nameWithoutExt = child.name.replace(/\.[^.]+$/, '');
								const childExt = child.name.split('.').pop()?.toLowerCase() || 'archive';
								const cached = aiTranslationStore.getCachedTranslation(nameWithoutExt);
								if (cached) {
									translatedTitle = cached;
									isAiTranslated = true;
								} else if (needsTranslation(nameWithoutExt, aiTargetLanguage)) {
									try {
										const result = await translateText(nameWithoutExt, { fileExtension: childExt });
										if (result.success && result.translated) {
											translatedTitle = result.translated;
											isAiTranslated = true;
										}
									} catch {
										/* 忽略 */
									}
								}
							}

							return { idx, translatedTitle, isAiTranslated };
						})
					).then((updates) => {
						// 更新翻译结果
						const newResults = [...penetrateChildFiles];
						for (const { idx, translatedTitle, isAiTranslated } of updates) {
							if (newResults[idx] && translatedTitle) {
								newResults[idx] = { ...newResults[idx], translatedTitle, isAiTranslated };
							}
						}
						penetrateChildFiles = newResults;
					});
				})
				.catch(() => {
					penetrateChildFiles = [];
					isPureMediaFolder = false;
				});
		}, 50); // 50ms 延迟，让主列表先渲染

		return () => clearTimeout(timeoutId);
	});

	// 评分（文件夹和文件都使用统一的 ratingStore）
	let itemRating = $state<number | null>(null);
	let ratingStoreRef: typeof import('$lib/stores/emm/ratingStore').ratingStore | null = null;

	// 加载评分（仅文件夹使用 ratingStore，压缩包直接从 emmMetadata 获取）
	$effect(() => {
		if (enableEMM && item.path && item.isDir) {
			// 文件夹：从 ratingStore 获取
			import('$lib/stores/emm/ratingStore').then(({ ratingStore }) => {
				ratingStoreRef = ratingStore;
				ratingStore.getRating(item.path).then((rating) => {
					itemRating = rating?.value ?? null;
				});
			});
		} else if (!item.isDir) {
			// 压缩包：评分从 emmMetadata 获取，这里只初始化 ratingStoreRef 用于设置评分
			import('$lib/stores/emm/ratingStore').then(({ ratingStore }) => {
				ratingStoreRef = ratingStore;
			});
			itemRating = null;
		} else {
			itemRating = null;
		}
	});

	// 获取有效评分
	function getEffectiveRating(): number | null {
		// 文件夹：使用 itemRating（从缩略图数据库获取）
		// 文件（压缩包）：直接使用 emmMetadata 中的 rating
		if (item.isDir) {
			return itemRating;
		}
		return emmMetadata?.rating ?? null;
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

			// 同时加载手动标签
			getManualTags(item.path)
				.then((tags) => {
					if (item.path === lastLoadedPath) {
						manualTags = tags;
					}
				})
				.catch((err) => {
					console.debug('[FileItemCard] 手动标签加载失败:', err);
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
		const itemExt = item.isDir ? 'folder' : item.name.split('.').pop()?.toLowerCase() || '';

		// 异步翻译（不阻塞）
		translateText(nameWithoutExt, { fileExtension: itemExt }).then((result) => {
			if (result.success && result.translated && item.path === lastLoadedPath) {
				aiTranslatedTitle = result.translated;
			}
		});
	});

	const displayTagPayload = $derived.by<{
		tags: Array<{
			tag: string;
			isCollect: boolean;
			color?: string;
			display: string;
			isMixedVariant?: boolean;
			isManual?: boolean;
		}>;
		collectCount: number;
	}>(() => {
		if (fileListTagDisplayMode === 'none') {
			return { tags: [], collectCount: 0 };
		}

		const map = $collectTagMap;
		const isMixedEnabled = mixedGenderStore.enabled;

		const collectTagsList: Array<{
			tag: string;
			isCollect: boolean;
			color?: string;
			display: string;
			isMixedVariant?: boolean;
			isManual?: boolean;
		}> = [];
		const manualTagsList: Array<{
			tag: string;
			isCollect: boolean;
			color?: string;
			display: string;
			isMixedVariant?: boolean;
			isManual?: boolean;
		}> = [];
		const normalTagsList: Array<{
			tag: string;
			isCollect: boolean;
			color?: string;
			display: string;
			isMixedVariant?: boolean;
			isManual?: boolean;
		}> = [];

		const addedTagKeys = new Set<string>();
		let collectCount = 0;

		const metadataTags = emmMetadata?.tags;
		if (metadataTags) {
			for (const [category, tagList] of Object.entries(metadataTags) as [string, string[]][]) {
				const shortCategory = getShortNamespaceCached(category);
				for (const tag of tagList) {
					const fullTagKey = normalizeTagKey(`${category}:${tag}`);
					if (addedTagKeys.has(fullTagKey)) continue;
					addedTagKeys.add(fullTagKey);

					let collectTag = map.get(fullTagKey);
					if (!collectTag) {
						collectTag = map.get(normalizeTagKey(tag));
					}

					let matchedByMixed = false;
					let mixedCollectTag = collectTag;
					if (!collectTag && isMixedEnabled && genderCategories.includes(category)) {
						for (const altCat of genderCategories) {
							if (altCat === category) continue;
							const altCollect = map.get(normalizeTagKey(`${altCat}:${tag}`));
							if (altCollect) {
								mixedCollectTag = altCollect;
								matchedByMixed = true;
								break;
							}
						}
					}

					const isCollect = !!collectTag || matchedByMixed;
					if (fileListTagDisplayMode === 'collect' && !isCollect) continue;

					const translatedTag = translateTagCached(tag, category, translationDict);
					const tagItem = {
						tag: `${category}:${tag}`,
						isCollect,
						color:
							collectTag?.color ||
							(matchedByMixed ? mixedCollectTag?.color : categoryColors[category]),
						display: `${shortCategory}:${translatedTag}`,
						isMixedVariant: matchedByMixed,
						isManual: false
					};

					if (isCollect) {
						collectCount += 1;
						collectTagsList.push(tagItem);
					} else {
						normalTagsList.push(tagItem);
					}
				}
			}
		}

		for (const mt of manualTags) {
			const fullTagKey = normalizeTagKey(`${mt.namespace}:${mt.tag}`);
			if (addedTagKeys.has(fullTagKey)) continue;
			addedTagKeys.add(fullTagKey);

			const translatedTag = translateTagCached(mt.tag, mt.namespace, translationDict);
			manualTagsList.push({
				tag: `${mt.namespace}:${mt.tag}`,
				isCollect: false,
				color: categoryColors[mt.namespace] || '#10b981',
				display: `${getShortNamespaceCached(mt.namespace)}:${translatedTag}`,
				isMixedVariant: false,
				isManual: true
			});
		}

		return { tags: [...collectTagsList, ...manualTagsList, ...normalTagsList], collectCount };
	});

	const displayTags = $derived(() => displayTagPayload.tags);

	// 当 displayTags 计算完成后，更新 collectTagCount 到缓存（用于排序）
	let lastCollectTagCount = $state<number | null>(null);

	$effect(() => {
		// 只对压缩包（book）更新 collectTagCount
		if (!isArchive || item.isDir) return;

		const collectCount = displayTagPayload.collectCount;
		if (lastCollectTagCount === collectCount) return;
		lastCollectTagCount = collectCount;
		collectTagCountStore.setCount(item.path, collectCount);
	});

	// 文件夹预览相关
	let showPreview = $state(false);
	let previewItems = $state<FsItem[]>([]);
	let previewLoading = $state(false);
	let previewIconElement = $state<HTMLElement | null>(null);
	let folderTotalSize = $state<number | null>(null);
	let folderSizeLoading = $state(false);
	let folderSizeRequestId = 0;
	let lastFolderPath = $state<string | null>(null);

	$effect(() => {
		if (!item.isDir) return;
		if (lastFolderPath === item.path) return;
		lastFolderPath = item.path;
		folderTotalSize = null;
		folderSizeLoading = false;
	});

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
	// 使用黑名单机制避免对系统保护文件夹的重复请求
	$effect(() => {
		if (!showSizeAndModified) return;
		if (!item.isDir) return;
		if (penetrateModeEnabled) return;
		if (folderTotalSize !== null || folderSizeLoading) return;

		const requestPath = item.path;
		const cached = getCachedFolderSize(requestPath, item.modified);
		if (cached !== null) {
			folderTotalSize = cached;
			folderSizeLoading = false;
			return;
		}

		// 检查路径是否在黑名单中（系统保护文件夹或用户排除路径）
		if (isPathBlacklisted(requestPath)) {
			folderTotalSize = 0; // 设置为0避免重复请求
			setFolderSizeCache(requestPath, 0, item.modified);
			return;
		}

		const requestId = ++folderSizeRequestId;
		folderSizeLoading = true;
		getFolderSizeSmart(requestPath, { modifiedHint: item.modified, allowStale: true })
			.then((size) => {
				if (requestId !== folderSizeRequestId) return;
				folderTotalSize = size;
			})
			.catch((err) => {
				if (requestId !== folderSizeRequestId) return;
				// 访问失败时添加到运行时黑名单，避免重复请求
				addToRuntimeBlacklist(requestPath);
				setFolderSizeCache(requestPath, 0, item.modified);
				folderTotalSize = 0; // 设置为0避免重复请求
				console.debug('获取文件夹总大小失败（已加入黑名单）:', requestPath, err);
			})
			.finally(() => {
				if (requestId !== folderSizeRequestId) return;
				folderSizeLoading = false;
			});
	});

	const isReadCompleted = $derived(
		currentPage !== undefined &&
			totalPages !== undefined &&
			totalPages > 0 &&
			currentPage >= totalPages - 1
	);

	// 穿透模式：内部压缩包信息（独立显示，不覆盖文件夹标题）
	// 支持多个内部文件
	const penetrateInfoList = $derived.by(() => {
		if (!item.isDir || penetrateChildFiles.length === 0) return [];

		return penetrateChildFiles.map((child) => {
			const childNameWithoutExt = child.name.replace(/\.[^.]+$/, '');
			return {
				originalName: childNameWithoutExt,
				translatedTitle: child.translatedTitle,
				isAiTranslated: child.isAiTranslated || false
			};
		});
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
		{folderThumbnails}
		{folderPreviewGridEnabled}
		folderPreviewLoading={folderPreviewIsLoading}
		{folderPreviewExpectedCount}
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
		{penetrateInfoList}
		{isPureMediaFolder}
		folderAverageRating={itemRating}
		folderManualRating={null}
		{displayTags}
		{getEffectiveRating}
		{showPreview}
		{previewLoading}
		{previewItems}
		bind:previewIconElement
		onClick={() => {
			// 穿透模式下，纯媒体文件夹点击直接作为 book 打开（需要开启配置）
			if (penetrateModeEnabled && penetratePureMediaFolderOpen && isPureMediaFolder && item.isDir) {
				onOpenAsBook?.();
			} else {
				onClick?.();
			}
		}}
		onDoubleClick={() => {
			// 双击文件夹进入内部
			if (item.isDir) {
				onOpenAsBook?.();
			} else {
				onDoubleClick?.();
			}
		}}
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
		{folderThumbnails}
		{folderPreviewGridEnabled}
		folderPreviewLoading={folderPreviewIsLoading}
		{folderPreviewExpectedCount}
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
		{isPureMediaFolder}
		folderAverageRating={itemRating}
		folderManualRating={null}
		{displayTags}
		{getEffectiveRating}
		onClick={() => {
			// 穿透模式下，纯媒体文件夹点击直接作为 book 打开（需要开启配置）
			if (penetrateModeEnabled && penetratePureMediaFolderOpen && isPureMediaFolder && item.isDir) {
				onOpenAsBook?.();
			} else {
				onClick?.();
			}
		}}
		onDoubleClick={() => {
			// 双击文件夹进入内部
			if (item.isDir) {
				onOpenAsBook?.();
			} else {
				onDoubleClick?.();
			}
		}}
		{onContextMenu}
		{onOpenAsBook}
		onSetRating={handleSetRating}
	/>
{/if}
