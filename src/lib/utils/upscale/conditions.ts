/**
 * 超分条件评估逻辑
 * 提供多条件匹配、优先级排序和参数绑定功能
 */

import type { UpscaleCondition, ConditionResult, ConditionExpression } from '$lib/components/panels/UpscalePanel';

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
function matchesCondition(matchRule: UpscaleCondition['match'], meta: PageMetadata): boolean {
	// 检查最小宽度
	if (matchRule.minWidth !== undefined && meta.width < matchRule.minWidth) {
		return false;
	}

	// 检查最小高度
	if (matchRule.minHeight !== undefined && meta.height < matchRule.minHeight) {
		return false;
	}

	// 检查创建时间范围
	if (matchRule.createdBetween && meta.createdAt) {
		const [start, end] = matchRule.createdBetween;
		if (meta.createdAt < start || meta.createdAt > end) {
			return false;
		}
	}

	// 检查修改时间范围
	if (matchRule.modifiedBetween && meta.modifiedAt) {
		const [start, end] = matchRule.modifiedBetween;
		if (meta.modifiedAt < start || meta.modifiedAt > end) {
			return false;
		}
	}

	// 检查书籍路径正则
	if (matchRule.regexBookPath) {
		try {
			const regex = new RegExp(matchRule.regexBookPath);
			if (!regex.test(meta.bookPath)) {
				return false;
			}
		} catch (error) {
			console.warn('书籍路径正则表达式无效:', matchRule.regexBookPath, error);
			return false;
		}
	}

	// 检查图片路径正则
	if (matchRule.regexImagePath) {
		try {
			const regex = new RegExp(matchRule.regexImagePath);
			if (!regex.test(meta.imagePath)) {
				return false;
			}
		} catch (error) {
			console.warn('图片路径正则表达式无效:', matchRule.regexImagePath, error);
			return false;
		}
	}

	// 检查自定义元数据
	if (matchRule.metadata && meta.metadata) {
		for (const [key, expression] of Object.entries(matchRule.metadata)) {
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
				excludeFromPreload: condition.match.excludeFromPreload === true
			};
		}
	}

	// 没有条件匹配
	return {
		conditionId: null,
		action: null,
		excludeFromPreload: false
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
	const timestamp = Date.now();
	return {
		id: `condition-${timestamp}`,
		name,
		enabled: true,
		priority: 0,
		match: {
			minWidth: 1000,
			minHeight: 1000,
			excludeFromPreload: false
		},
		action: {
			model: 'real-cugan',
			scale: 2,
			tileSize: 400,
			noiseLevel: -1,
			gpuId: 0,
			useCache: true
		}
	};
}

/**
 * 收集页面元数据
 */
export function collectPageMetadata(page: any, bookPath: string): PageMetadata {
	const metadata: PageMetadata = {
		width: page.width || 0,
		height: page.height || 0,
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