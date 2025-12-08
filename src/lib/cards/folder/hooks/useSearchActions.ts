/**
 * useSearchActions - 搜索相关操作
 * 注意：此模块只处理普通文件系统路径的后端搜索
 * 虚拟路径（书签/历史）的前端搜索在 ToolbarCard 中处理
 */

import { get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import {
	folderTabActions,
	tabCurrentPath,
	tabSearchSettings
} from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import {
	parseSearchTags,
	hasTagSearch,
	removeTagsFromSearch,
	mixedGenderStore
} from '$lib/stores/emm/favoriteTagStore.svelte';
import type { FsItem } from '$lib/types';
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
		
		// 清除当前标签页的搜索状态，保持正常浏览状态
		folderTabActions.clearSearch();

		// 创建新标签页用于显示搜索结果
		folderTabActions.createTab(searchPath);

		// 在新标签页中设置搜索状态（createTab 已经激活了新标签）
		folderTabActions.setSearchKeyword(keyword);
		folderTabActions.setIsSearching(true);
		folderTabActions.setSearchResults([]);

		try {
			// 检查是否包含标签搜索
			const hasTagInSearch = hasTagSearch(keyword);

			if (hasTagInSearch) {
				// 标签搜索模式 - 使用后端 search_by_tags
				const tags = parseSearchTags(keyword);
				const textPart = removeTagsFromSearch(keyword);

				if (tags.length > 0) {
					// 转换为后端期望的格式: [namespace, tag, prefix]
					const searchTags: [string, string, string][] = tags.map(t => [t.cat, t.tag, t.prefix]);
					
					console.log('[useSearchActions] 标签搜索', { searchTags, textPart, enableMixed: mixedGenderStore.enabled });
					
					// 调用后端标签搜索，返回匹配的路径列表
					const matchedPaths: string[] = await invoke('search_by_tags', {
						searchTags,
						enableMixedGender: mixedGenderStore.enabled,
						basePath: searchSettings.includeSubfolders ? searchPath : null
					});
					
					// 将路径转换为 FsItem（获取文件信息）
					let results: FsItem[] = [];
					if (matchedPaths.length > 0) {
						// 如果有文本部分，再过滤
						const filteredPaths = textPart.trim()
							? matchedPaths.filter(p => p.toLowerCase().includes(textPart.toLowerCase()))
							: matchedPaths;
						
						// 限制结果数量，避免性能问题
						const limitedPaths = filteredPaths.slice(0, 200);
						
						// 转换为 FsItem - 根据扩展名判断类型
						const archiveExts = ['zip', 'rar', '7z', 'cbz', 'cbr', 'cb7', 'epub'];
						const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'jxl'];
						
						results = limitedPaths.map(path => {
							const name = path.split(/[\\/]/).pop() || path;
							const ext = name.split('.').pop()?.toLowerCase() || '';
							const isArchive = archiveExts.includes(ext);
							const isImage = imageExts.includes(ext);
							const isDir = !isArchive && !isImage && !ext; // 没有扩展名视为文件夹
							
							return {
								name,
								path,
								isDir,
								isImage,
								size: 0,
								modified: Date.now(),
								created: Date.now()
							} as FsItem;
						});
					}
					
					console.log('[useSearchActions] 标签搜索结果:', results.length);
					folderTabActions.setSearchResults(results);
				}
			} else {
				// 普通文本搜索 - 使用后端文件搜索
				console.log('[useSearchActions] 后端文件搜索', { searchPath, keyword });
				const results: FsItem[] = await invoke('search_files', {
					path: searchPath,
					query: keyword,
					options: {
						includeSubfolders: searchSettings.includeSubfolders,
						searchInPath: searchSettings.searchInPath
					}
				});
				folderTabActions.setSearchResults(results);
			}
		} catch (err) {
			console.error('[useSearchActions] 后端搜索失败:', err);
			folderTabActions.setSearchResults([]);
		} finally {
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
