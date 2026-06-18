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
	private _currentModel = $state<PyO3UpscaleModel>({
		modelId: 0,
		modelName: 'MODEL_WAIFU2X_CUNET_UP2X',
		scale: 2,
		tileSize: 64,
		noiseLevel: 0
	});

	private _imageWidth = $state(0);
	private _imageHeight = $state(0);

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
	 * 获取当前模型信息
	 */
	get currentModel() {
		return this._currentModel;
	}

	/**
	 * 设置当前模型
	 */
	async setModel(modelName: string, scale: number = 2): Promise<void> {
		try {
			const modelId = await invoke<number>('get_pyo3_model_id', { modelName });
			this._currentModel = {
				modelId,
				modelName,
				scale,
				tileSize: this._currentModel.tileSize,
				noiseLevel: this._currentModel.noiseLevel
			};
			console.log('✅ 模型设置成功:', this._currentModel);
		} catch (error) {
			console.error('❌ 设置模型失败:', error);
			throw error;
		}
	}

	/**
	 * 设置图像尺寸
	 */
	setImageDimensions(width: number, height: number): void {
		this._imageWidth = width;
		this._imageHeight = height;
		console.log(`📐 设置图像尺寸: ${width}x${height}`);
	}

	/**
	 * 获取图像宽度
	 */
	get imageWidth(): number {
		return this._imageWidth;
	}

	/**
	 * 获取图像高度
	 */
	get imageHeight(): number {
		return this._imageHeight;
	}

	/**
	 * 设置 Tile Size
	 */
	setTileSize(tileSize: number): void {
		console.log('🔧 PyO3UpscaleManager.setTileSize:', tileSize);
		this._currentModel.tileSize = tileSize;
		console.log('✅ PyO3UpscaleManager.tileSize 已更新为:', this._currentModel.tileSize);
	}

	/**
	 * 设置降噪等级
	 */
	setNoiseLevel(noiseLevel: number): void {
		this._currentModel.noiseLevel = noiseLevel;
	}

	/**
	 * 执行超分处理 (内存流版本)
	 */
	async upscaleImageMemory(
		imageData: Uint8Array,
		timeout: number = 120.0,
		jobKey?: string
	): Promise<Uint8Array> {
		if (!this.initialized) {
			throw new Error('PyO3 超分管理器未初始化');
		}

		if (!this.available) {
			throw new Error('PyO3 超分功能不可用');
		}

		try {
			console.log('🚀 开始 PyO3 超分 (内存流)');
			console.log('  模型:', this._currentModel.modelName);
			console.log('  缩放:', this._currentModel.scale + 'x');
			console.log('  输入数据大小:', imageData.length, 'bytes');

			console.log('📤 发送参数到 Rust:');
			console.log('  imageDataLength:', imageData.length);
			console.log('  modelName:', this._currentModel.modelName);
			console.log('  scale:', this._currentModel.scale);
			console.log('  tileSize:', this._currentModel.tileSize);
			console.log('  noiseLevel:', this._currentModel.noiseLevel);
			console.log('  timeout:', timeout);

			// 添加超时保护，避免无限等待
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => {
					reject(new Error(`PyO3 超分超时 (${timeout}s)`));
				}, timeout * 1000);
			});

			const upscalePromise = invoke<number[]>('pyo3_upscale_image_memory', {
				imageData: Array.from(imageData),
				modelName: this._currentModel.modelName,
				scale: this._currentModel.scale,
				tileSize: this._currentModel.tileSize,
				noiseLevel: this._currentModel.noiseLevel,
				timeout,
				width: this._imageWidth || 0,
				height: this._imageHeight || 0,
				jobKey: jobKey ?? null
			});

			const result = await Promise.race([upscalePromise, timeoutPromise]);

			console.log('✅ PyO3 超分完成 (内存流), 数据大小:', result.length);
			return new Uint8Array(result);
		} catch (error) {
			console.error('❌ PyO3 超分失败 (内存流):', error);
			throw error;
		}
	}

	/**
	 * 保存超分结果到缓存
	 */
	async saveUpscaleCache(imageHash: string, resultData: Uint8Array): Promise<string> {
		if (resultData.length === 0) {
			console.warn('saveUpscaleCache 跳过：数据为空', imageHash);
			return '';
		}
		if (!this.initialized) {
			throw new Error('PyO3 超分管理器未初始化');
		}

		try {
			console.log('💾 保存超分结果到缓存:', imageHash);
			console.log('  模型:', this._currentModel.modelName);
			console.log('  数据大小:', resultData.length, 'bytes');

			const cachePath = await invoke<string>('pyo3_save_upscale_cache', {
				imageHash,
				modelName: this._currentModel.modelName,
				scale: this._currentModel.scale,
				tileSize: this._currentModel.tileSize,
				noiseLevel: this._currentModel.noiseLevel,
				resultData: Array.from(resultData)
			});

			console.log('✅ 超分结果已缓存:', cachePath);
			return cachePath;
		} catch (error) {
			console.error('❌ 保存超分缓存失败:', error);
			throw error;
		}
	}

	/**
	 * 执行超分处理 (文件路径版本，保持兼容性)
	 */
	async upscaleImage(imagePath: string, timeout: number = 120.0): Promise<Uint8Array> {
		if (!this.initialized) {
			throw new Error('PyO3 超分管理器未初始化');
		}

		if (!this.available) {
			throw new Error('PyO3 超分功能不可用');
		}

		try {
			console.log('🚀 开始 PyO3 超分 (文件路径):', imagePath);
			console.log('  模型:', this._currentModel.modelName);
			console.log('  缩放:', this._currentModel.scale + 'x');

			const result = await invoke<number[]>('pyo3_upscale_image', {
				imagePath,
				modelName: this._currentModel.modelName,
				scale: this._currentModel.scale,
				tileSize: this._currentModel.tileSize,
				noiseLevel: this._currentModel.noiseLevel,
				timeout
			});

			console.log('✅ PyO3 超分完成 (文件路径), 数据大小:', result.length);
			return new Uint8Array(result);
		} catch (error) {
			console.error('❌ PyO3 超分失败 (文件路径):', error);
			throw error;
		}
	}

	/**
	 * 检查缓存是否存在
	 */
	async checkCache(imageHash: string): Promise<string | null> {
		try {
			const result = await invoke<string | null>('check_pyo3_upscale_cache', {
				imageHash,
				modelName: this._currentModel.modelName,
				scale: this._currentModel.scale,
				tileSize: this._currentModel.tileSize,
				noiseLevel: this._currentModel.noiseLevel
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
		this._currentModel = {
			modelId: 0,
			modelName: 'cunet',
			scale: 2,
			tileSize: 64,
			noiseLevel: 0
		};
	}

	/**
	 * 取消指定 jobKey 的任务
	 */
	async cancelJob(jobKey: string): Promise<void> {
		if (!this.initialized) {
			return;
		}
		try {
			await invoke('pyo3_cancel_job', { jobKey });
			console.log('✅ 已请求取消 PyO3 任务', { jobKey });
		} catch (error) {
			console.error('❌ 取消 PyO3 任务失败:', error);
		}
	}
}

// 导出单例实例
export const pyo3UpscaleManager = PyO3UpscaleManager.getInstance();
