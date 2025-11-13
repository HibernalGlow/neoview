/**
 * UpscaleWorkflow Store
 * 完整的超分工作流管理：内存缓存、实时进度、预超分
 */

import { invoke } from '@tauri-apps/api/core';
import { 
    upscaleMemoryCache,
    createUpscaleTask,
    addUpscaleTask,
    updateTaskProgress,
    completeUpscaleTask,
    setTaskError,
    setCurrentTask,
    removeTaskFromQueue,
    cleanupMemoryCache,
    type UpscaleTask
} from './UpscaleMemoryCache.svelte';
import { writable } from 'svelte/store';

// 工作流状态
export const workflowState = writable({
    isProcessing: false,
    currentTaskId: '',
    preupscaleEnabled: true,
    maxMemoryMB: 500
});

// 预超分队列
const preupscaleQueue: string[] = [];
let isPreupscaling = false;

/**
 * 执行超分（内存中，返回二进制数据）
 */
export async function performUpscaleInMemory(
    imageHash: string,
    imagePath: string,
    imageData: Uint8Array,
    model: string,
    scale: number,
    gpuId: number = 0,
    tileSize: number = 400,
    tta: boolean = false,
    onProgress?: (progress: number) => void
): Promise<{ data: Uint8Array; blob: Blob; taskId: string }> {
    // 创建任务
    const task = createUpscaleTask(imageHash, imagePath, model, scale, false);
    addUpscaleTask(task);
    setCurrentTask(task.id);
    
    try {
        // 更新进度：开始
        updateTaskProgress(task.id, 0, 'upscaling');
        onProgress?.(0);
        
        // 调用 PyO3 直接超分（返回二进制数据）
        const startTime = Date.now();
        
        // 创建临时文件用于输入
        const tempInputPath = `/tmp/upscale_input_${imageHash}.tmp`;
        const tempOutputPath = `/tmp/upscale_output_${imageHash}.webp`;
        
        // 保存输入数据到临时文件
        await invoke('save_binary_file', {
            filePath: tempInputPath,
            data: Array.from(imageData)
        });
        
        // 执行超分
        const upscaledDataArray: number[] = await invoke('upscale_image_sr_vulkan', {
            imagePath: tempInputPath,
            savePath: tempOutputPath,
            model,
            scale,
            gpuId,
            tileSize,
            tta
        });
        
        // 转换为 Uint8Array
        const upscaledData = new Uint8Array(upscaledDataArray);
        const upscaledBlob = new Blob([upscaledData], { type: 'image/webp' });
        
        // 更新进度：完成
        const duration = Date.now() - startTime;
        updateTaskProgress(task.id, 100, 'completed');
        completeUpscaleTask(task.id, upscaledData, upscaledBlob);
        onProgress?.(100);
        
        console.log(`[UpscaleWorkflow] 超分完成: ${imageHash}, 耗时: ${duration}ms, 大小: ${upscaledData.length} bytes`);
        
        // 清理临时文件
        try {
            await invoke('delete_path', { path: tempInputPath });
            await invoke('delete_path', { path: tempOutputPath });
        } catch (e) {
            console.warn('清理临时文件失败:', e);
        }
        
        // 检查内存，必要时清理
        cleanupMemoryCache();
        
        return { data: upscaledData, blob: upscaledBlob, taskId: task.id };
        
    } catch (error) {
        console.error('[UpscaleWorkflow] 超分失败:', error);
        setTaskError(task.id, String(error));
        throw error;
    } finally {
        setCurrentTask(undefined);
        removeTaskFromQueue(task.id);
    }
}

/**
 * 预超分（后台，低优先级）
 */
export async function preupscaleInMemory(
    imageHash: string,
    imagePath: string,
    _imageData: Uint8Array, // 预超分时从文件读取，不使用传入的数据
    model: string,
    scale: number,
    _gpuId: number = 0, // 预超分使用默认 GPU
    _tileSize: number = 400 // 预超分使用默认 tile size
): Promise<string> {
    // 创建预超分任务
    const task = createUpscaleTask(imageHash, imagePath, model, scale, true);
    addUpscaleTask(task);
    
    preupscaleQueue.push(task.id);
    
    // 如果没有正在预超分，启动预超分流程
    if (!isPreupscaling) {
        processPreupscaleQueue();
    }
    
    return task.id;
}

/**
 * 处理预超分队列
 */
async function processPreupscaleQueue() {
    if (isPreupscaling || preupscaleQueue.length === 0) return;
    
    isPreupscaling = true;
    
    while (preupscaleQueue.length > 0) {
        const taskId = preupscaleQueue.shift()!;
        
        try {
            let task: UpscaleTask | undefined;
            upscaleMemoryCache.subscribe(cache => {
                task = cache.tasks.get(taskId);
            })();
            
            if (!task) continue;
            
            // 更新状态：预超分中
            updateTaskProgress(taskId, 0, 'preupscaling');
            
            // 读取原始图片数据
            const imageData = await invoke('read_binary_file', {
                filePath: task.imagePath
            }) as number[];
            
            // 执行超分
            await performUpscaleInMemory(
                task.imageHash,
                task.imagePath,
                new Uint8Array(imageData),
                task.model,
                task.scale,
                0,
                400,
                false,
                (progress) => {
                    updateTaskProgress(taskId, progress, 'preupscaling');
                }
            );
            
            console.log(`[UpscaleWorkflow] 预超分完成: ${taskId}`);
            
        } catch (error) {
            console.error(`[UpscaleWorkflow] 预超分失败: ${taskId}`, error);
            setTaskError(taskId, `预超分失败: ${error}`);
        }
        
        // 避免过度占用资源
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    isPreupscaling = false;
}

/**
 * 获取超分图片（从内存缓存）
 */
export function getUpscaledImageFromMemory(taskId: string): { data: Uint8Array; blob: Blob } | null {
    let result: { data: Uint8Array; blob: Blob } | null = null;
    
    upscaleMemoryCache.subscribe(cache => {
        const task = cache.tasks.get(taskId);
        if (task?.upscaledData && task?.upscaledBlob) {
            result = {
                data: task.upscaledData,
                blob: task.upscaledBlob
            };
        }
    })();
    
    return result;
}

/**
 * 创建内存中的图片 URL（Blob URL）
 */
export function createBlobUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
}

/**
 * 释放 Blob URL
 */
export function releaseBlobUrl(url: string) {
    URL.revokeObjectURL(url);
}

/**
 * 获取任务进度百分比
 */
export function getTaskProgress(taskId: string): number {
    let progress = 0;
    
    upscaleMemoryCache.subscribe(cache => {
        const task = cache.tasks.get(taskId);
        if (task) {
            progress = task.progress;
        }
    })();
    
    return progress;
}

/**
 * 获取任务状态
 */
export function getTaskStatus(taskId: string): string {
    let status = '';
    
    upscaleMemoryCache.subscribe(cache => {
        const task = cache.tasks.get(taskId);
        if (task) {
            status = task.status;
        }
    })();
    
    return status;
}

/**
 * 获取任务进度条颜色
 */
export function getTaskProgressColor(taskId: string): 'yellow' | 'green' | 'red' {
    let color: 'yellow' | 'green' | 'red' = 'green';
    
    upscaleMemoryCache.subscribe(cache => {
        const task = cache.tasks.get(taskId);
        if (task) {
            color = task.progressColor;
        }
    })();
    
    return color;
}

/**
 * 启用/禁用预超分
 */
export function setPreupscaleEnabled(enabled: boolean) {
    workflowState.update(state => ({
        ...state,
        preupscaleEnabled: enabled
    }));
}

/**
 * 设置最大内存限制
 */
export function setMaxMemory(maxMB: number) {
    workflowState.update(state => ({
        ...state,
        maxMemoryMB: maxMB
    }));
    cleanupMemoryCache(maxMB * 1024 * 1024);
}
