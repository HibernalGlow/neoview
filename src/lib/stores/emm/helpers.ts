/**
 * EMM 辅助函数
 * 标签匹配和检测逻辑
 */

import type { EMMCollectTag } from '$lib/api/emm';

/**
 * 检查标签是否为收藏标签（内部函数）
 */
export function isCollectTag(tag: string, collectTags: EMMCollectTag[]): EMMCollectTag | null {
	for (const ct of collectTags) {
		if (ct.tag === tag || ct.display === tag) {
			return ct;
		}
	}
	return null;
}

/**
 * 检查标签是否为收藏标签（详细匹配）
 */
export function isCollectTagHelper(tag: string, collectTags: EMMCollectTag[]): EMMCollectTag | null {
	const normalize = (value?: string | null) => value ? value.trim().toLowerCase() : '';
	const inputNormalized = normalize(tag);
	const hasCategory = tag.includes(':');
	const [inputCategoryRaw, inputTagRaw] = hasCategory ? tag.split(':', 2) : ['', tag];
	const inputCategoryNormalized = normalize(inputCategoryRaw);
	const inputTagOnlyNormalized = normalize(inputTagRaw);

	for (const ct of collectTags) {
		const idNormalized = normalize(ct.id);
		const displayNormalized = normalize(ct.display);
		const tagNormalized = normalize(ct.tag);
		const letterNormalized = normalize(ct.letter);

		// Parse category from display if possible (e.g. "female:stirrup legwear")
		const displayHasCategory = ct.display?.includes(':');
		const [displayCategoryRaw, displayTagRaw] = displayHasCategory 
			? ct.display.split(':', 2) 
			: ['', ct.display];
		const displayCategoryNormalized = normalize(displayCategoryRaw);
		const displayTagNormalized = normalize(displayTagRaw);

		// 1. Exact Match (ID or Display)
		if (idNormalized && idNormalized === inputNormalized) return ct;
		if (displayNormalized && displayNormalized === inputNormalized) return ct;

		// 2. Tag Name Match (most common case)
		if (!hasCategory && tagNormalized === inputNormalized) return ct;

		// 3. Category:Tag Match
		if (hasCategory) {
			// Match against Display (category:tag)
			if (displayHasCategory && 
				displayCategoryNormalized === inputCategoryNormalized && 
				displayTagNormalized === inputTagOnlyNormalized) return ct;

			// Match against Letter:Tag (e.g. "f:stirrup legwear")
			if (letterNormalized && 
				letterNormalized === inputCategoryNormalized && 
				tagNormalized === inputTagOnlyNormalized) return ct;

			// Match against Tag only
			if (tagNormalized === inputTagOnlyNormalized) return ct;
		}
	}

	return null;
}
