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
	// 执行搜索
	async function handleSearch(keyword: string) {
		if (!keyword.trim()) {
			folderTabActions.clearSearch();
			return;
		}

		folderTabActions.setSearchKeyword(keyword);
		folderTabActions.setIsSearching(true);
		folderTabActions.setSearchResults([]);

		const path = get(tabCurrentPath);
		if (!path || isVirtualPath(path)) {
			folderTabActions.setIsSearching(false);
			return;
		}

		try {
			// 检查是否包含标签搜索
			const hasTagInSearch = hasTagSearch(keyword);
			const searchSettings = get(tabSearchSettings);

			if (hasTagInSearch) {
				// 标签搜索模式
				const tags = parseSearchTags(keyword);
				const textPart = removeTagsFromSearch(keyword);

				if (tags.length > 0) {
					const results: FsItem[] = await invoke('search_emm_items', {
						searchPath: path,
						searchTags: tags,
						searchText: textPart.trim(),
						includeSubfolders: searchSettings.includeSubfolders
					});
					folderTabActions.setSearchResults(results);
				}
			} else {
				// 普通文本搜索
				const items = await directoryTreeCache.getDirectory(path);
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
