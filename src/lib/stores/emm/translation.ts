/**
 * EMM 翻译管理
 * 负责标签翻译和命名空间缩写
 */

import type { EMMTranslationDict } from '$lib/api/emm';

// 命名空间缩写映射
const NAMESPACE_ABBREVIATIONS: Record<string, string> = {
	'language': 'l',
	'parody': 'p',
	'character': 'c',
	'group': 'g',
	'artist': 'a',
	'male': 'm',
	'female': 'f',
	'mixed': 'x',
	'reclass': 'r',
	'cosplayer': 'cos',
	'other': 'o'
};

// 反向映射：缩写 -> 全称
const ABBREVIATION_TO_NAMESPACE: Record<string, string> = Object.entries(NAMESPACE_ABBREVIATIONS)
	.reduce((acc, [k, v]) => {
		acc[v] = k;
		return acc;
	}, {} as Record<string, string>);

export const emmTranslationStore = {
	/**
	 * 获取命名空间缩写
	 */
	getShortNamespace(namespace: string): string {
		const lower = namespace.toLowerCase();
		return NAMESPACE_ABBREVIATIONS[lower] || namespace;
	},

	/**
	 * 获取命名空间全称
	 */
	getFullNamespace(short: string): string {
		const lower = short.toLowerCase();
		return ABBREVIATION_TO_NAMESPACE[lower] || short;
	},

	/**
	 * 翻译标签
	 * @param tag 标签名 (e.g. "full color")
	 * @param namespace 命名空间 (e.g. "language" or "l")
	 * @param dict 翻译字典
	 */
	translateTag(tag: string, namespace: string | undefined, dict: EMMTranslationDict | undefined): string {
		if (!dict || !namespace) return tag;

		// 尝试获取全称命名空间
		const fullNamespace = this.getFullNamespace(namespace);

		// 查找该命名空间的翻译
		const nsDict = dict[fullNamespace];
		if (!nsDict) return tag;

		// 查找标签翻译
		const record = nsDict[tag];
		if (record && record.name) {
			return record.name;
		}

		return tag;
	}
};
