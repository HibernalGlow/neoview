/**
 * UpscaleManager Store
 * 超分管理器状态存储
 */

import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';

// 超分设置状态
const DEFAULT_UPSCALE_SETTINGS = {
    active_algorithm: 'waifu2x',
    realcugan: {
        model: 'models-se',
        scale: '2',
        noise_level: '-1',
        tile_size: '0',
        syncgap_mode: '3',
        gpu_id: 'auto',
        threads: '1:2:2',
        tta: false,
        format: 'png'
    },
    realesrgan: {
        model: 'realesr-animevideov3',
        scale: '4',
        tile_size: '0',
        gpu_id: 'auto',
        threads: '1:2:2',
        tta: false,
        format: 'png'
    },
    waifu2x: {
        model: 'models-cunet',
        noise_level: '0',
        scale: '2',
        tile_size: '400',
        gpu_id: '0',
        threads: '1:2:2'
    },
    // 缓存生命周期（小时）: 生成超分文件后多少小时视为有效，默认 8 小时
    cache_ttl_hours: 8,
    preload_pages: 3,
    // 后台预加载并发数
    background_concurrency: 1,
    conditional_upscale: {
        enabled: false,
        min_width: -1,
        min_height: -1,
        max_width: -1,
        max_height: -1,
        aspect_ratio_condition: null
    },
    global_upscale_enabled: true,
    comparison: {
        enabled: false,
        mode: 'slider'
    }
};

export const upscaleSettings = writable(DEFAULT_UPSCALE_SETTINGS);

// 并发计数器
let foregroundRunning = 0;
let backgroundRunning = 0;

// 超分状态
export const upscaleState = writable({
    isUpscaling: false,
    progress: 0,
    status: '',
    showProgress: false,
    upscaledImageData: '',
    upscaledImageBlob: null,
    startTime: 0
});

// 当前选中的算法设置
export const currentAlgorithmSettings = derived(
    upscaleSettings,
    $settings => {
        const algorithm = $settings.active_algorithm;
        return $settings[algorithm];
    }
);

// 预加载页数
export const preloadPages = derived(
    upscaleSettings,
    $settings => $settings.preload_pages
);

// 条件超分设置
export const conditionalUpscaleSettings = derived(
    upscaleSettings,
    $settings => $settings.conditional_upscale
);

// 对比模式设置
export const comparisonSettings = derived(
    upscaleSettings,
    $settings => $settings.comparison
);

// 进行中超分任务注册表：hash -> Promise
const ongoingUpscaleTasks: Map<string, Promise<any>> = new Map();

/**
 * 初始化超分设置管理器
 */
export async function initUpscaleSettingsManager() {
    try {
        await invoke('init_upscale_settings_manager');
        await loadUpscaleSettings();
        console.log('超分设置管理器初始化完成');
    } catch (error) {
        console.error('初始化超分设置管理器失败:', error);
    }
}

/**
 * 加载超分设置
 */
export async function loadUpscaleSettings() {
    try {
        const raw = await invoke('get_upscale_settings');
        // 验证并合并默认设置，容错处理后端返回不完整或解析错误
        let settings: any = {};
        if (raw && typeof raw === 'object') {
            settings = { ...DEFAULT_UPSCALE_SETTINGS, ...(raw as any) };
            // ensure conditional_upscale exists
            settings.conditional_upscale = { ...DEFAULT_UPSCALE_SETTINGS.conditional_upscale, ...(raw?.conditional_upscale || {}) };
        } else {
            console.warn('loadUpscaleSettings: 后端返回无效，使用默认设置');
            settings = DEFAULT_UPSCALE_SETTINGS;
        }
        // 基本字段校验
        if (!settings.active_algorithm) {
            console.warn('超分设置缺少 active_algorithm 字段，使用默认设置');
            settings = DEFAULT_UPSCALE_SETTINGS;
        }
        upscaleSettings.set(settings);
        console.log('超分设置已加载（合并/验证）:', settings);
    } catch (error) {
        console.error('加载超分设置失败，使用默认设置:', error);
        upscaleSettings.set(DEFAULT_UPSCALE_SETTINGS);
    }
}

/**
 * 保存超分设置
 */
export async function saveUpscaleSettings() {
    try {
        let settings;
        upscaleSettings.subscribe(s => settings = s)();
        await invoke('save_upscale_settings', { settings });
        console.log('超分设置已保存');
    } catch (error) {
        console.error('保存超分设置失败:', error);
    }
}

/**
 * 重置超分设置
 */
export async function resetUpscaleSettings() {
    try {
        const settings = await invoke('reset_upscale_settings');
        upscaleSettings.set(settings);
        console.log('超分设置已重置');
    } catch (error) {
        console.error('重置超分设置失败:', error);
    }
}

/**
 * 检查图片是否满足超分条件
 */
export async function checkUpscaleConditions(width: number, height: number) {
    try {
        // 本地评估条件超分设置，-1 表示无上限/无下限（即不作此项筛选）
        let settings: any;
        upscaleSettings.subscribe(s => settings = s)();
        const cfg = settings?.conditional_upscale;
        if (!cfg || !cfg.enabled) return true;

        const minW = Number(cfg.min_width ?? -1);
        const minH = Number(cfg.min_height ?? -1);
        const maxW = Number(cfg.max_width ?? -1);
        const maxH = Number(cfg.max_height ?? -1);

        if (minW !== -1 && width < minW) return false;
        if (minH !== -1 && height < minH) return false;
        if (maxW !== -1 && maxW > 0 && width > maxW) return false;
        if (maxH !== -1 && maxH > 0 && height > maxH) return false;

        // 处理宽高比条件：支持对象 {min, max} 或字符串 "w:h" 或数字
        const ar = cfg?.aspect_ratio_condition;
        if (ar) {
            const ratio = width / height;
            if (typeof ar === 'object') {
                const minAr = Number(ar.min ?? -1);
                const maxAr = Number(ar.max ?? -1);
                if (minAr !== -1 && ratio < minAr) return false;
                if (maxAr !== -1 && ratio > maxAr) return false;
            } else if (typeof ar === 'string') {
                // 支持 x:y 格式
                const m = ar.match(/^(\d+(?:\.\d+)?)[ :xX](\d+(?:\.\d+)?)/);
                if (m) {
                    const target = Number(m[1]) / Number(m[2]);
                    // 允许小幅偏差
                    const tol = 0.02;
                    if (Math.abs(ratio - target) > tol) return false;
                }
            } else if (typeof ar === 'number') {
                const target = Number(ar);
                const tol = 0.02;
                if (Math.abs((width / height) - target) > tol) return false;
            }
        }

        return true;
    } catch (error) {
        console.error('检查超分条件失败:', error);
        return true;
    }
}

/**
 * 获取预加载页数
 */
export async function getPreloadPages() {
    try {
        return await invoke('get_preload_pages');
    } catch (error) {
        console.error('获取预加载页数失败:', error);
        return 3; // 默认值
    }
}

/**
 * 设置预加载页数
 */
export async function setPreloadPages(pages) {
    try {
        await invoke('set_preload_pages', { pages });
        // 更新本地状态
        upscaleSettings.update(settings => ({
            ...settings,
            preload_pages: pages
        }));
    } catch (error) {
        console.error('设置预加载页数失败:', error);
    }
}

/**
 * 获取条件超分设置
 */
export async function getConditionalUpscaleSettings() {
    try {
        return await invoke('get_conditional_upscale_settings');
    } catch (error) {
        console.error('获取条件超分设置失败:', error);
        return null;
    }
}

/**
 * 更新条件超分设置
 */
export async function updateConditionalUpscaleSettings(conditionalSettings) {
    try {
        await invoke('update_conditional_upscale_settings', { 
            conditionalSettings 
        });
        // 更新本地状态
        upscaleSettings.update(settings => ({
            ...settings,
            conditional_upscale: conditionalSettings
        }));
    } catch (error) {
        console.error('更新条件超分设置失败:', error);
    }
}

/**
 * 获取全局超分开关状态
 */
export async function getGlobalUpscaleEnabled() {
    try {
        // 先尝试从后端获取
        return await invoke('get_global_upscale_enabled');
    } catch (error) {
        // 如果后端未初始化，从本地 store 获取
        console.warn('后端设置管理器未初始化，使用本地设置:', error);
        let settings;
        upscaleSettings.subscribe(s => settings = s)();
        return settings?.global_upscale_enabled ?? true; // 默认开启
    }
}

/**
 * 设置全局超分开关
 */
export async function setGlobalUpscaleEnabled(enabled) {
    try {
        await invoke('set_global_upscale_enabled', { enabled });
        // 更新本地状态
        upscaleSettings.update(settings => ({
            ...settings,
            global_upscale_enabled: enabled
        }));
    } catch (error) {
        console.error('设置全局超分开关失败:', error);
    }
}

/**
 * 获取对比模式设置
 */
export async function getComparisonSettings() {
    try {
        return await invoke('get_comparison_settings');
    } catch (error) {
        console.error('获取对比模式设置失败:', error);
        return { enabled: false, mode: 'slider' };
    }
}

/**
 * 更新对比模式设置
 */
export async function updateComparisonSettings(comparisonSettings) {
    try {
        await invoke('update_comparison_settings', { 
            comparisonSettings 
        });
        // 更新本地状态
        upscaleSettings.update(settings => ({
            ...settings,
            comparison: comparisonSettings
        }));
    } catch (error) {
        console.error('更新对比模式设置失败:', error);
    }
}

/**
 * 切换对比模式开关
 */
export async function toggleComparisonMode() {
    try {
        const enabled = await invoke('toggle_comparison_mode');
        // 更新本地状态
        upscaleSettings.update(settings => ({
            ...settings,
            comparison: {
                ...settings.comparison,
                enabled
            }
        }));
        return enabled;
    } catch (error) {
        console.error('切换对比模式失败:', error);
        return false;
    }
}

/**
 * 设置对比模式类型
 */
export async function setComparisonMode(mode) {
    try {
        await invoke('set_comparison_mode', { mode });
        // 更新本地状态
        upscaleSettings.update(settings => ({
            ...settings,
            comparison: {
                ...settings.comparison,
                mode
            }
        }));
    } catch (error) {
        console.error('设置对比模式类型失败:', error);
    }
}

/**
 * 更新当前算法设置
 */
export function updateCurrentAlgorithmSettings(updates) {
    upscaleSettings.update(settings => {
        const algorithm = settings.active_algorithm;
        return {
            ...settings,
            [algorithm]: {
                ...settings[algorithm],
                ...updates
            }
        };
    });
}

/**
 * 切换算法
 */
export function switchAlgorithm(algorithm) {
    upscaleSettings.update(settings => ({
        ...settings,
        active_algorithm: algorithm
    }));
}

/**
 * 执行超分处理
 */
export async function performUpscale(imageData: string, imageHash?: string, options?: { background?: boolean }) {
    // 先读取当前设置快照
    let currentSettings: any;
    upscaleSettings.subscribe(s => currentSettings = s)();

    const settings: any = currentSettings;
    const algorithm = settings.active_algorithm;
    const algorithmSettings = settings[algorithm];

    const isBackground = !!options?.background;

    // 使用传入的hash或计算新的hash以便去重
    const finalHash: string = (imageHash as string) || (await invoke('calculate_data_hash', { dataUrl: imageData }) as string);

    // 如果已有相同 hash 的任务在进行中，复用该 Promise
    if (ongoingUpscaleTasks.has(finalHash)) {
        console.log('复用进行中的超分任务，hash:', finalHash);
        return ongoingUpscaleTasks.get(finalHash) as Promise<any>;
    }

    // 如果全局开关关闭，直接返回 resolved promise
    if (!settings.global_upscale_enabled) {
        console.log('全局超分开关已关闭，跳过超分处理');
        return Promise.resolve(null);
    }

    // 并发限制检查：前台 1 个，后台由 settings.background_concurrency 决定
    const bgLimit = Number(settings.background_concurrency) || 1;
    if (isBackground) {
        if (backgroundRunning >= bgLimit) {
            console.log('后台并发已满，要求前端队列重试，hash:', finalHash);
            return { requeue: true, reason: 'background_limit', finalHash };
        }
    } else {
        // 前台最多 1 个任务运行
        if (foregroundRunning >= 1) {
            console.log('前台并发已满，要求前端队列重试，hash:', finalHash);
            return { requeue: true, reason: 'foreground_limit', finalHash };
        }
    }

    // 在通过并发检查后，登记并创建任务 Promise
    // 在登记前立即增加计数器，保证并发计数的准确性
    if (isBackground) backgroundRunning++;
    else foregroundRunning++;

    const taskPromise = (async () => {
        // 在任务开始前更新状态（仅前台显示进度）
        upscaleState.update(state => ({
            ...state,
            isUpscaling: true,
            progress: 0,
            status: '准备超分...',
            showProgress: isBackground ? false : true,
            upscaledImageData: '',
            upscaledImageBlob: null,
            startTime: Date.now()
        }));

        try {
            // 构建参数
            const params: any = {
                imageData,
                algorithm,
                model: algorithmSettings.model,
                gpuId: algorithmSettings.gpu_id,
                tileSize: algorithmSettings.tile_size,
                tta: algorithmSettings.tta || false,
                thumbnailPath: 'D:\\temp\\neoview_thumbnails_test'
            };

            // 添加算法特定参数
            if (algorithm === 'realcugan') {
                params.noiseLevel = algorithmSettings.noise_level;
                params.numThreads = algorithmSettings.threads;
            } else if (algorithm === 'realesrgan') {
                params.numThreads = algorithmSettings.threads;
            } else if (algorithm === 'waifu2x') {
                params.noiseLevel = algorithmSettings.noise_level;
                params.numThreads = algorithmSettings.threads;
            }

            const savePath = await invoke('get_upscale_save_path_from_data', {
                imageHash: finalHash,
                ...params,
                thumbnailPath: params.thumbnailPath
            });

            // 更新状态
            upscaleState.update(state => ({
                ...state,
                status: '执行超分处理...'
            }));

            // 执行超分
            const result: any = await invoke('upscale_image_from_data', {
                ...params,
                savePath
            });

            // 处理结果
            const bytes = result as number[];
            const upscaledImageBlob = new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
            const upscaledImageData = URL.createObjectURL(upscaledImageBlob);

            // 计算耗时
            const elapsedTime = Date.now() - (upscaleState && (upscaleState as any).startTime || Date.now());
            const elapsedSeconds = (elapsedTime / 1000).toFixed(2);

            // 更新状态
            upscaleState.update(state => ({
                ...state,
                status: '超分完成',
                upscaledImageData,
                upscaledImageBlob: upscaledImageBlob as any,
                isUpscaling: false
            }));

            // 前台任务通知主查看器替换图片；后台任务仅写缓存并触发保存事件（由查看器选择监听）
            if (!isBackground) {
                window.dispatchEvent(new CustomEvent('upscale-complete', {
                    detail: {
                        imageData: upscaledImageData,
                        imageBlob: upscaledImageBlob,
                        originalImageHash: finalHash
                    }
                }));
            } else {
                window.dispatchEvent(new CustomEvent('upscale-saved', {
                    detail: {
                        finalHash,
                        savePath
                    }
                }));
            }

            console.log(`超分完成，hash: ${finalHash}, 耗时: ${elapsedSeconds}秒`);
            return { upscaledImageData, upscaledImageBlob, finalHash };
        } catch (error) {
            console.error('超分失败:', error);
            upscaleState.update(state => ({
                ...state,
                status: `超分失败: ${error}`,
                isUpscaling: false
            }));
            throw error;
        } finally {
            // 3秒后隐藏进度条
            setTimeout(() => {
                upscaleState.update(state => ({
                    ...state,
                    showProgress: false
                }));
            }, 3000);
            // 从注册表移除并更新并发计数器
            ongoingUpscaleTasks.delete(finalHash);
            if (isBackground) backgroundRunning = Math.max(0, backgroundRunning - 1);
            else foregroundRunning = Math.max(0, foregroundRunning - 1);
        }
    })();
    // 登记正在进行的任务，供重复请求复用
    ongoingUpscaleTasks.set(finalHash, taskPromise);
    return taskPromise;
}

/**
 * 刷新给定图片数据的缓存状态并更新 `upscaleState`，用于面板实时显示。
 * 如果找到缓存会把 upscaledImageData/upscaledImageBlob 更新到状态中。
 */
export async function refreshCacheStatusForData(imageData: string) {
    try {
        if (!imageData) {
            upscaleState.update(s => ({ ...s, status: '没有图片数据', progress: 0 }));
            return false;
        }

        // 使用轻量元数据检查以尽量避免立即读取文件字节
        const meta = await checkCacheMetaForData(imageData);
        if (meta && meta.path) {
            try {
                // 仅当需要预览二进制时才读取文件（Viewer 可能需要）
                const bytes = await invoke<number[]>('read_binary_file', { filePath: meta.path });
                const arr = new Uint8Array(bytes);
                const blob = new Blob([arr], { type: 'image/webp' });
                const url = URL.createObjectURL(blob);

                upscaleState.update(s => ({
                    ...s,
                    status: `已找到缓存 (${meta.algorithm || meta.detected_algorithm || 'unknown'})`,
                    progress: 100,
                    upscaledImageData: url,
                    upscaledImageBlob: blob as any,
                    isUpscaling: false,
                    showProgress: false
                }));

                try { bookStore.setUpscaledImage(url); bookStore.setUpscaledImageBlob(blob); } catch (e) {}
                return true;
            } catch (e) {
                console.error('读取缓存文件失败:', e);
                // fallthrough 清理状态后返回 false
            }
        }

        // 未找到缓存
        upscaleState.update(s => ({ ...s, status: '未找到缓存', progress: 0, upscaledImageData: '', upscaledImageBlob: null }));
        // 清除 bookStore 上的 upscaled 图像
        try { bookStore.setUpscaledImage(null); bookStore.setUpscaledImageBlob(null); } catch(e) {}
        return false;
    } catch (error) {
        console.error('刷新缓存状态失败:', error);
        upscaleState.update(s => ({ ...s, status: `检查缓存失败: ${error}`, progress: 0 }));
        return false;
    }
}

/**
 * 轻量：仅检查缓存元数据（不读取文件字节）
 * 返回 meta（后端原样返回）或 null
 */
export async function checkCacheMetaForData(imageData: string) {
    try {
        if (!imageData) return null;
        const imageHash = await invoke('calculate_data_hash', { dataUrl: imageData }) as string;

        let settings: any; upscaleSettings.subscribe(s => settings = s)();
        const currentAlgorithm = settings?.active_algorithm || 'realcugan';
        const algorithms = [currentAlgorithm, 'realcugan', 'realesrgan', 'waifu2x'];

        let ttlHours = 8;
        try { let s: any; upscaleSettings.subscribe(x => s = x)(); ttlHours = (s && s.cache_ttl_hours) ?? ttlHours; } catch(e) {}
        const ttlSeconds = ttlHours * 3600;

        for (const algorithm of algorithms) {
            try {
                const meta: any = await invoke('check_upscale_cache_for_algorithm', {
                    imageHash,
                    algorithm,
                    thumbnailPath: 'D:\\temp\\neoview_thumbnails_test',
                    max_age_seconds: ttlSeconds
                });
                if (meta && meta.path) {
                    // 返回元数据，供面板显示
                    return { ...meta, detected_algorithm: algorithm };
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    } catch (error) {
        console.error('检查缓存元数据失败:', error);
        return null;
    }
}

/**
 * 获取图片尺寸
 */
async function getImageDimensions(imageData: string) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
            resolve(null);
        };
        img.src = imageData;
    });
}

