/**
 * PyO3 Upscale Manager
 * 使用 PyO3 调用 Python sr_vulkan 进行超分的管理器
 */

import { invoke } from '@tauri-apps/api/core';

export interface PyO3UpscaleModel {
	modelId: number;
	modelName: string;
	scale: number;
	tileSize: number;
	noiseLevel: number;
}

export interface PyO3CacheStats {
	totalFiles: number;
	totalSize: number;
	cacheDir: string;
}

export class PyO3UpscaleManager {
	private static instance: PyO3UpscaleManager | null = null;
	private initialized = $state(false);
	private available = $state(false);
	private availableModels = $state<string[]>([]);
	private currentModel = $state<PyO3UpscaleModel>({
		modelId: 0,
		modelName: 'cunet',
		scale: 2,
		tileSize: 0,
		noiseLevel: 0
	});

	private constructor() {}

	static getInstance(): PyO3UpscaleManager {
		if (!PyO3UpscaleManager.instance) {
			PyO3UpscaleManager.instance = new PyO3UpscaleManager();
		}
		return PyO3UpscaleManager.instance;
	}

	/**
	 * 初始化 PyO3 超分管理器
	 */
	async initialize(pythonModulePath: string, cacheDir: string): Promise<void> {
		if (this.initialized) {
			console.log('PyO3 超分管理器已初始化');
			return;
		}

		try {
			console.log('🚀 初始化 PyO3 超分管理器...');
			console.log('  Python 模块路径:', pythonModulePath);
			console.log('  缓存目录:', cacheDir);

			await invoke('init_pyo3_upscaler', {
				pythonModulePath,
				cacheDir
			});

			// 检查可用性
			this.available = await invoke('check_pyo3_upscaler_availability');

			if (this.available) {
				// 获取可用模型
				this.availableModels = await invoke('get_pyo3_available_models');
				console.log('✅ PyO3 超分管理器初始化成功');
				console.log('  可用模型:', this.availableModels);
			} else {
				console.warn('⚠️ PyO3 超分功能不可用 (sr_vulkan 模块未找到)');
			}

			this.initialized = true;
		} catch (error) {
			console.error('❌ 初始化 PyO3 超分管理器失败:', error);
			throw error;
		}
	}

	/**
	 * 检查是否可用
	 */
	isAvailable(): boolean {
		return this.available;
	}

	/**
	 * 检查是否已初始化
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * 获取可用模型列表
	 */
	getAvailableModels(): string[] {
		return this.availableModels;
	}

	/**
	 * 获取当前模型配置
	 */
	getCurrentModel(): PyO3UpscaleModel {
		return this.currentModel;
	}

	/**
	 * 设置当前模型
	 */
	async setModel(modelName: string, scale: number = 2): Promise<void> {
		try {
			const modelId = await invoke<number>('get_pyo3_model_id', { modelName });
			this.currentModel = {
				modelId,
				modelName,
				scale,
				tileSize: this.currentModel.tileSize,
				noiseLevel: this.currentModel.noiseLevel
			};
			console.log('✅ 已切换模型:', this.currentModel);
		} catch (error) {
			console.error('❌ 设置模型失败:', error);
			throw error;
		}
	}

	/**
	 * 设置 Tile Size
	 */
	setTileSize(tileSize: number): void {
		this.currentModel.tileSize = tileSize;
	}

	/**
	 * 设置降噪等级
	 */
	setNoiseLevel(noiseLevel: number): void {
		this.currentModel.noiseLevel = noiseLevel;
	}

	/**
	 * 超分图像
	 */
	async upscaleImage(
		imagePath: string,
		timeout: number = 60.0
	): Promise<Uint8Array> {
		if (!this.initialized) {
			throw new Error('PyO3 超分管理器未初始化');
		}

		if (!this.available) {
			throw new Error('PyO3 超分功能不可用');
		}

		try {
			console.log('🚀 开始 PyO3 超分:', imagePath);
			console.log('  模型:', this.currentModel.modelName);
			console.log('  缩放:', this.currentModel.scale + 'x');

			const result = await invoke<number[]>('pyo3_upscale_image', {
				imagePath,
				modelName: this.currentModel.modelName,
				scale: this.currentModel.scale,
				tileSize: this.currentModel.tileSize,
				noiseLevel: this.currentModel.noiseLevel,
				timeout
			});

			console.log('✅ PyO3 超分完成, 数据大小:', result.length);
			return new Uint8Array(result);
		} catch (error) {
			console.error('❌ PyO3 超分失败:', error);
			throw error;
		}
	}

	/**
	 * 检查缓存是否存在
	 */
	async checkCache(imagePath: string): Promise<string | null> {
		try {
			const result = await invoke<string | null>('check_pyo3_upscale_cache', {
				imagePath,
				modelName: this.currentModel.modelName,
				scale: this.currentModel.scale,
				tileSize: this.currentModel.tileSize,
				noiseLevel: this.currentModel.noiseLevel
			});
			return result;
		} catch (error) {
			console.error('检查缓存失败:', error);
			return null;
		}
	}

	/**
	 * 获取缓存统计信息
	 */
	async getCacheStats(): Promise<PyO3CacheStats> {
		try {
			return await invoke<PyO3CacheStats>('get_pyo3_cache_stats');
		} catch (error) {
			console.error('获取缓存统计失败:', error);
			throw error;
		}
	}

	/**
	 * 清理缓存
	 */
	async cleanupCache(maxAgeDays: number = 30): Promise<number> {
		try {
			const removedCount = await invoke<number>('cleanup_pyo3_cache', {
				maxAgeDays
			});
			console.log(`🗑️ 已清理 ${removedCount} 个过期缓存文件`);
			return removedCount;
		} catch (error) {
			console.error('清理缓存失败:', error);
			throw error;
		}
	}

	/**
	 * 测试 PyO3 超分功能
	 */
	async test(testImagePath: string): Promise<string> {
		try {
			const result = await invoke<string>('test_pyo3_upscaler', {
				testImagePath
			});
			return result;
		} catch (error) {
			console.error('测试失败:', error);
			throw error;
		}
	}

	/**
	 * 重置管理器
	 */
	reset(): void {
		this.initialized = false;
		this.available = false;
		this.availableModels = [];
		this.currentModel = {
			modelId: 0,
			modelName: 'cunet',
			scale: 2,
			tileSize: 0,
			noiseLevel: 0
		};
	}
}

// 导出单例实例
export const pyo3UpscaleManager = PyO3UpscaleManager.getInstance();
