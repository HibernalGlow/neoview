/**
 * UpscaleManager Store
 * 超分管理器状态存储
 */

import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';

// 超分设置状态
export const upscaleSettings = writable({
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
    conditional_upscale: {
        enabled: false,
        min_width: 0,
        min_height: 0,
        max_width: 0,
        max_height: 0,
        aspect_ratio_condition: null
    },
    global_upscale_enabled: true,
    comparison: {
        enabled: false,
        mode: 'slider'
    }
});

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
        const settings = await invoke('get_upscale_settings');
        upscaleSettings.set(settings);
        console.log('超分设置已加载:', settings);
    } catch (error) {
        console.error('加载超分设置失败:', error);
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
export async function checkUpscaleConditions(width, height) {
    try {
        return await invoke('check_upscale_conditions', { width, height });
    } catch (error) {
        console.error('检查超分条件失败:', error);
        return true; // 出错时默认允许超分
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
export async function performUpscale(imageData: string, imageHash?: string) {
    let currentState;
    let currentSettings;
    
    // 获取超分状态
    const unsubscribeState = upscaleState.subscribe(state => {
        currentState = state;
    });
    unsubscribeState();
    
    // 获取设置
    const unsubscribeSettings = upscaleSettings.subscribe(settings => {
        currentSettings = settings;
    });
    unsubscribeSettings();
    
    // 检查全局开关
    if (!currentSettings.global_upscale_enabled) {
        console.log('全局超分开关已关闭，跳过超分处理');
        return;
    }
    
    if (currentState.isUpscaling) {
        console.log('超分正在进行中，忽略重复请求');
        return;
    }

    const settings = currentSettings;
    const algorithm = settings.active_algorithm;
    const algorithmSettings = settings[algorithm];

    // 检查图片是否满足超分条件
    if (settings.conditional_upscale.enabled) {
        // 获取图片尺寸
        const dimensions = await getImageDimensions(imageData);
        if (dimensions) {
            const shouldUpscale = await checkUpscaleConditions(
                dimensions.width, 
                dimensions.height
            );
            if (!shouldUpscale) {
                console.log('图片不满足超分条件，跳过超分处理');
                return;
            }
        }
    }

    // 更新状态
    upscaleState.update(state => ({
        ...state,
        isUpscaling: true,
        progress: 0,
        status: '准备超分...',
        showProgress: true,
        upscaledImageData: '',
        upscaledImageBlob: null,
        startTime: Date.now()
    }));

    try {
        // 构建参数
        const params = {
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

        // 使用传入的hash或计算新的hash
        const finalHash = imageHash || await invoke('calculate_data_hash', { dataUrl: imageData });
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
        const result = await invoke('upscale_image_from_data', {
            ...params,
            savePath
        });

        // 处理结果
        const upscaledImageBlob = new Blob([new Uint8Array(result)], { type: 'image/webp' });
        const upscaledImageData = URL.createObjectURL(upscaledImageBlob);

        // 计算耗时
        const elapsedTime = Date.now() - currentState.startTime;
        const elapsedSeconds = (elapsedTime / 1000).toFixed(2);

        // 更新状态
        upscaleState.update(state => ({
            ...state,
            status: '超分完成',
            upscaledImageData,
            upscaledImageBlob,
            isUpscaling: false
        }));

        // 通知主查看器替换图片
        window.dispatchEvent(new CustomEvent('upscale-complete', {
            detail: { 
                imageData: upscaledImageData, 
                imageBlob: upscaledImageBlob,
                originalImageHash: finalHash
            }
        }));

        console.log(`超分完成，耗时: ${elapsedSeconds}秒`);

    } catch (error) {
        console.error('超分失败:', error);
        upscaleState.update(state => ({
            ...state,
            status: `超分失败: ${error}`,
            isUpscaling: false
        }));
    } finally {
        // 3秒后隐藏进度条
        setTimeout(() => {
            upscaleState.update(state => ({
                ...state,
                showProgress: false
            }));
        }, 3000);
    }
}

/**
 * 获取图片尺寸
 */
async function getImageDimensions(imageData) {
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

