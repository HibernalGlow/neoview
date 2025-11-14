/**
 * 超分条件系统类型定义
 */

export interface ConditionExpression {
	operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'regex' | 'contains';
	value: string | number | boolean;
}

export interface UpscaleCondition {
	id: string;                                    // 稳定标识
	name: string;                                  // Tab 标题
	enabled: boolean;
	match: {
		minWidth?: number;
		minHeight?: number;
		createdBetween?: [number, number];         // epoch 时间戳
		modifiedBetween?: [number, number];
		regexBookPath?: string;                    // 正则表达式字符串
		regexImagePath?: string;
		metadata?: Record<string, ConditionExpression>;
		excludeFromPreload?: boolean;              // 是否从预超分队列排除
	};
	action: {
		model: string;
		scale: number;
		tileSize: number;
		noiseLevel: number;
		gpuId: number;
		useCache: boolean;
	};
	priority: number;                             // 决定匹配顺序，数字越小优先级越高
}

export interface PageMeta {
	width: number;
	height: number;
	createdAt?: number;                           // 文件创建时间戳
	modifiedAt?: number;                          // 文件修改时间戳
	bookPath: string;                             // 书籍文件路径
	imagePath: string;                            // 图片文件路径（可能是压缩包内路径）
	metadata?: Record<string, any>;               // 其他元数据
}

export interface ConditionResult {
	conditionId: string | null;
	action: UpscaleCondition['action'] | null;
	excludeFromPreload: boolean;
}

export interface PreloadTask {
	page: any;
	conditionId: string | null;
	priority: number;
}

/**
 * 创建空白条件的工厂函数
 */
export function createBlankCondition(name: string): UpscaleCondition {
	return {
		id: `condition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
		name,
		enabled: true,
		match: {},
		action: {
			model: 'MODEL_WAIFU2X_CUNET_UP2X',
			scale: 2,
			tileSize: 64,
			noiseLevel: 0,
			gpuId: 0,
			useCache: true
		},
		priority: 0
	};
}

/**
 * 创建默认条件（保持向后兼容）
 */
export function createDefaultCondition(): UpscaleCondition {
	return {
		...createBlankCondition('默认条件'),
		match: {
			minWidth: 0,
			minHeight: 0
		}
	};
}