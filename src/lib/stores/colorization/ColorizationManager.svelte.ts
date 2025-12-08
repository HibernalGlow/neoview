/**
 * PyO3 Colorization Manager
 * 使用 PyO3 调用 Python manga-colorization-v2 进行漫画上色
 * 架构复用超分管理器模式
 */

import { invoke } from '@tauri-apps/api/core';

export interface ColorizeModel {
	modelName: string;
	colorizationSize: number;
	denoiseSigma: number;
}

export interface ColorizeCacheStats {
	totalFiles: number;
	totalSize: number;
	cacheDir: string;
}

export class ColorizationManager {
	private static instance: ColorizationManager | null = null;
	private initialized = $state(false);
	private available = $state(false);
	private modelsExist = $state(false);
	private modelLoaded = $state(false);
	private _currentModel = $state<ColorizeModel>({
		modelName: 'manga_colorization_v2',
		colorizationSize: 576,
		denoiseSigma: 25
	});

	// 上色开关（独立于超分）
	private _enabled = $state(false);
	// 上色后是否超分
	private _upscaleAfterColorize = $state(false);

	private constructor() {}

	static getInstance(): ColorizationManager {
		if (!ColorizationManager.instance) {
			ColorizationManager.instance = new ColorizationManager();
		}
		return ColorizationManager.instance;
	}

	/**
	 * 初始化上色管理器
	 */
	async initialize(modelDir: string, cacheDir: string): Promise<void> {
		if (this.initialized) {
			console.log('🎨 上色管理器已初始化');
			return;
		}

		try {
			console.log('🚀 初始化上色管理器...');
			console.log('  模型目录:', modelDir);
			console.log('  缓存目录:', cacheDir);

			await invoke('init_pyo3_colorizer', {
				modelDir,
				cacheDir
			});

			// 检查 PyTorch 可用性
			this.available = await invoke('check_pyo3_colorizer_availability');

			if (this.available) {
				// 检查模型文件是否存在
				this.modelsExist = await invoke('check_colorize_models_exist');
				console.log('✅ 上色管理器初始化成功');
				console.log('  PyTorch 可用:', this.available);
				console.log('  模型文件存在:', this.modelsExist);
			} else {
				console.warn('⚠️ 上色功能不可用 (PyTorch 未安装)');
			}

			this.initialized = true;
		} catch (error) {
			console.error('❌ 初始化上色管理器失败:', error);
			throw error;
		}
	}

	/**
	 * 加载上色模型到 GPU
	 */
	async loadModel(device: string = 'cuda'): Promise<void> {
		if (!this.initialized) {
			throw new Error('上色管理器未初始化');
		}

		if (!this.available) {
			throw new Error('PyTorch 不可用');
		}

		if (!this.modelsExist) {
			throw new Error('模型文件不存在');
		}

		if (this.modelLoaded) {
			console.log('✅ 上色模型已加载');
			return;
		}

		try {
			console.log('🔄 加载上色模型到', device);
			await invoke('load_colorize_model', { device });
			this.modelLoaded = true;
			console.log('✅ 上色模型加载成功');
		} catch (error) {
			console.error('❌ 加载上色模型失败:', error);
			throw error;
		}
	}

	/**
	 * 卸载模型释放 GPU 内存
	 */
	async unloadModel(): Promise<void> {
		if (!this.modelLoaded) {
			return;
		}

		try {
			await invoke('unload_colorize_model');
			this.modelLoaded = false;
			console.log('✅ 上色模型已卸载');
		} catch (error) {
			console.error('❌ 卸载上色模型失败:', error);
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
	 * 检查模型是否已加载
	 */
	isModelLoaded(): boolean {
		return this.modelLoaded;
	}

	/**
	 * 检查模型文件是否存在
	 */
	areModelsExist(): boolean {
		return this.modelsExist;
	}

	/**
	 * 获取当前模型配置
	 */
	get currentModel() {
		return this._currentModel;
	}

	/**
	 * 获取上色开关状态
	 */
	get enabled() {
		return this._enabled;
	}

	/**
	 * 设置上色开关
	 */
	set enabled(value: boolean) {
		this._enabled = value;
		console.log('🎨 上色功能:', value ? '开启' : '关闭');
	}

	/**
	 * 获取上色后超分开关状态
	 */
	get upscaleAfterColorize() {
		return this._upscaleAfterColorize;
	}

	/**
	 * 设置上色后超分开关
	 */
	set upscaleAfterColorize(value: boolean) {
		this._upscaleAfterColorize = value;
		console.log('🚀 上色后超分:', value ? '开启' : '关闭');
	}

	/**
	 * 设置上色尺寸 (需为 32 的倍数，推荐 576 以下)
	 */
	setColorizationSize(size: number): void {
		// 确保是 32 的倍数
		const adjustedSize = Math.floor(size / 32) * 32;
		this._currentModel.colorizationSize = Math.max(32, Math.min(adjustedSize, 1024));
		console.log('📐 设置上色尺寸:', this._currentModel.colorizationSize);
	}

	/**
	 * 设置降噪强度 (0-255)
	 */
	setDenoiseSigma(sigma: number): void {
		this._currentModel.denoiseSigma = Math.max(0, Math.min(sigma, 255));
		console.log('🔊 设置降噪强度:', this._currentModel.denoiseSigma);
	}

	/**
	 * 执行上色处理 (内存流版本)
	 */
	async colorizeImageMemory(imageData: Uint8Array): Promise<Uint8Array> {
		if (!this.initialized) {
			throw new Error('上色管理器未初始化');
		}

		if (!this.available) {
			throw new Error('上色功能不可用');
		}

		try {
			console.log('🎨 开始上色处理');
			console.log('  上色尺寸:', this._currentModel.colorizationSize);
			console.log('  降噪强度:', this._currentModel.denoiseSigma);
			console.log('  输入数据大小:', imageData.length, 'bytes');

			const result = await invoke<number[]>('pyo3_colorize_image_memory', {
				imageData: Array.from(imageData),
				colorizationSize: this._currentModel.colorizationSize,
				denoiseSigma: this._currentModel.denoiseSigma
			});

			console.log('✅ 上色处理完成, 数据大小:', result.length);
			return new Uint8Array(result);
		} catch (error) {
			console.error('❌ 上色处理失败:', error);
			throw error;
		}
	}

	/**
	 * 上色并超分组合处理
	 */
	async colorizeAndUpscale(
		imageData: Uint8Array,
		upscaleOptions?: {
			modelName?: string;
			scale?: number;
			tileSize?: number;
			noiseLevel?: number;
		}
	): Promise<Uint8Array> {
		if (!this.initialized) {
			throw new Error('上色管理器未初始化');
		}

		try {
			console.log('🎨🚀 开始上色+超分处理');

			const result = await invoke<number[]>('pyo3_colorize_and_upscale', {
				imageData: Array.from(imageData),
				colorizationSize: this._currentModel.colorizationSize,
				denoiseSigma: this._currentModel.denoiseSigma,
				enableUpscale: this._upscaleAfterColorize,
				upscaleModelName: upscaleOptions?.modelName,
				upscaleScale: upscaleOptions?.scale,
				upscaleTileSize: upscaleOptions?.tileSize,
				upscaleNoiseLevel: upscaleOptions?.noiseLevel
			});

			console.log('✅ 上色+超分处理完成, 数据大小:', result.length);
			return new Uint8Array(result);
		} catch (error) {
			console.error('❌ 上色+超分处理失败:', error);
			throw error;
		}
	}

	/**
	 * 保存上色结果到缓存
	 */
	async saveColorizeCache(imageHash: string, resultData: Uint8Array): Promise<string> {
		if (resultData.length === 0) {
			console.warn('saveColorizeCache 跳过：数据为空', imageHash);
			return '';
		}

		try {
			console.log('💾 保存上色结果到缓存:', imageHash);

			const cachePath = await invoke<string>('pyo3_save_colorize_cache', {
				imageHash,
				colorizationSize: this._currentModel.colorizationSize,
				denoiseSigma: this._currentModel.denoiseSigma,
				resultData: Array.from(resultData)
			});

			console.log('✅ 上色结果已缓存:', cachePath);
			return cachePath;
		} catch (error) {
			console.error('❌ 保存上色缓存失败:', error);
			throw error;
		}
	}

	/**
	 * 检查缓存是否存在
	 */
	async checkCache(imageHash: string): Promise<string | null> {
		try {
			const result = await invoke<string | null>('check_pyo3_colorize_cache', {
				imageHash,
				colorizationSize: this._currentModel.colorizationSize,
				denoiseSigma: this._currentModel.denoiseSigma
			});
			return result;
		} catch (error) {
			console.error('检查上色缓存失败:', error);
			return null;
		}
	}

	/**
	 * 读取缓存文件
	 */
	async readCacheFile(cachePath: string): Promise<Uint8Array> {
		try {
			const result = await invoke<number[]>('read_colorize_cache_file', { cachePath });
			return new Uint8Array(result);
		} catch (error) {
			console.error('读取上色缓存失败:', error);
			throw error;
		}
	}

	/**
	 * 获取缓存统计信息
	 */
	async getCacheStats(): Promise<ColorizeCacheStats> {
		try {
			return await invoke<ColorizeCacheStats>('get_pyo3_colorize_cache_stats');
		} catch (error) {
			console.error('获取上色缓存统计失败:', error);
			throw error;
		}
	}

	/**
	 * 清理缓存
	 */
	async cleanupCache(maxAgeDays: number = 30): Promise<number> {
		try {
			const removedCount = await invoke<number>('cleanup_pyo3_colorize_cache', {
				maxAgeDays
			});
			console.log(`🗑️ 已清理 ${removedCount} 个过期上色缓存文件`);
			return removedCount;
		} catch (error) {
			console.error('清理上色缓存失败:', error);
			throw error;
		}
	}

	/**
	 * 重置管理器
	 */
	reset(): void {
		this.initialized = false;
		this.available = false;
		this.modelsExist = false;
		this.modelLoaded = false;
		this._enabled = false;
		this._upscaleAfterColorize = false;
		this._currentModel = {
			modelName: 'manga_colorization_v2',
			colorizationSize: 576,
			denoiseSigma: 25
		};
	}
}

// 导出单例实例
export const colorizationManager = ColorizationManager.getInstance();
