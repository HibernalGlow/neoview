/**
 * 数据源策略模块
 * 定义不同类型图片源的加载策略
 * 参考 NeeView ViewSourceStrategy 设计
 */

import { invoke } from '@tauri-apps/api/core';
import { type PageInfo, type PageDataSource, type ImageSize } from '../types';

/** 数据源类型 */
export type SourceType = 
	| 'filesystem'    // 文件系统
	| 'archive'       // 压缩包
	| 'network'       // 网络
	| 'memory';       // 内存

/** 加载选项 */
export interface LoadOptions {
	signal?: AbortSignal;
	onProgress?: (loaded: number, total: number) => void;
	maxSize?: ImageSize;
	quality?: number;
}

/** 源策略接口 */
export interface ISourceStrategy {
	readonly type: SourceType;
	
	/** 加载页面数据 */
	load(page: PageInfo, options?: LoadOptions): Promise<PageDataSource>;
	
	/** 检查是否支持 */
	supports(page: PageInfo): boolean;
	
	/** 取消加载 */
	cancel(): void;
}

/**
 * 文件系统源策略
 */
export class FileSystemSourceStrategy implements ISourceStrategy {
	readonly type: SourceType = 'filesystem';
	private abortController: AbortController | null = null;

	supports(page: PageInfo): boolean {
		return !page.archivePath;
	}

	async load(page: PageInfo, options?: LoadOptions): Promise<PageDataSource> {
		this.abortController = new AbortController();
		const signal = options?.signal || this.abortController.signal;

		try {
			// 检查取消
			if (signal.aborted) {
				throw new Error('Load cancelled');
			}

			// 调用 Tauri 后端加载图片
			const base64Data = await invoke<string>('load_image', {
				path: page.path
			});

			// 检查取消
			if (signal.aborted) {
				throw new Error('Load cancelled');
			}

			// 转换为 Blob
			const response = await fetch(base64Data);
			const blob = await response.blob();
			const objectUrl = URL.createObjectURL(blob);

			// 获取图片尺寸
			const size = await this.getImageSize(objectUrl);

			return {
				data: blob,
				dataUrl: base64Data,
				objectUrl,
				dataSize: blob.size,
				pictureInfo: {
					size,
					format: this.getFormat(page.path),
					fileSize: blob.size
				},
				errorMessage: null
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return {
				data: null,
				dataUrl: null,
				objectUrl: null,
				dataSize: 0,
				pictureInfo: null,
				errorMessage: message
			};
		} finally {
			this.abortController = null;
		}
	}

	cancel(): void {
		this.abortController?.abort();
	}

	private async getImageSize(url: string): Promise<ImageSize> {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				resolve({ width: img.naturalWidth, height: img.naturalHeight });
			};
			img.onerror = () => {
				resolve({ width: 0, height: 0 });
			};
			img.src = url;
		});
	}

	private getFormat(path: string): string {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		const formatMap: Record<string, string> = {
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'png': 'image/png',
			'gif': 'image/gif',
			'webp': 'image/webp',
			'avif': 'image/avif',
			'bmp': 'image/bmp'
		};
		return formatMap[ext] || 'image/unknown';
	}
}

/**
 * 压缩包源策略
 */
export class ArchiveSourceStrategy implements ISourceStrategy {
	readonly type: SourceType = 'archive';
	private abortController: AbortController | null = null;

	supports(page: PageInfo): boolean {
		return !!page.archivePath;
	}

	async load(page: PageInfo, options?: LoadOptions): Promise<PageDataSource> {
		this.abortController = new AbortController();
		const signal = options?.signal || this.abortController.signal;

		try {
			if (signal.aborted) {
				throw new Error('Load cancelled');
			}

			if (!page.archivePath) {
				throw new Error('Archive path is required');
			}

			// 调用 Tauri 后端从压缩包加载
			const base64Data = await invoke<string>('load_image_from_archive', {
				archivePath: page.archivePath,
				entryPath: page.path
			});

			if (signal.aborted) {
				throw new Error('Load cancelled');
			}

			// 转换为 Blob
			const response = await fetch(base64Data);
			const blob = await response.blob();
			const objectUrl = URL.createObjectURL(blob);

			// 获取图片尺寸
			const size = await this.getImageSize(objectUrl);

			return {
				data: blob,
				dataUrl: base64Data,
				objectUrl,
				dataSize: blob.size,
				pictureInfo: {
					size,
					format: this.getFormat(page.path),
					fileSize: blob.size
				},
				errorMessage: null
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return {
				data: null,
				dataUrl: null,
				objectUrl: null,
				dataSize: 0,
				pictureInfo: null,
				errorMessage: message
			};
		} finally {
			this.abortController = null;
		}
	}

	cancel(): void {
		this.abortController?.abort();
	}

	private async getImageSize(url: string): Promise<ImageSize> {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				resolve({ width: img.naturalWidth, height: img.naturalHeight });
			};
			img.onerror = () => {
				resolve({ width: 0, height: 0 });
			};
			img.src = url;
		});
	}

	private getFormat(path: string): string {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		const formatMap: Record<string, string> = {
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'png': 'image/png',
			'gif': 'image/gif',
			'webp': 'image/webp',
			'avif': 'image/avif',
			'bmp': 'image/bmp'
		};
		return formatMap[ext] || 'image/unknown';
	}
}

/**
 * 源策略工厂
 */
export class SourceStrategyFactory {
	private static strategies: ISourceStrategy[] = [
		new ArchiveSourceStrategy(),
		new FileSystemSourceStrategy()
	];

	/** 获取适合的策略 */
	static getStrategy(page: PageInfo): ISourceStrategy | null {
		for (const strategy of this.strategies) {
			if (strategy.supports(page)) {
				return strategy;
			}
		}
		return null;
	}

	/** 注册自定义策略 */
	static registerStrategy(strategy: ISourceStrategy): void {
		// 插入到最前面，优先使用
		this.strategies.unshift(strategy);
	}

	/** 创建新策略实例 */
	static createStrategy(page: PageInfo): ISourceStrategy {
		const strategy = this.getStrategy(page);
		if (!strategy) {
			throw new Error(`No strategy found for page: ${page.path}`);
		}
		
		// 返回新实例以避免状态冲突
		if (strategy instanceof ArchiveSourceStrategy) {
			return new ArchiveSourceStrategy();
		}
		return new FileSystemSourceStrategy();
	}
}

/** 加载页面数据 */
export async function loadPageData(
	page: PageInfo,
	options?: LoadOptions
): Promise<PageDataSource> {
	const strategy = SourceStrategyFactory.createStrategy(page);
	return strategy.load(page, options);
}
