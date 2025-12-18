/**
 * useSearchActions - 搜索相关操作
 * 注意：此模块只处理普通文件系统路径的后端搜索
 * 虚拟路径（书签/历史）的前端搜索在 ToolbarCard 中处理
 */

import { get } from 'svelte/store';
import { apiPost, apiGet } from '$lib/api/http-bridge';
import type { FsItem } from '$lib/types';
import {
	folderTabActions,
	tabSearchSettings,
	tabCurrentPath,
	VIRTUAL_PATHS
} from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { emmMetadataStore } from '$lib/stores/emmMetadata.svelte';
import { mixedGenderStore, hasTagSearch, parseSearchTags, removeTagsFromSearch } from '$lib/stores/emm/favoriteTagStore.svelte';
import { searchByManualTag } from '$lib/stores/emm/manualTagStore.svelte';
import type { SearchSettings } from '../types';

/**
 * 创建搜索操作
 */
export function createSearchActions() {
	/**
	 * 后端搜索 - 只用于普通文件系统路径
	 * 在新标签页中显示搜索结果
	 */
	async function handleSearch(keyword: string) {
		if (!keyword.trim()) {
			folderTabActions.clearSearch();
			return;
		}

		const searchPath = get(tabCurrentPath);
		if (!searchPath) {
			console.error('[useSearchActions] 搜索路径为空');
			return;
		}

		// 保存当前搜索设置
		const searchSettings = get(tabSearchSettings);

		console.log('[useSearchActions] 后端搜索', { searchPath, keyword, searchSettings });
		
		// 在当前标签页显示搜索中状态
		folderTabActions.setIsSearching(true);
		folderTabActions.setSearchKeyword(keyword);

		try {
			let results: FsItem[] = [];
			
			// 检查是否包含标签搜索
			const hasTagInSearch = hasTagSearch(keyword);

			if (hasTagInSearch) {
				// 标签搜索模式 - 使用后端 search_by_tags
				const tags = parseSearchTags(keyword);
				const textPart = removeTagsFromSearch(keyword);

				if (tags.length > 0) {
					// 转换为后端期望的格式: [namespace, tag, prefix]
					const searchTags: [string, string, string][] = tags.map(t => [t.cat, t.tag, t.prefix]);
					
					// 获取 EMM 数据库路径
					const dbPaths = emmMetadataStore.getDatabasePaths();
					
					console.log('[useSearchActions] 标签搜索', { searchTags, textPart, enableMixed: mixedGenderStore.enabled, dbPaths });
					
					// 调用后端标签搜索（直接查询 EMM 数据库）
					const emmMatchedPaths: string[] = await invoke('search_by_tags_from_emm', {
						dbPaths,
						searchTags,
						enableMixedGender: mixedGenderStore.enabled,
						basePath: searchSettings.includeSubfolders ? searchPath : null
					});
					
					// 同时搜索手动标签
					const manualMatchedPaths: string[] = [];
					for (const t of tags) {
						const paths = searchByManualTag(t.cat || null, t.tag);
						manualMatchedPaths.push(...paths);
					}
					
					// 合并 EMM 和手动标签搜索结果（去重）
					const allMatchedPaths = [...new Set([...emmMatchedPaths, ...manualMatchedPaths])];
					console.log('[useSearchActions] EMM结果:', emmMatchedPaths.length, '手动标签结果:', manualMatchedPaths.length);
					
					// 将路径转换为 FsItem（获取文件信息）
					if (allMatchedPaths.length > 0) {
						const matchedPaths = allMatchedPaths;
						// 如果有文本部分，再过滤
						const filteredPaths = textPart.trim()
							? matchedPaths.filter(p => p.toLowerCase().includes(textPart.toLowerCase()))
							: matchedPaths;
						
						// 限制结果数量，避免性能问题
						const limitedPaths = filteredPaths.slice(0, 200);
						
						// 批量获取文件信息
						const fileInfoResults = await Promise.allSettled(
							limitedPaths.map(path => invoke<FsItem>('get_file_info', { path }))
						);
						
						// 处理结果，失败的使用基本信息
						const archiveExts = ['zip', 'rar', '7z', 'cbz', 'cbr', 'cb7', 'epub'];
						const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'jxl'];
						
						results = limitedPaths.map((path, index) => {
							const result = fileInfoResults[index];
							if (result.status === 'fulfilled' && result.value) {
								return result.value;
							}
							// 回退到基本信息
							const name = path.split(/[\\/]/).pop() || path;
							const ext = name.split('.').pop()?.toLowerCase() || '';
							const isArchive = archiveExts.includes(ext);
							const isImage = imageExts.includes(ext);
							const isDir = !isArchive && !isImage && !ext;
							
							return {
								name,
								path,
								isDir,
								isImage,
								size: 0,
								modified: 0,
								created: 0
							} as FsItem;
						});
					}
					console.log('[useSearchActions] 标签搜索结果:', results.length);
				}
			} else {
				// 普通文本搜索 - 使用后端文件搜索
				console.log('[useSearchActions] 后端文件搜索', { searchPath, keyword });
				results = await invoke('search_files', {
					path: searchPath,
					query: keyword,
					options: {
						includeSubfolders: searchSettings.includeSubfolders,
						searchInPath: searchSettings.searchInPath
					}
				});
				console.log('[useSearchActions] 文件搜索结果:', results.length);
			}
			
			// 搜索完成：先设置结果，再创建新标签页
			folderTabActions.setSearchResults(results);
			
			// 清除当前标签页的搜索状态
			folderTabActions.setIsSearching(false);
			folderTabActions.clearSearch();
			
			// 创建新标签页显示搜索结果（此时 searchResults 已有数据）
			folderTabActions.createTab(VIRTUAL_PATHS.SEARCH);
			folderTabActions.setSearchKeyword(keyword);
			
		} catch (err) {
			console.error('[useSearchActions] 后端搜索失败:', err);
			folderTabActions.setIsSearching(false);
		}
	}

	// 处理搜索设置变化
	function handleSearchSettingsChange(settings: Partial<SearchSettings>) {
		folderTabActions.setSearchSettings(settings);
	}

	// 清除搜索
	function clearSearch() {
		folderTabActions.clearSearch();
	}

	return {
		handleSearch,
		handleSearchSettingsChange,
		clearSearch
	};
}

export type SearchActions = ReturnType<typeof createSearchActions>;
