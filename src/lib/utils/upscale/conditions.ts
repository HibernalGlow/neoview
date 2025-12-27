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

function normalizePathForMatch(path: string): string {
	return path.replace(/\\/g, '/');
}

function ensureMatchDefaults(match?: UpscaleCondition['match']): UpscaleCondition['match'] {
	const safeMatch = match ?? {};
	const result = {
		minWidth: safeMatch.minWidth,
		minHeight: safeMatch.minHeight,
		maxWidth: safeMatch.maxWidth,
		maxHeight: safeMatch.maxHeight,
		minPixels: safeMatch.minPixels,  // 最小像素量（MPx）
		maxPixels: safeMatch.maxPixels,  // 最大像素量（MPx）
		dimensionMode: safeMatch.dimensionMode ?? 'and',
		createdBetween: safeMatch.createdBetween,
		modifiedBetween: safeMatch.modifiedBetween,
		regexBookPath: safeMatch.regexBookPath,
		regexImagePath: safeMatch.regexImagePath,
		matchInnerPath: safeMatch.matchInnerPath ?? false, // 默认只匹配book路径
		excludeFromPreload: safeMatch.excludeFromPreload ?? false,
		metadata: safeMatch.metadata ? { ...safeMatch.metadata } : undefined
	};
	// 调试日志
	if (safeMatch.minPixels !== undefined || safeMatch.maxPixels !== undefined) {
		console.log('🔧 ensureMatchDefaults pixels:', { input: { minPixels: safeMatch.minPixels, maxPixels: safeMatch.maxPixels }, output: { minPixels: result.minPixels, maxPixels: result.maxPixels } });
	}
	return result;
}

function ensureActionDefaults(action?: Partial<UpscaleCondition['action']>): UpscaleCondition['action'] {
	return {
		model: action?.model ?? 'MODEL_WAIFU2X_CUNET_UP2X',
		scale: action?.scale ?? 2,
		tileSize: action?.tileSize ?? 400,
		noiseLevel: action?.noiseLevel ?? -1,
		gpuId: action?.gpuId ?? 0,
		useCache: action?.useCache ?? true,
		skip: action?.skip ?? false
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

/**
	 * 评估页面元数据是否匹配条件
	 */
function matchesCondition(condition: UpscaleCondition, meta: PageMetadata): boolean {
	const match = ensureMatchDefaults(condition.match);
	const conditionId = condition.id;
	const conditionName = condition.name;

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
			console.log('条件未通过尺寸(or)检查:', {
				conditionId,
				conditionName,
				metaWidth: meta.width,
				metaHeight: meta.height,
				minWidth: match.minWidth,
				maxWidth: match.maxWidth,
				minHeight: match.minHeight,
				maxHeight: match.maxHeight
			});
			return false;
		}
	} else {
		if (hasWidthRule && !widthOk) {
			console.log('条件未通过宽度检查:', {
				conditionId,
				conditionName,
				metaWidth: meta.width,
				minWidth: match.minWidth,
				maxWidth: match.maxWidth
			});
			return false;
		}
		if (hasHeightRule && !heightOk) {
			console.log('条件未通过高度检查:', {
				conditionId,
				conditionName,
				metaHeight: meta.height,
				minHeight: match.minHeight,
				maxHeight: match.maxHeight
			});
			return false;
		}
	}

	if (match.createdBetween && meta.createdAt) {
		const [start, end] = match.createdBetween;
		if (meta.createdAt < start || meta.createdAt > end) {
			console.log('条件未通过创建时间范围检查:', {
				conditionId,
				conditionName,
				createdAt: meta.createdAt,
				start,
				end
			});
			return false;
		}
	}

	if (match.modifiedBetween && meta.modifiedAt) {
		const [start, end] = match.modifiedBetween;
		if (meta.modifiedAt < start || meta.modifiedAt > end) {
			console.log('条件未通过修改时间范围检查:', {
				conditionId,
				conditionName,
				modifiedAt: meta.modifiedAt,
				start,
				end
			});
			return false;
		}
	}

	if (match.regexBookPath) {
		const target = meta.bookPath || '';
		const keyword = String(match.regexBookPath).toLowerCase();
		const ok = target.toLowerCase().includes(keyword);
		console.log('条件书籍路径匹配结果:', {
			conditionId,
			conditionName,
			keyword,
			bookPath: target,
			matched: ok
		});
		if (!ok) {
			return false;
		}
	}

	if (match.regexImagePath) {
		const target = meta.imagePath || '';
		const keyword = String(match.regexImagePath).toLowerCase();
		const ok = target.toLowerCase().includes(keyword);
		console.log('条件图片路径匹配结果:', {
			conditionId,
			conditionName,
			keyword,
			imagePath: target,
			matched: ok
		});
		if (!ok) {
			return false;
		}
	}

	if (match.metadata && meta.metadata) {
		for (const [key, expression] of Object.entries(match.metadata)) {
			const metaValue = meta.metadata[key];
			if (!evaluateExpression(expression, metaValue)) {
				console.log('条件未通过元数据检查:', {
					conditionId,
					conditionName,
					key,
					value: metaValue,
					expression
				});
				return false;
			}
		}
	}

	console.log('条件匹配通过:', {
		conditionId,
		conditionName
	});
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
	const sortedConditions = conditions
		.filter((c) => c.enabled)
		.sort((a, b) => a.priority - b.priority);

	console.log('evaluateConditions: 开始评估条件', {
		bookPath: meta.bookPath,
		imagePath: meta.imagePath,
		width: meta.width,
		height: meta.height,
		totalConditions: conditions.length,
		enabledConditions: sortedConditions.length
	});

	for (const condition of sortedConditions) {
		const matched = matchesCondition(condition, meta);
		if (matched) {
			return {
				conditionId: condition.id,
				action: condition.action,
				excludeFromPreload: condition.match.excludeFromPreload === true,
				skipUpscale: condition.action?.skip === true
			};
		}
		console.log('evaluateConditions: 条件未命中', {
			conditionId: condition.id,
			conditionName: condition.name
		});
	}

	console.log('evaluateConditions: 没有任何条件匹配，使用默认行为', {
		bookPath: meta.bookPath,
		imagePath: meta.imagePath
	});

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
 * 收集页面元数据
 */
export function collectPageMetadata(page: any, bookPath: string): PageMetadata {
	const metadata: PageMetadata = {
		width: page.width || 0,
		height: page.height || 0,
		bookPath: normalizePathForMatch(bookPath),
		imagePath: normalizePathForMatch(page.path || page.innerPath || '')
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