/**
 * 条件系统单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	evaluateConditions,
	collectPageMeta,
	findConditionById,
	getConditionDisplayName
} from './conditions';
import type { UpscaleCondition, PageMeta } from '$lib/types/upscaleConditions';
import { createBlankCondition } from '$lib/types/upscaleConditions';

describe('条件系统', () => {
	let testConditions: UpscaleCondition[];
	let testPageMeta: PageMeta;

	beforeEach(() => {
		// 创建测试条件
		testConditions = [
			createBlankCondition('宽高条件'),
			createBlankCondition('路径条件'),
			createBlankCondition('元数据条件')
		];

		// 配置宽高条件
		testConditions[0].match = {
			minWidth: 1000,
			minHeight: 1000
		};
		testConditions[0].action = {
			model: 'MODEL_WAIFU2X_CUNET_UP2X',
			scale: 2,
			tileSize: 64,
			noiseLevel: 0,
			gpuId: 0,
			useCache: true
		};
		testConditions[0].priority = 1;

		// 配置路径条件
		testConditions[1].match = {
			regexBookPath: '.*test.*',
			excludeFromPreload: true
		};
		testConditions[1].action = {
			model: 'MODEL_WAIFU2X_ANIME_UP2X',
			scale: 2,
			tileSize: 128,
			noiseLevel: 1,
			gpuId: 0,
			useCache: false
		};
		testConditions[1].priority = 0;

		// 配置元数据条件
		testConditions[2].match = {
			metadata: {
				artist: { operator: 'eq', value: 'test_artist' }
			}
		};
		testConditions[2].action = {
			model: 'MODEL_REALCUGAN_PRO_UP2X',
			scale: 2,
			tileSize: 256,
			noiseLevel: 2,
			gpuId: 1,
			useCache: true
		};
		testConditions[2].priority = 2;

		// 创建测试页面元数据
		testPageMeta = {
			width: 1200,
			height: 800,
			bookPath: '/path/to/test/book.zip',
			imagePath: 'page001.jpg',
			metadata: {
				artist: 'test_artist',
				series: 'test_series'
			}
		};
	});

	describe('evaluateConditions', () => {
		it('应该按优先级匹配第一个符合条件的条件', () => {
			// 路径条件优先级最高（0），应该匹配
			const result = evaluateConditions(testPageMeta, testConditions);
			
			expect(result.conditionId).toBe(testConditions[1].id);
			expect(result.action?.model).toBe('MODEL_WAIFU2X_ANIME_UP2X');
			expect(result.excludeFromPreload).toBe(true);
		});

		it('应该在没有匹配条件时返回默认值', () => {
			const pageMeta: PageMeta = {
				width: 500,
				height: 500,
				bookPath: '/path/to/other/book.zip',
				imagePath: 'page001.jpg'
			};

			const result = evaluateConditions(pageMeta, testConditions);
			
			expect(result.conditionId).toBeNull();
			expect(result.action).toBeNull();
			expect(result.excludeFromPreload).toBe(false);
		});

		it('应该正确处理禁用的条件', () => {
			// 禁用路径条件
			testConditions[1].enabled = false;
			
			// 现在应该匹配宽高条件（优先级1）
			const result = evaluateConditions(testPageMeta, testConditions);
			
			expect(result.conditionId).toBe(testConditions[0].id);
			expect(result.action?.model).toBe('MODEL_WAIFU2X_CUNET_UP2X');
		});

		it('应该正确处理最小宽度匹配', () => {
			const pageMeta: PageMeta = {
				width: 999,
				height: 1000,
				bookPath: '/path/to/other/book.zip',
				imagePath: 'page001.jpg'
			};

			const result = evaluateConditions(pageMeta, testConditions);
			
			// 宽度小于1000，不匹配宽高条件
			// 路径不匹配test，不匹配路径条件
			// 元数据匹配，应该匹配元数据条件
			expect(result.conditionId).toBe(testConditions[2].id);
		});

		it('应该正确处理正则表达式匹配', () => {
			const pageMeta: PageMeta = {
				width: 500,
				height: 500,
				bookPath: '/path/to/TEST/book.zip', // 大写TEST
				imagePath: 'page001.jpg'
			};

			const result = evaluateConditions(pageMeta, testConditions);
			
			// 默认正则应该是大小写敏感的，不匹配
			expect(result.conditionId).toBeNull();
		});

		it('应该正确处理元数据条件匹配', () => {
			const pageMeta: PageMeta = {
				width: 500,
				height: 500,
				bookPath: '/path/to/other/book.zip',
				imagePath: 'page001.jpg',
				metadata: {
					artist: 'other_artist'
				}
			};

			const result = evaluateConditions(pageMeta, testConditions);
			
			// artist不匹配，没有任何条件匹配
			expect(result.conditionId).toBeNull();
		});
	});

	describe('collectPageMeta', () => {
		it('应该正确收集页面元数据', () => {
			const page = {
				path: '/path/to/image.jpg',
				width: 1920,
				height: 1080,
				createdAt: 1234567890,
				modifiedAt: 1234567891,
				metadata: {
					title: 'Test Image'
				}
			};

			const bookPath = '/path/to/book.zip';
			const meta = collectPageMeta(page, bookPath);

			expect(meta.width).toBe(1920);
			expect(meta.height).toBe(1080);
			expect(meta.bookPath).toBe(bookPath);
			expect(meta.imagePath).toBe('/path/to/image.jpg');
			expect(meta.createdAt).toBe(1234567890);
			expect(meta.modifiedAt).toBe(1234567891);
			expect(meta.metadata?.title).toBe('Test Image');
		});

		it('应该处理缺失的元数据字段', () => {
			const page = {
				path: 'image.jpg'
			};

			const meta = collectPageMeta(page, '/book.zip');

			expect(meta.width).toBe(0);
			expect(meta.height).toBe(0);
			expect(meta.bookPath).toBe('/book.zip');
			expect(meta.imagePath).toBe('image.jpg');
			expect(meta.createdAt).toBeUndefined();
			expect(meta.metadata).toEqual({});
		});
	});

	describe('findConditionById', () => {
		it('应该根据ID查找条件', () => {
			const result = findConditionById(testConditions[1].id, testConditions);
			
			expect(result).toBe(testConditions[1]);
		});

		it('应该在ID不存在时返回null', () => {
			const result = findConditionById('non-existent-id', testConditions);
			
			expect(result).toBeNull();
		});

		it('应该在ID为null时返回null', () => {
			const result = findConditionById(null, testConditions);
			
			expect(result).toBeNull();
		});
	});

	describe('getConditionDisplayName', () => {
		it('应该返回条件的名称', () => {
			const condition = createBlankCondition('测试条件');
			
			const name = getConditionDisplayName(condition);
			
			expect(name).toBe('测试条件');
		});

		it('应该根据匹配规则生成名称', () => {
			const condition = createBlankCondition('');
			condition.match = {
				minWidth: 1000,
				minHeight: 800,
				regexBookPath: '.*manga.*'
			};
			
			const name = getConditionDisplayName(condition);
			
			expect(name).toContain('宽≥1000');
			expect(name).toContain('高≥800');
			expect(name).toContain('书路径:.*manga.*');
		});

		it('应该在没有匹配规则时返回无条件', () => {
			const condition = createBlankCondition('');
			
			const name = getConditionDisplayName(condition);
			
			expect(name).toBe('无条件');
		});
	});

	describe('复杂场景测试', () => {
		it('应该正确处理排除预超分的场景', () => {
			const pageMeta: PageMeta = {
				width: 1200,
				height: 800,
				bookPath: '/path/to/test/manga.zip',
				imagePath: 'page001.jpg'
			};

			const result = evaluateConditions(pageMeta, testConditions);
			
			// 匹配路径条件，该条件设置了 excludeFromPreload
			expect(result.conditionId).toBe(testConditions[1].id);
			expect(result.excludeFromPreload).toBe(true);
			expect(result.action?.useCache).toBe(false);
		});

		it('应该正确应用不同的模型参数', () => {
			// 创建特定条件的页面
			const pageMeta: PageMeta = {
				width: 500,
				height: 500,
				bookPath: '/path/to/other/book.zip',
				imagePath: 'page001.jpg',
				metadata: {
					artist: 'test_artist'
				}
			};

			const result = evaluateConditions(pageMeta, testConditions);
			
			// 匹配元数据条件
			expect(result.conditionId).toBe(testConditions[2].id);
			expect(result.action?.model).toBe('MODEL_REALCUGAN_PRO_UP2X');
			expect(result.action?.scale).toBe(2);
			expect(result.action?.tileSize).toBe(256);
			expect(result.action?.noiseLevel).toBe(2);
			expect(result.action?.gpuId).toBe(1);
			expect(result.action?.useCache).toBe(true);
		});
	});
});