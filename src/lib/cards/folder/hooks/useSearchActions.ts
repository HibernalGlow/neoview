/**
 * useSearchActions - 搜索相关操作
 */

import { get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import {
	folderTabActions,
	tabCurrentPath,
	tabSearchSettings,
	isVirtualPath
} from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { directoryTreeCache } from '$lib/components/panels/folderPanel/utils/directoryTreeCache';
import { loadVirtualPathData } from '$lib/components/panels/folderPanel/utils/virtualPathLoader';
import {
	parseSearchTags,
	hasTagSearch,
	removeTagsFromSearch
} from '$lib/stores/emm/favoriteTagStore.svelte';
import type { FsItem } from '$lib/types';
import type { SearchSettings } from '../types';

/**
 * 创建搜索操作
 */
export function createSearchActions() {
	// 执行搜索 - 普通路径在新标签页显示，虚拟路径在当前标签页前端过滤
	async function handleSearch(keyword: string) {
		if (!keyword.trim()) {
			folderTabActions.clearSearch();
			return;
		}

		const searchPath = get(tabCurrentPath);
		if (!searchPath) {
			return;
		}

		// 保存当前搜索设置
		const searchSettings = get(tabSearchSettings);

		// 虚拟路径（书签/历史）：在当前标签页进行前端过滤
		if (isVirtualPath(searchPath)) {
			folderTabActions.setSearchKeyword(keyword);
			folderTabActions.setIsSearching(true);

			try {
				// 从虚拟路径加载数据
				const items = loadVirtualPathData(searchPath);
				const lowerKeyword = keyword.toLowerCase();
				
				// 前端过滤：按文件名和路径匹配
				const results = items.filter(item => 
					item.name.toLowerCase().includes(lowerKeyword) ||
					item.path.toLowerCase().includes(lowerKeyword)
				);
				folderTabActions.setSearchResults(results);
			} catch (err) {
				console.error('[Search] 虚拟路径搜索失败:', err);
				folderTabActions.setSearchResults([]);
			} finally {
				folderTabActions.setIsSearching(false);
			}
			return;
		}

		// 普通文件系统路径：在新标签页显示搜索结果
		console.log('[useSearchActions] 普通路径搜索', { searchPath, keyword });
		
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
				// 标签搜索模式
				const tags = parseSearchTags(keyword);
				const textPart = removeTagsFromSearch(keyword);

				if (tags.length > 0) {
					const results: FsItem[] = await invoke('search_emm_items', {
						searchPath: searchPath,
						searchTags: tags,
						searchText: textPart.trim(),
						includeSubfolders: searchSettings.includeSubfolders
					});
					folderTabActions.setSearchResults(results);
				}
			} else {
				// 普通文本搜索
				const items = await directoryTreeCache.getDirectory(searchPath);
				const lowerKeyword = keyword.toLowerCase();
				const results = items.filter(item => 
					item.name.toLowerCase().includes(lowerKeyword)
				);
				folderTabActions.setSearchResults(results);
			}
		} catch (err) {
			console.error('[Search] 搜索失败:', err);
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
