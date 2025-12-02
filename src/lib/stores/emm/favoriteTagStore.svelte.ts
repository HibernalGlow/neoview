/**
 * 收藏标签存储
 * 管理用户收藏的 EMM 标签，用于快速搜索
 */

const STORAGE_KEY = 'neoview-emm-favorite-tags';

// 类别到字母的映射
export const cat2letter: Record<string, string> = {
	language: 'l',
	parody: 'p',
	character: 'c',
	group: 'g',
	artist: 'a',
	female: 'f',
	male: 'm',
	mixed: 'x',
	other: 'o',
	cosplayer: 'cos',
	category: 'cat'
};

// 字母到类别的映射
export const letter2cat: Record<string, string> = Object.fromEntries(
	Object.entries(cat2letter).map(([k, v]) => [v, k])
);

// 类别颜色映射
export const categoryColors: Record<string, string> = {
	female: '#FF6B9D',
	male: '#5B8DEF',
	mixed: '#9B59B6',
	parody: '#E67E22',
	character: '#27AE60',
	artist: '#3498DB',
	group: '#1ABC9C',
	language: '#95A5A6',
	other: '#7F8C8D',
	cosplayer: '#E91E63',
	category: '#FF9800'
};

export interface FavoriteTag {
	id: string; // `${cat}:${tag}`
	cat: string; // 类别，如 female, male, parody
	tag: string; // 标签名，如 loli, shotacon
	letter: string; // 类别字母，如 f, m, p
	display: string; // 显示文本，如 "女性:萝莉"
	value: string; // 搜索值，如 f:"loli"$
	color: string; // 标签颜色
}

// 收藏标签状态
let favoriteTags = $state<FavoriteTag[]>([]);

// 从 localStorage 加载
function loadTags(): FavoriteTag[] {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			return JSON.parse(saved);
		}
	} catch (e) {
		console.error('加载收藏标签失败:', e);
	}
	return [];
}

// 保存到 localStorage
function saveTags(tags: FavoriteTag[]) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
	} catch (e) {
		console.error('保存收藏标签失败:', e);
	}
}

// 初始化
favoriteTags = loadTags();

/**
 * 创建标签值字符串
 */
export function createTagValue(cat: string, tag: string): string {
	const letter = cat2letter[cat] || cat.charAt(0);
	return `${letter}:"${tag}"$`;
}

/**
 * 解析标签值字符串
 */
export function parseTagValue(value: string): { letter: string; tag: string } | null {
	const match = value.match(/^([a-z]+):"([^"]+)"\$$/);
	if (match) {
		return { letter: match[1], tag: match[2] };
	}
	return null;
}

/**
 * 从搜索字符串中解析所有标签
 */
export function parseSearchTags(searchString: string): Array<{ cat: string; tag: string; letter: string; prefix: string }> {
	const tags: Array<{ cat: string; tag: string; letter: string; prefix: string }> = [];
	if (!searchString) return tags;

	// 匹配模式: (可选前缀 ~ 或 -)(字母):"(标签)"$
	const pattern = /(~|-)?([a-z]+):"([^"]+)"\$/g;
	let match;

	while ((match = pattern.exec(searchString)) !== null) {
		const prefix = match[1] || '';
		const letter = match[2];
		const tag = match[3];
		const cat = letter2cat[letter] || letter;

		tags.push({ cat, tag, letter, prefix });
	}

	return tags;
}

/**
 * 收藏标签 Store
 */
export const favoriteTagStore = {
	// 获取所有收藏标签
	get tags() {
		return favoriteTags;
	},

	// 按类别分组获取标签
	get groupedTags(): Array<{ name: string; tags: FavoriteTag[] }> {
		const groups: Record<string, FavoriteTag[]> = {};

		for (const tag of favoriteTags) {
			const category = tag.cat;
			if (!groups[category]) {
				groups[category] = [];
			}
			groups[category].push(tag);
		}

		// 按类别名称排序
		return Object.entries(groups)
			.map(([name, tags]) => ({ name, tags }))
			.sort((a, b) => a.name.localeCompare(b.name));
	},

	// 添加收藏标签
	add(cat: string, tag: string, displayCat?: string, displayTag?: string) {
		const id = `${cat}:${tag}`;
		
		// 检查是否已存在
		if (favoriteTags.some(t => t.id === id)) {
			return false;
		}

		const letter = cat2letter[cat] || cat.charAt(0);
		const color = categoryColors[cat] || '#409EFF';
		const display = `${displayCat || cat}:${displayTag || tag}`;
		const value = createTagValue(cat, tag);

		const newTag: FavoriteTag = {
			id,
			cat,
			tag,
			letter,
			display,
			value,
			color
		};

		favoriteTags = [...favoriteTags, newTag];
		saveTags(favoriteTags);
		return true;
	},

	// 移除收藏标签
	remove(id: string) {
		const index = favoriteTags.findIndex(t => t.id === id);
		if (index >= 0) {
			favoriteTags = favoriteTags.filter(t => t.id !== id);
			saveTags(favoriteTags);
			return true;
		}
		return false;
	},

	// 检查是否已收藏
	isFavorite(cat: string, tag: string): boolean {
		const id = `${cat}:${tag}`;
		return favoriteTags.some(t => t.id === id);
	},

	// 切换收藏状态
	toggle(cat: string, tag: string, displayCat?: string, displayTag?: string): boolean {
		const id = `${cat}:${tag}`;
		if (this.isFavorite(cat, tag)) {
			this.remove(id);
			return false;
		} else {
			this.add(cat, tag, displayCat, displayTag);
			return true;
		}
	},

	// 清空所有收藏
	clear() {
		favoriteTags = [];
		saveTags(favoriteTags);
	},

	// 导入收藏标签
	import(tags: FavoriteTag[]) {
		favoriteTags = tags;
		saveTags(favoriteTags);
	},

	// 导出收藏标签
	export(): FavoriteTag[] {
		return [...favoriteTags];
	}
};

// 导出响应式引用
export const getFavoriteTags = () => favoriteTags;
