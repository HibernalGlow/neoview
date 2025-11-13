/**
 * 超分系统迁移助手
 * 从旧版命令行系统迁移到新版内存流系统
 */

/**
 * 转换 data URL 到 Uint8Array
 */
export async function dataUrlToUint8Array(dataUrl: string): Promise<Uint8Array> {
	if (dataUrl.startsWith('data:')) {
		const base64 = dataUrl.split(',')[1];
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	} else if (dataUrl.startsWith('blob:')) {
		const response = await fetch(dataUrl);
		const blob = await response.blob();
		return new Uint8Array(await blob.arrayBuffer());
	}
	throw new Error('不支持的 URL 格式');
}

/**
 * 转换 Uint8Array 到 Blob
 */
export function uint8ArrayToBlob(data: Uint8Array, mimeType: string = 'image/webp'): Blob {
	return new Blob([data], { type: mimeType });
}

/**
 * 计算图片哈希
 */
export async function calculateImageHash(data: Uint8Array): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', data as ArrayBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * 检查是否是有效的图片数据
 */
export function isValidImageData(data: string): boolean {
	if (!data) return false;
	if (data.length < 100) return false; // 太短
	if (!data.startsWith('data:image/') && !data.startsWith('blob:')) return false;
	return true;
}

/**
 * 模型名称映射
 */
export const MODEL_MAPPING = {
	// 旧模型名 → 新模型名
	'realesr-animevideov3': 'REALESRGAN_X4PLUS_UP4X',
	'realesrgan-x4plus': 'REALESRGAN_X4PLUS_UP4X',
	'realesrgan-x4plus-anime': 'REALESRGAN_X4PLUSANIME_UP4X',
	'models-cunet': 'WAIFU2X_CUNET_UP2X',
	'models-se': 'REALCUGAN_PRO_UP2X',
	
	// 新模型名（直接使用）
	'REALESRGAN_X4PLUS_UP4X': 'REALESRGAN_X4PLUS_UP4X',
	'REALESRGAN_X4PLUSANIME_UP4X': 'REALESRGAN_X4PLUSANIME_UP4X',
	'WAIFU2X_CUNET_UP2X': 'WAIFU2X_CUNET_UP2X',
	'WAIFU2X_CUNET_UP4X': 'WAIFU2X_CUNET_UP4X',
	'REALCUGAN_PRO_UP2X': 'REALCUGAN_PRO_UP2X',
	'REALCUGAN_PRO_UP3X': 'REALCUGAN_PRO_UP3X',
	'REALCUGAN_PRO_UP4X': 'REALCUGAN_PRO_UP4X'
};

/**
 * 转换模型名称
 */
export function convertModelName(oldModel: string): string {
	return (MODEL_MAPPING as Record<string, string>)[oldModel] || 'REALESRGAN_X4PLUS_UP4X';
}

/**
 * 迁移配置
 */
export interface MigrationConfig {
	enableMemoryUpscale: boolean;
	enablePreupscale: boolean;
	maxCacheSize: number; // MB
	defaultModel: string;
	defaultScale: number;
}

export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
	enableMemoryUpscale: true,
	enablePreupscale: true,
	maxCacheSize: 500,
	defaultModel: 'REALESRGAN_X4PLUS_UP4X',
	defaultScale: 2.0
};

/**
 * 保存迁移配置
 */
export function saveMigrationConfig(config: MigrationConfig): void {
	localStorage.setItem('upscaleMigrationConfig', JSON.stringify(config));
}

/**
 * 加载迁移配置
 */
export function loadMigrationConfig(): MigrationConfig {
	try {
		const saved = localStorage.getItem('upscaleMigrationConfig');
		if (saved) {
			return { ...DEFAULT_MIGRATION_CONFIG, ...JSON.parse(saved) };
		}
	} catch (error) {
		console.warn('[Migration] 加载配置失败:', error);
	}
	return DEFAULT_MIGRATION_CONFIG;
}

/**
 * 清理旧的超分缓存
 */
export async function cleanupOldUpscaleCache(): Promise<void> {
	try {
		// 清理 localStorage 中的旧缓存
		const keysToRemove: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && (key.startsWith('upscale_') || key.startsWith('cache_'))) {
				keysToRemove.push(key);
			}
		}
		
		for (const key of keysToRemove) {
			localStorage.removeItem(key);
		}
		
		console.log('[Migration] 已清理', keysToRemove.length, '个旧缓存项');
	} catch (error) {
		console.error('[Migration] 清理旧缓存失败:', error);
	}
}

/**
 * 迁移统计
 */
export interface MigrationStats {
	totalMigrated: number;
	successCount: number;
	failureCount: number;
	startTime: number;
	endTime?: number;
	duration?: number;
}

let migrationStats: MigrationStats = {
	totalMigrated: 0,
	successCount: 0,
	failureCount: 0,
	startTime: 0
};

/**
 * 开始迁移统计
 */
export function startMigrationStats(): void {
	migrationStats = {
		totalMigrated: 0,
		successCount: 0,
		failureCount: 0,
		startTime: Date.now()
	};
}

/**
 * 记录成功
 */
export function recordMigrationSuccess(): void {
	migrationStats.successCount++;
	migrationStats.totalMigrated++;
}

/**
 * 记录失败
 */
export function recordMigrationFailure(): void {
	migrationStats.failureCount++;
	migrationStats.totalMigrated++;
}

/**
 * 完成迁移统计
 */
export function endMigrationStats(): MigrationStats {
	migrationStats.endTime = Date.now();
	migrationStats.duration = migrationStats.endTime - migrationStats.startTime;
	return { ...migrationStats };
}

/**
 * 获取迁移统计
 */
export function getMigrationStats(): MigrationStats {
	return { ...migrationStats };
}

/**
 * 日志工具
 */
export const MigrationLogger = {
	log: (message: string, ...args: unknown[]) => {
		console.log(`[Migration] ${message}`, ...args);
	},
	warn: (message: string, ...args: unknown[]) => {
		console.warn(`[Migration] ${message}`, ...args);
	},
	error: (message: string, ...args: unknown[]) => {
		console.error(`[Migration] ${message}`, ...args);
	},
	success: (message: string, ...args: unknown[]) => {
		console.log(`[Migration] ✅ ${message}`, ...args);
	}
};
