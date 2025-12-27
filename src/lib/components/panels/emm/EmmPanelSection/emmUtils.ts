/**
 * EMM 面板工具函数和常量
 * 从 EmmPanelSection.svelte 提取的可重用代码
 */

/** EMM 字段类型 */
export type EMMFieldType = 'string' | 'path' | 'url' | 'datetime' | 'timestamp' | 'number' | 'boolean';

/** EMM 字段元数据配置 */
export const EMM_FIELD_META: Record<string, { label: string; type: EMMFieldType }> = {
	bundleSize: { label: '打包大小', type: 'number' },
	category: { label: '类别', type: 'string' },
	coverHash: { label: '封面哈希', type: 'string' },
	coverPath: { label: '封面路径', type: 'path' },
	createdAt: { label: '创建时间', type: 'datetime' },
	updatedAt: { label: '更新时间', type: 'datetime' },
	mtime: { label: '修改时间', type: 'datetime' },
	exist: { label: '存在', type: 'boolean' },
	filecount: { label: '文件数', type: 'number' },
	filepath: { label: '文件路径', type: 'path' },
	filesize: { label: '文件大小', type: 'number' },
	hash: { label: '哈希', type: 'string' },
	hiddenBook: { label: '隐藏书籍', type: 'boolean' },
	id: { label: 'ID', type: 'string' },
	mark: { label: '标记', type: 'number' },
	pageCount: { label: '页数', type: 'number' },
	posted: { label: '发布时间', type: 'timestamp' },
	readCount: { label: '阅读次数', type: 'number' },
	title: { label: '标题', type: 'string' },
	title_jpn: { label: '日文标题', type: 'string' },
	type: { label: '类型', type: 'string' },
	url: { label: '链接', type: 'url' },
	rating: { label: '评分', type: 'number' },
	status: { label: '状态', type: 'string' },
	date: { label: '日期', type: 'timestamp' }
};

/**
 * 获取字段元数据
 */
export function getFieldMeta(key: string): { label: string; type: EMMFieldType } {
	return EMM_FIELD_META[key] || { label: key, type: 'string' };
}

/**
 * 格式化文件大小（数字版本）
 */
export function formatFileSizeNumber(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return String(bytes);
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * 格式化日期时间（ISO 格式字符串）
 */
export function formatDateTime(value: string): string {
	const d = new Date(value);
	if (!Number.isFinite(d.getTime())) return value;
	return d.toLocaleString('zh-CN');
}

/**
 * 格式化时间戳（秒级别）
 */
export function formatTimestampSeconds(value: string): string {
	const n = Number(value);
	if (!Number.isFinite(n)) return value;
	const d = new Date(n * 1000);
	if (!Number.isFinite(d.getTime())) return value;
	return d.toLocaleString('zh-CN');
}

/**
 * 格式化数字值（根据字段类型）
 */
export function formatNumberValue(key: string, value: string): string {
	const n = Number(value);
	if (!Number.isFinite(n)) return value;
	if (key === 'filesize' || key === 'bundleSize') return formatFileSizeNumber(n);
	if (key === 'rating') return n.toFixed(1);
	return value;
}

/**
 * 格式化布尔值
 */
export function formatBoolean(value: string): string {
	return value === '1' || value.toLowerCase() === 'true' ? '是' : '否';
}

/** EMM 卡片 ID 类型 */
export type EmmCardId = 'tags' | 'config' | 'raw' | 'bookSettings';

/** EMM 卡片顺序存储键 */
export const EMM_CARD_ORDER_STORAGE_KEY = 'neoview-emm-panel-card-order';

/** 默认卡片顺序 */
export const DEFAULT_EMM_CARD_ORDER: EmmCardId[] = ['tags', 'config', 'raw', 'bookSettings'];
