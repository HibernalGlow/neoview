/**
 * 图像裁剪（Trim）状态管理
 *
 * 参考：
 * - NeeView ImageTrimConfig.cs — 四方向百分比裁剪 + 互斥约束
 * - OpenComic readingImageClip — per-book 裁剪 + 水平/垂直联动
 *
 * 功能：
 * - 四边独立百分比裁剪（去黑边/白边/扫描边距）
 * - 对向之和不超过 MAX_RATE (90%) 的自动约束
 * - 自动裁剪（Canvas 边缘颜色检测）
 * - localStorage 持久化
 */

import { writable, get } from 'svelte/store';

// ─── 常量 ───────────────────────────────────────────────────────────────────

/** 对向之和上限（90%），与 NeeView _maxRate 相同 */
const MAX_RATE = 90;

/** localStorage key */
const STORAGE_KEY = 'neoview-image-trim-settings';

// ─── 类型 ───────────────────────────────────────────────────────────────────

/** 自动裁剪的目标颜色 */
export type AutoTrimTarget = 'black' | 'white' | 'auto';

/** 图像裁剪设置 */
export interface ImageTrimSettings {
	/** 总开关 */
	enabled: boolean;
	/** 上裁剪百分比 0–MAX_RATE */
	top: number;
	/** 下裁剪百分比 0–MAX_RATE */
	bottom: number;
	/** 左裁剪百分比 0–MAX_RATE */
	left: number;
	/** 右裁剪百分比 0–MAX_RATE */
	right: number;
	/** 水平联动（左右同步） */
	linkHorizontal: boolean;
	/** 垂直联动（上下同步） */
	linkVertical: boolean;
	/** 自动裁剪开关 */
	autoTrim: boolean;
	/** 自动裁剪边缘颜色容差 0–255 */
	autoTrimThreshold: number;
	/** 裁剪目标颜色 */
	autoTrimTarget: AutoTrimTarget;
}

/** 自动裁剪结果 */
export interface AutoTrimResult {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

// ─── 默认值 ─────────────────────────────────────────────────────────────────

export const defaultImageTrimSettings: ImageTrimSettings = {
	enabled: false,
	top: 0,
	bottom: 0,
	left: 0,
	right: 0,
	linkHorizontal: false,
	linkVertical: false,
	autoTrim: false,
	autoTrimThreshold: 30,
	autoTrimTarget: 'auto',
};

// ─── 工具函数 ───────────────────────────────────────────────────────────────

/** 限位：0 ≤ value ≤ MAX_RATE */
function clampTrim(value: number): number {
	return Math.max(0, Math.min(MAX_RATE, Math.round(value * 10) / 10));
}

/**
 * NeeView 式互斥约束：对向之和 ≤ MAX_RATE
 * 修改一个方向时如果超限，压缩对向值
 */
function constrainOpposite(changed: number, opposite: number): number {
	if (changed + opposite > MAX_RATE) {
		return MAX_RATE - changed;
	}
	return opposite;
}

/**
 * 从 ImageTrimSettings 生成 CSS clip-path inset 值
 *
 * inset(top right bottom left) — 百分比
 */
export function trimToClipPath(settings: ImageTrimSettings): string {
	if (!settings.enabled) return '';
	const { top, bottom, left, right } = settings;

	// 无裁剪时不生成
	if (top === 0 && bottom === 0 && left === 0 && right === 0) {
		return '';
	}

	return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}

/**
 * 合并裁剪的 clip-path（用户裁剪 + 页面分割裁剪）
 *
 * 两者都是 inset()，需要将百分比叠加
 * 如果只有一个存在，直接返回
 */
export function mergeClipPaths(trimClipPath: string, splitClipPath: string): string {
	// 都为空
	if (!trimClipPath && !splitClipPath) return 'none';
	if (!trimClipPath) return splitClipPath;
	if (!splitClipPath || splitClipPath === 'none') return trimClipPath;

	// 解析 inset(T% R% B% L%) 为数值数组
	const parse = (s: string): [number, number, number, number] | null => {
		const m = s.match(/inset\(\s*([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s*\)/);
		if (!m) return null;
		return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
	};

	const t = parse(trimClipPath);
	const s = parse(splitClipPath);

	if (!t) return splitClipPath;
	if (!s) return trimClipPath;

	// 合并方式：取各方向最大值（更保守的裁剪）
	const merged: [number, number, number, number] = [
		Math.max(t[0], s[0]),
		Math.max(t[1], s[1]),
		Math.max(t[2], s[2]),
		Math.max(t[3], s[3]),
	];

	return `inset(${merged[0]}% ${merged[1]}% ${merged[2]}% ${merged[3]}%)`;
}

/**
 * 根据裁剪设置计算裁剪后的有效图像宽高比
 * 用于双页布局等需要准确宽高比的场景（参考 OpenComic calculateImagesDataWithClip）
 */
export function getEffectiveDimensions(
	originalWidth: number,
	originalHeight: number,
	settings: ImageTrimSettings
): { width: number; height: number; aspectRatio: number } {
	if (!settings.enabled) {
		return {
			width: originalWidth,
			height: originalHeight,
			aspectRatio: originalWidth / originalHeight,
		};
	}

	const clipH = (settings.left + settings.right) / 100;
	const clipV = (settings.top + settings.bottom) / 100;

	const width = Math.round(originalWidth * (1 - clipH));
	const height = Math.round(originalHeight * (1 - clipV));

	return {
		width,
		height,
		aspectRatio: height > 0 ? width / height : 1,
	};
}

// ─── 自动裁剪（Canvas 边缘检测） ────────────────────────────────────────────

/** 自动裁剪结果缓存 (url → result) */
const autoTrimCache = new Map<string, AutoTrimResult>();

/**
 * 检测图片边缘颜色并计算最佳裁剪百分比
 *
 * 算法：从四边向内扫描像素行/列，如果整行/列的像素颜色
 * 都在目标颜色的容差范围内，则认为该行/列是边框
 *
 * @param imageUrl 图片 URL
 * @param threshold 颜色容差 (0–255)
 * @param target 目标颜色 ('black' | 'white' | 'auto')
 * @returns 四边裁剪百分比
 */
export async function detectAutoTrim(
	imageUrl: string,
	threshold: number = 30,
	target: AutoTrimTarget = 'auto'
): Promise<AutoTrimResult> {
	// 检查缓存
	const cacheKey = `${imageUrl}|${threshold}|${target}`;
	const cached = autoTrimCache.get(cacheKey);
	if (cached) return cached;

	return new Promise<AutoTrimResult>((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';

		img.onload = () => {
			try {
				const result = analyzeEdges(img, threshold, target);
				autoTrimCache.set(cacheKey, result);
				// 限制缓存大小
				if (autoTrimCache.size > 200) {
					const firstKey = autoTrimCache.keys().next().value;
					if (firstKey !== undefined) autoTrimCache.delete(firstKey);
				}
				resolve(result);
			} catch {
				resolve({ top: 0, bottom: 0, left: 0, right: 0 });
			}
		};

		img.onerror = () => {
			resolve({ top: 0, bottom: 0, left: 0, right: 0 });
		};

		img.src = imageUrl;
	});
}

/**
 * 在 Canvas 上分析图片边缘
 */
function analyzeEdges(
	img: HTMLImageElement,
	threshold: number,
	target: AutoTrimTarget
): AutoTrimResult {
	// 使用缩小版图片以加速分析（最大 512px 边长）
	const maxDim = 512;
	const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
	const w = Math.round(img.naturalWidth * scale);
	const h = Math.round(img.naturalHeight * scale);

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return { top: 0, bottom: 0, left: 0, right: 0 };

	ctx.drawImage(img, 0, 0, w, h);
	const imageData = ctx.getImageData(0, 0, w, h);
	const data = imageData.data;

	// 确定目标颜色
	let targetR: number, targetG: number, targetB: number;
	if (target === 'auto') {
		// 采样四角确定最可能的边框色
		const corners = [
			getPixel(data, 0, 0, w),
			getPixel(data, w - 1, 0, w),
			getPixel(data, 0, h - 1, w),
			getPixel(data, w - 1, h - 1, w),
		];
		const avgR = corners.reduce((s, c) => s + c[0], 0) / 4;
		const avgG = corners.reduce((s, c) => s + c[1], 0) / 4;
		const avgB = corners.reduce((s, c) => s + c[2], 0) / 4;
		targetR = avgR;
		targetG = avgG;
		targetB = avgB;
	} else if (target === 'white') {
		targetR = targetG = targetB = 255;
	} else {
		targetR = targetG = targetB = 0;
	}

	// 最大裁剪限制（每边不超过 40%）
	const maxCropPx = 0.4;

	// 从上向下扫描
	let topRows = 0;
	for (let y = 0; y < h * maxCropPx; y++) {
		if (isRowBorder(data, y, w, targetR, targetG, targetB, threshold)) {
			topRows++;
		} else {
			break;
		}
	}

	// 从下向上扫描
	let bottomRows = 0;
	for (let y = h - 1; y >= h * (1 - maxCropPx); y--) {
		if (isRowBorder(data, y, w, targetR, targetG, targetB, threshold)) {
			bottomRows++;
		} else {
			break;
		}
	}

	// 从左向右扫描
	let leftCols = 0;
	for (let x = 0; x < w * maxCropPx; x++) {
		if (isColBorder(data, x, w, h, targetR, targetG, targetB, threshold)) {
			leftCols++;
		} else {
			break;
		}
	}

	// 从右向左扫描
	let rightCols = 0;
	for (let x = w - 1; x >= w * (1 - maxCropPx); x--) {
		if (isColBorder(data, x, w, h, targetR, targetG, targetB, threshold)) {
			rightCols++;
		} else {
			break;
		}
	}

	return {
		top: Math.round((topRows / h) * 1000) / 10,
		bottom: Math.round((bottomRows / h) * 1000) / 10,
		left: Math.round((leftCols / w) * 1000) / 10,
		right: Math.round((rightCols / w) * 1000) / 10,
	};
}

function getPixel(data: Uint8ClampedArray, x: number, y: number, w: number): [number, number, number] {
	const i = (y * w + x) * 4;
	return [data[i], data[i + 1], data[i + 2]];
}

/**
 * 判断一行像素是否全为"边框色"
 * 采用抽样检测（每 4 像素取 1 个，提升性能）
 */
function isRowBorder(
	data: Uint8ClampedArray,
	y: number,
	w: number,
	tR: number,
	tG: number,
	tB: number,
	threshold: number
): boolean {
	const step = Math.max(1, Math.floor(w / 128)); // 每行最多 128 个采样点
	let borderCount = 0;
	let totalSamples = 0;

	for (let x = 0; x < w; x += step) {
		const i = (y * w + x) * 4;
		const dr = Math.abs(data[i] - tR);
		const dg = Math.abs(data[i + 1] - tG);
		const db = Math.abs(data[i + 2] - tB);
		totalSamples++;
		if (dr <= threshold && dg <= threshold && db <= threshold) {
			borderCount++;
		}
	}

	// 90% 以上的采样点匹配边框色
	return totalSamples > 0 && borderCount / totalSamples >= 0.9;
}

/**
 * 判断一列像素是否全为"边框色"
 */
function isColBorder(
	data: Uint8ClampedArray,
	x: number,
	w: number,
	h: number,
	tR: number,
	tG: number,
	tB: number,
	threshold: number
): boolean {
	const step = Math.max(1, Math.floor(h / 128));
	let borderCount = 0;
	let totalSamples = 0;

	for (let y = 0; y < h; y += step) {
		const i = (y * w + x) * 4;
		const dr = Math.abs(data[i] - tR);
		const dg = Math.abs(data[i + 1] - tG);
		const db = Math.abs(data[i + 2] - tB);
		totalSamples++;
		if (dr <= threshold && dg <= threshold && db <= threshold) {
			borderCount++;
		}
	}

	return totalSamples > 0 && borderCount / totalSamples >= 0.9;
}

/** 清空自动裁剪缓存 */
export function clearAutoTrimCache(): void {
	autoTrimCache.clear();
}

// ─── Store ──────────────────────────────────────────────────────────────────

function loadSettings(): ImageTrimSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return { ...defaultImageTrimSettings, ...parsed };
		}
	} catch (err) {
		console.error('❌ 加载图像裁剪设置失败:', err);
	}
	return { ...defaultImageTrimSettings };
}

function saveSettings(settings: ImageTrimSettings): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch (err) {
		console.error('❌ 保存图像裁剪设置失败:', err);
	}
}

const { subscribe, set, update } = writable<ImageTrimSettings>(loadSettings());

/**
 * 图像裁剪 Store
 */
export const imageTrimStore = {
	subscribe,

	/** 获取当前 CSS clip-path */
	getClipPath: (): string => {
		return trimToClipPath(get({ subscribe }));
	},

	/** 是否有裁剪效果激活 */
	isActive: (): boolean => {
		const s = get({ subscribe });
		return s.enabled && (s.top > 0 || s.bottom > 0 || s.left > 0 || s.right > 0);
	},

	/** 切换开关 */
	toggleEnabled: (): void => {
		update((s) => {
			const newSettings = { ...s, enabled: !s.enabled };
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 设置启用状态 */
	setEnabled: (enabled: boolean): void => {
		update((s) => {
			const newSettings = { ...s, enabled };
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 设置上裁剪（自动互斥约束） */
	setTop: (value: number): void => {
		update((s) => {
			const top = clampTrim(value);
			const bottom = constrainOpposite(top, s.bottom);
			const newSettings = s.linkVertical
				? { ...s, top, bottom: top }
				: { ...s, top, bottom };
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 设置下裁剪 */
	setBottom: (value: number): void => {
		update((s) => {
			const bottom = clampTrim(value);
			const top = constrainOpposite(bottom, s.top);
			const newSettings = s.linkVertical
				? { ...s, bottom, top: bottom }
				: { ...s, top, bottom };
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 设置左裁剪 */
	setLeft: (value: number): void => {
		update((s) => {
			const left = clampTrim(value);
			const right = constrainOpposite(left, s.right);
			const newSettings = s.linkHorizontal
				? { ...s, left, right: left }
				: { ...s, left, right };
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 设置右裁剪 */
	setRight: (value: number): void => {
		update((s) => {
			const right = clampTrim(value);
			const left = constrainOpposite(right, s.left);
			const newSettings = s.linkHorizontal
				? { ...s, right, left: right }
				: { ...s, left, right };
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 切换水平联动 */
	toggleLinkHorizontal: (): void => {
		update((s) => {
			const linkHorizontal = !s.linkHorizontal;
			// 开启时同步左右值为较大的那个
			const synced = linkHorizontal ? Math.max(s.left, s.right) : undefined;
			const newSettings = {
				...s,
				linkHorizontal,
				...(synced !== undefined ? { left: synced, right: synced } : {}),
			};
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 切换垂直联动 */
	toggleLinkVertical: (): void => {
		update((s) => {
			const linkVertical = !s.linkVertical;
			const synced = linkVertical ? Math.max(s.top, s.bottom) : undefined;
			const newSettings = {
				...s,
				linkVertical,
				...(synced !== undefined ? { top: synced, bottom: synced } : {}),
			};
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 设置所有四边（通常由自动裁剪调用） */
	setAll: (values: { top: number; bottom: number; left: number; right: number }): void => {
		update((s) => {
			const newSettings = {
				...s,
				top: clampTrim(values.top),
				bottom: clampTrim(values.bottom),
				left: clampTrim(values.left),
				right: clampTrim(values.right),
				enabled: true,
			};
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 设置自动裁剪参数 */
	setAutoTrimThreshold: (value: number): void => {
		update((s) => {
			const newSettings = { ...s, autoTrimThreshold: Math.max(0, Math.min(255, value)) };
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 设置自动裁剪目标颜色 */
	setAutoTrimTarget: (target: AutoTrimTarget): void => {
		update((s) => {
			const newSettings = { ...s, autoTrimTarget: target };
			saveSettings(newSettings);
			return newSettings;
		});
	},

	/** 执行自动裁剪并应用结果 */
	autoDetectAndApply: async (imageUrl: string): Promise<AutoTrimResult> => {
		const settings = get({ subscribe });
		const result = await detectAutoTrim(
			imageUrl,
			settings.autoTrimThreshold,
			settings.autoTrimTarget
		);
		// 只有检测到实际边框时才应用
		if (result.top > 0 || result.bottom > 0 || result.left > 0 || result.right > 0) {
			imageTrimStore.setAll(result);
		}
		return result;
	},

	/** 预设：去黑边 */
	presetBlackBorder: async (imageUrl: string): Promise<void> => {
		const result = await detectAutoTrim(imageUrl, 40, 'black');
		if (result.top > 0 || result.bottom > 0 || result.left > 0 || result.right > 0) {
			imageTrimStore.setAll(result);
		}
	},

	/** 预设：去白边 */
	presetWhiteBorder: async (imageUrl: string): Promise<void> => {
		const result = await detectAutoTrim(imageUrl, 40, 'white');
		if (result.top > 0 || result.bottom > 0 || result.left > 0 || result.right > 0) {
			imageTrimStore.setAll(result);
		}
	},

	/** 重置所有裁剪 */
	reset: (): void => {
		const newSettings = { ...defaultImageTrimSettings };
		set(newSettings);
		saveSettings(newSettings);
	},
};

export type { ImageTrimSettings as TrimSettings };
