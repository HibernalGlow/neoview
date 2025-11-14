/**
 * 超分条件评估逻辑
 */

import type { UpscaleCondition, PageMeta, ConditionResult, ConditionExpression } from '$lib/types/upscaleConditions';

/**
 * 评估页面元数据是否匹配任何条件
 * @param meta 页面元数据
 * @param conditions 条件列表
 * @returns 匹配结果
 */
export function evaluateConditions(meta: PageMeta, conditions: UpscaleCondition[]): ConditionResult {
	// 过滤启用的条件并按优先级排序
	const sorted = conditions
		.filter(c => c.enabled)
		.sort((a, b) => a.priority - b.priority);

	for (const cond of sorted) {
		if (!matchesCondition(cond.match, meta)) continue;

		return {
			conditionId: cond.id,
			action: cond.action,
			excludeFromPreload: cond.match.excludeFromPreload === true
		};
	}

	// 没有匹配的条件
	return { 
		conditionId: null, 
		action: null, 
		excludeFromPreload: false 
	};
}

/**
 * 检查页面元数据是否匹配单个条件
 * @param matchRule 匹配规则
 * @param meta 页面元数据
 * @returns 是否匹配
 */
function matchesCondition(matchRule: UpscaleCondition['match'], meta: PageMeta): boolean {
	// 检查最小宽度
	if (matchRule.minWidth && meta.width < matchRule.minWidth) return false;
	
	// 检查最小高度
	if (matchRule.minHeight && meta.height < matchRule.minHeight) return false;
	
	// 检查创建时间范围
	if (matchRule.createdBetween) {
		if (!meta.createdAt) return false;
		const [start, end] = matchRule.createdBetween;
		if (meta.createdAt < start || meta.createdAt > end) return false;
	}
	
	// 检查修改时间范围
	if (matchRule.modifiedBetween) {
		if (!meta.modifiedAt) return false;
		const [start, end] = matchRule.modifiedBetween;
		if (meta.modifiedAt < start || meta.modifiedAt > end) return false;
	}
	
	// 检查书籍路径正则
	if (matchRule.regexBookPath) {
		try {
			const regex = new RegExp(matchRule.regexBookPath);
			if (!regex.test(meta.bookPath)) return false;
		} catch (e) {
			console.warn('Invalid regexBookPath:', matchRule.regexBookPath, e);
			return false;
		}
	}
	
	// 检查图片路径正则
	if (matchRule.regexImagePath) {
		try {
			const regex = new RegExp(matchRule.regexImagePath);
			if (!regex.test(meta.imagePath)) return false;
		} catch (e) {
			console.warn('Invalid regexImagePath:', matchRule.regexImagePath, e);
			return false;
		}
	}
	
	// 检查元数据键值对
	if (matchRule.metadata) {
		for (const [key, expression] of Object.entries(matchRule.metadata)) {
			const value = meta.metadata?.[key];
			if (!evaluateExpression(expression, value)) return false;
		}
	}
	
	return true;
}

/**
 * 评估条件表达式
 * @param expression 条件表达式
 * @param value 实际值
 * @returns 是否满足条件
 */
function evaluateExpression(expression: ConditionExpression, value: any): boolean {
	switch (expression.operator) {
		case 'eq':
			return value === expression.value;
		case 'ne':
			return value !== expression.value;
		case 'gt':
			return Number(value) > Number(expression.value);
		case 'gte':
			return Number(value) >= Number(expression.value);
		case 'lt':
			return Number(value) < Number(expression.value);
		case 'lte':
			return Number(value) <= Number(expression.value);
		case 'regex':
			try {
				const regex = new RegExp(String(expression.value));
				return regex.test(String(value));
			} catch (e) {
				console.warn('Invalid regex expression:', expression.value, e);
				return false;
			}
		case 'contains':
			return String(value).includes(String(expression.value));
		default:
			console.warn('Unknown operator:', expression.operator);
			return false;
	}
}

/**
 * 收集页面元数据
 * @param page 页面对象
 * @param bookPath 书籍路径
 * @returns 页面元数据
 */
export function collectPageMeta(page: any, bookPath: string): PageMeta {
	const meta: PageMeta = {
		width: page.width || 0,
		height: page.height || 0,
		bookPath,
		imagePath: page.path || page.innerPath || '',
		metadata: page.metadata || {}
	};

	// 尝试获取文件时间信息（如果可用）
	if (page.createdAt) meta.createdAt = page.createdAt;
	if (page.modifiedAt) meta.modifiedAt = page.modifiedAt;

	return meta;
}

/**
 * 根据条件ID查找条件
 * @param conditionId 条件ID
 * @param conditions 条件列表
 * @returns 匹配的条件或null
 */
export function findConditionById(conditionId: string | null, conditions: UpscaleCondition[]): UpscaleCondition | null {
	if (!conditionId) return null;
	return conditions.find(c => c.id === conditionId) || null;
}

/**
 * 获取条件的显示名称
 * @param condition 条件对象
 * @returns 显示名称
 */
export function getConditionDisplayName(condition: UpscaleCondition): string {
	if (condition.name) return condition.name;
	
	// 自动生成名称基于匹配规则
	const rules: string[] = [];
	if (condition.match.minWidth) rules.push(`宽≥${condition.match.minWidth}`);
	if (condition.match.minHeight) rules.push(`高≥${condition.match.minHeight}`);
	if (condition.match.regexBookPath) rules.push(`书路径:${condition.match.regexBookPath}`);
	if (condition.match.regexImagePath) rules.push(`图路径:${condition.match.regexImagePath}`);
	
	if (rules.length === 0) return '无条件';
	return rules.join(' & ');
}