/**
 * 超分条件评估逻辑
 * 提供多条件匹配、优先级排序和参数绑定功能
 */

import type { UpscaleCondition, ConditionResult, ConditionExpression } from '$lib/components/panels/UpscalePanel';

export type ConditionPresetKey = 'A' | 'B' | 'C' | 'D';

interface ConditionPresetDefinition {
	key: ConditionPresetKey;
	name: string;
	description: string;
	build: () => {
		match?: Partial<UpscaleCondition['match']>;
		action?: Partial<UpscaleCondition['action']>;
	};
}

const CONDITION_ID_PREFIX = 'condition';

function createConditionId(prefix = CONDITION_ID_PREFIX): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function ensureMatchDefaults(match?: UpscaleCondition['match']): UpscaleCondition['match'] {
	const safeMatch: Partial<UpscaleCondition['match']> = match ?? {};
	return {
		minWidth: safeMatch.minWidth,
		minHeight: safeMatch.minHeight,
		maxWidth: safeMatch.maxWidth,
		maxHeight: safeMatch.maxHeight,
		dimensionMode: safeMatch.dimensionMode ?? 'and',
		createdBetween: safeMatch.createdBetween,
		modifiedBetween: safeMatch.modifiedBetween,
		regexBookPath: safeMatch.regexBookPath,
		regexImagePath: safeMatch.regexImagePath,
		excludeFromPreload: safeMatch.excludeFromPreload ?? false,
		metadata: safeMatch.metadata ? { ...safeMatch.metadata } : undefined
	};
}

function ensureActionDefaults(action?: UpscaleCondition['action']): UpscaleCondition['action'] {
	const safeAction: Partial<UpscaleCondition['action']> = action ?? {};
	return {
		model: safeAction.model ?? 'MODEL_WAIFU2X_CUNET_UP2X',
		scale: safeAction.scale ?? 2,
		tileSize: safeAction.tileSize ?? 400,
		noiseLevel: safeAction.noiseLevel ?? -1,
		gpuId: safeAction.gpuId ?? 0,
		useCache: safeAction.useCache ?? true,
		skip: safeAction.skip ?? false
	};
}

export function normalizeCondition(condition: UpscaleCondition, priorityFallback = 0): UpscaleCondition {
	return {
		id: condition.id || createConditionId(),
		name: condition.name || '自定义条件',
		enabled: condition.enabled ?? true,
		priority: typeof condition.priority === 'number' ? condition.priority : priorityFallback,
		match: ensureMatchDefaults(condition.match),
		action: ensureActionDefaults(condition.action)
	};
}

const CONDITION_PRESET_DEFINITIONS: ConditionPresetDefinition[] = [
	{
		key: 'A',
		name: '基础A · 超大图跳过',
		description: '宽≥2048 或 高≥3142 时跳过超分',
		build: () => ({
			match: {
				minWidth: 2048,
				minHeight: 3142,
				dimensionMode: 'or'
			},
			action: {
				skip: true,
				useCache: false
			}
		})
	},
	{
		key: 'B',
		name: '基础B · COS 专用 ESRGAN',
		description: '路径包含 02cos 时改用 ESRGAN',
		build: () => ({
			match: {
				regexBookPath: '.*02cos.*'
			},
			action: {
				model: 'MODEL_REALESRGAN_X4PLUS_ANIME_UP4X',
				scale: 4,
				tileSize: 256,
				noiseLevel: 0,
				useCache: true
			}
		})
	},
	{
		key: 'C',
		name: '基础C · 中分辨率 CUGAN 2x',
		description: '宽度低于 2048 使用 CUGAN 2x',
		build: () => ({
			match: {
				maxWidth: 2048
			},
			action: {
				model: 'MODEL_REALCUGAN_PRO_UP2X',
				scale: 2,
				tileSize: 400,
				noiseLevel: -1
			}
		})
	},
	{
		key: 'D',
		name: '基础D · 低分辨率 CUGAN 4x',
		description: '宽度低于 512 强制 4x 放大',
		build: () => ({
			match: {
				maxWidth: 512
			},
			action: {
				model: 'MODEL_REALCUGAN_PRO_UP3X',
				scale: 4,
				tileSize: 256,
				noiseLevel: -1
			}
		})
	}
];

export const CONDITION_PRESET_OPTIONS = CONDITION_PRESET_DEFINITIONS.map((preset) => ({
	key: preset.key,
	name: preset.name,
	description: preset.description
}));

function composePresetCondition(def: ConditionPresetDefinition, priority: number): UpscaleCondition {
	const base = createBlankCondition(def.name);
	const overrides = def.build();
	const merged: UpscaleCondition = {
		...base,
		id: createConditionId(`preset-${def.key}`),
		name: def.name,
		match: ensureMatchDefaults({
			...base.match,
			...overrides.match
		}),
		action: ensureActionDefaults({
			...base.action,
			...overrides.action
		}),
		priority
	};
	return normalizeCondition(merged, priority);
}

export function getDefaultConditionPresets(): UpscaleCondition[] {
	return CONDITION_PRESET_DEFINITIONS.map((preset, index) => composePresetCondition(preset, index));
}

export function createPresetCondition(key: ConditionPresetKey, priority = 0): UpscaleCondition | null {
	const preset = CONDITION_PRESET_DEFINITIONS.find((item) => item.key === key);
	if (!preset) {
		return null;
	}
	return composePresetCondition(preset, priority);
}

// 页面元数据接口
export interface PageMetadata {
	width: number;
	height: number;
	bookPath: string;
	imagePath: string;
	createdAt?: number;
	modifiedAt?: number;
	metadata?: Record<string, any>;
}

const invalidRegexCache = new Set<string>();

function escapeRegexLiteral(pattern: string): string {
	return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegexFromPattern(pattern?: string): RegExp | null {
	if (!pattern) {
		return null;
	}
	try {
		return new RegExp(pattern);
	} catch (error) {
		if (!invalidRegexCache.has(pattern)) {
			console.warn('正则无效，将按文本匹配处理:', pattern, error);
			invalidRegexCache.add(pattern);
		}
		// 将 * ? 作为通配处理，其余字符转义
		const escaped = escapeRegexLiteral(pattern)
			.replace(/\\\*/g, '.*')
			.replace(/\\\?/g, '.');
		try {
			return new RegExp(escaped);
		} catch (fallbackErr) {
			console.warn('正则降级失败，彻底按字面匹配:', pattern, fallbackErr);
			return new RegExp(escapeRegexLiteral(pattern));
		}
	}
}

/**
 * 评估页面元数据是否匹配条件
 */
function matchesCondition(matchRule: UpscaleCondition['match'], meta: PageMetadata): boolean {
	const match = ensureMatchDefaults(matchRule);

	const hasWidthRule = match.minWidth !== undefined || match.maxWidth !== undefined;
	const hasHeightRule = match.minHeight !== undefined || match.maxHeight !== undefined;

	const widthOk =
		(match.minWidth === undefined || meta.width >= match.minWidth) &&
		(match.maxWidth === undefined || meta.width <= match.maxWidth);
	const heightOk =
		(match.minHeight === undefined || meta.height >= match.minHeight) &&
		(match.maxHeight === undefined || meta.height <= match.maxHeight);

	if (match.dimensionMode === 'or' && hasWidthRule && hasHeightRule) {
		if (!widthOk && !heightOk) {
			return false;
		}
	} else {
		if (hasWidthRule && !widthOk) return false;
		if (hasHeightRule && !heightOk) return false;
	}

	// 检查创建时间范围
	if (match.createdBetween && meta.createdAt) {
		const [start, end] = match.createdBetween;
		if (meta.createdAt < start || meta.createdAt > end) {
			return false;
		}
	}

	// 检查修改时间范围
	if (match.modifiedBetween && meta.modifiedAt) {
		const [start, end] = match.modifiedBetween;
		if (meta.modifiedAt < start || meta.modifiedAt > end) {
			return false;
		}
	}

	// 检查书籍路径正则
	if (match.regexBookPath) {
		const regex = buildRegexFromPattern(match.regexBookPath);
		if (!regex || !regex.test(meta.bookPath)) {
			return false;
		}
	}

	// 检查图片路径正则
	if (match.regexImagePath) {
		const regex = buildRegexFromPattern(match.regexImagePath);
		if (!regex || !regex.test(meta.imagePath)) {
			return false;
		}
	}

	// 检查自定义元数据
	if (match.metadata && meta.metadata) {
		for (const [key, expression] of Object.entries(match.metadata)) {
			const metaValue = meta.metadata[key];
			if (!evaluateExpression(expression, metaValue)) {
				return false;
			}
		}
	}

	return true;
}

/**
 * 评估条件表达式
 */
function evaluateExpression(expression: ConditionExpression, value: any): boolean {
	const { operator, value: expectedValue } = expression;

	switch (operator) {
		case 'eq':
			return value === expectedValue;
		case 'ne':
			return value !== expectedValue;
		case 'gt':
			return Number(value) > Number(expectedValue);
		case 'gte':
			return Number(value) >= Number(expectedValue);
		case 'lt':
			return Number(value) < Number(expectedValue);
		case 'lte':
			return Number(value) <= Number(expectedValue);
		case 'regex':
			try {
				const regex = new RegExp(String(expectedValue));
				return regex.test(String(value));
			} catch (error) {
				console.warn('正则表达式无效:', expectedValue, error);
				return false;
			}
		case 'contains':
			return String(value).includes(String(expectedValue));
		default:
			console.warn('未知的操作符:', operator);
			return false;
	}
}

/**
 * 评估页面元数据匹配的条件
 * 按优先级顺序返回第一个匹配的条件
 */
export function evaluateConditions(
	meta: PageMetadata,
	conditions: UpscaleCondition[]
): ConditionResult {
	// 过滤启用的条件并按优先级排序
	const sortedConditions = conditions
		.filter(c => c.enabled)
		.sort((a, b) => a.priority - b.priority);

	// 遍历条件，找到第一个匹配的
	for (const condition of sortedConditions) {
		if (matchesCondition(condition.match, meta)) {
			console.log(`条件匹配: "${condition.name}" (ID: ${condition.id})`);
			return {
				conditionId: condition.id,
				action: condition.action,
				excludeFromPreload: condition.match.excludeFromPreload === true,
				skipUpscale: condition.action?.skip === true
			};
		}
	}

	// 没有条件匹配
	return {
		conditionId: null,
		action: null,
		excludeFromPreload: false,
		skipUpscale: false
	};
}

/**
 * 根据条件ID获取条件配置
 */
export function getConditionById(
	conditionId: string | null,
	conditions: UpscaleCondition[]
): UpscaleCondition | null {
	if (!conditionId) return null;
	return conditions.find(c => c.id === conditionId) || null;
}

/**
 * 创建新的空白条件
 */
export function createBlankCondition(name: string): UpscaleCondition {
	return normalizeCondition({
		id: createConditionId(),
		name,
		enabled: true,
		priority: 0,
		match: {
			minWidth: 1000,
			minHeight: 1000,
			dimensionMode: 'and',
			excludeFromPreload: false
		},
		action: {
			model: 'MODEL_WAIFU2X_CUNET_UP2X',
			scale: 2,
			tileSize: 400,
			noiseLevel: -1,
			gpuId: 0,
			useCache: true,
			skip: false
		}
	});
}

/**
 * 从 Blob 获取图片分辨率
 */
export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		const img = new Image();
		const url = URL.createObjectURL(blob);
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve({ width: img.naturalWidth, height: img.naturalHeight });
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(null);
		};
		img.src = url;
	});
}

/**
 * 收集页面元数据
 */
export function collectPageMetadata(
	page: any,
	bookPath: string,
	dimensions?: { width: number; height: number } | null
): PageMetadata {
	// 优先使用传入的 dimensions，其次使用 page 中的 width/height
	const width = dimensions?.width ?? page.width ?? 0;
	const height = dimensions?.height ?? page.height ?? 0;

	const metadata: PageMetadata = {
		width,
		height,
		bookPath,
		imagePath: page.path || page.innerPath || ''
	};

	// 尝试获取时间信息
	if (page.createdAt) {
		metadata.createdAt = new Date(page.createdAt).getTime();
	}
	if (page.modifiedAt) {
		metadata.modifiedAt = new Date(page.modifiedAt).getTime();
	}

	// 收集其他元数据
	if (page.metadata) {
		metadata.metadata = { ...page.metadata };
	}

	return metadata;
}