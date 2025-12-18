/**
 * useTagActions - 标签相关操作
 */

import { apiPost, apiGet } from '$lib/api/http-bridge';
import {
	favoriteTagStore,
	createTagValue,
	cat2letter,
	categoryColors,
	type FavoriteTag
} from '$lib/stores/emm/favoriteTagStore.svelte';
import { emmTranslationStore } from '$lib/stores/emm/translation';
import {
	findEMMTranslationFile,
	loadEMMTranslationDict,
	type EMMTranslationDict
} from '$lib/api/emm';

// 随机标签类型
export interface RandomTag extends FavoriteTag {
	isCollect: boolean;
}

// 翻译字典缓存
let translationDictCache: EMMTranslationDict | null = null;

/**
 * 加载翻译字典（带缓存）
 */
async function loadTranslationDict(): Promise<EMMTranslationDict> {
	if (translationDictCache) return translationDictCache;

	const filePath = await findEMMTranslationFile();
	if (!filePath) return {};

	translationDictCache = await loadEMMTranslationDict(filePath);
	return translationDictCache;
}

/**
 * 创建标签操作
 */
export function createTagActions(
	getSearchKeyword: () => string,
	setSearchKeyword: (keyword: string) => void
) {
	// 随机标签列表
	let randomTags = $state<RandomTag[]>([]);

	// 刷新随机标签
	async function refreshRandomTags() {
		try {
			const dict = await loadTranslationDict();
			const dbTags: [string, string][] = await invoke('get_random_emm_tags', { count: 10 });
			const collectTagIds = new Set(favoriteTagStore.tags.map((t) => t.id));

			const normalTags: RandomTag[] = dbTags
				.filter(([cat, tag]) => !collectTagIds.has(`${cat}:${tag}`))
				.map(([cat, tag]) => {
					const letter = cat2letter[cat] || cat[0];
					const translated = emmTranslationStore.translateTag(tag, cat, dict);
					return {
						id: `${cat}:${tag}`,
						cat,
						tag,
						letter,
						display: `${letter}:${translated}`,
						value: createTagValue(cat, tag),
						color: categoryColors[cat] || '#888',
						isCollect: false
					};
				});

			const collectTags: RandomTag[] = favoriteTagStore.tags
				.sort(() => Math.random() - 0.5)
				.slice(0, 3)
				.map((t) => ({ ...t, isCollect: true }));

			randomTags = [...collectTags, ...normalTags].slice(0, 8);
		} catch (err) {
			console.warn('[TagActions] 获取随机标签失败:', err);
			const allTags = favoriteTagStore.tags;
			const count = Math.min(5, allTags.length);
			randomTags = [...allTags]
				.sort(() => Math.random() - 0.5)
				.slice(0, count)
				.map((t) => ({ ...t, isCollect: true }));
		}
	}

	// 添加标签到搜索框
	function appendTagToSearch(tag: FavoriteTag, modifier: string = '') {
		const tagValue = modifier + tag.value;
		const currentKeyword = getSearchKeyword() || '';
		const newKeyword = currentKeyword ? `${currentKeyword} ${tagValue}` : tagValue;
		setSearchKeyword(newKeyword);
	}

	// 点击随机标签触发搜索
	function handleRandomTagClick(tag: FavoriteTag, handleSearch: (keyword: string) => void) {
		handleSearch(tag.value);
	}

	return {
		get randomTags() { return randomTags; },
		refreshRandomTags,
		appendTagToSearch,
		handleRandomTagClick
	};
}

export type TagActions = ReturnType<typeof createTagActions>;
