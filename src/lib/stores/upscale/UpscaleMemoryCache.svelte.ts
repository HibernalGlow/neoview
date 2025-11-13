/**
 * UpscaleMemoryCache Store
 * 内存中超分缓存和实时进度管理
 */

import { writable, derived } from 'svelte/store';

// 超分任务状态
export type UpscaleTaskStatus = 'idle' | 'queued' | 'preupscaling' | 'upscaling' | 'completed' | 'error';

export interface UpscaleTask {
    id: string;
    imageHash: string;
    imagePath: string;
    model: string;
    scale: number;
    status: UpscaleTaskStatus;
    progress: number; // 0-100
    progressColor: 'yellow' | 'green' | 'red'; // yellow=预超分, green=超分中, red=错误
    startTime: number;
    endTime?: number;
    duration?: number; // 毫秒
    upscaledData?: Uint8Array; // 内存中的超分图片二进制数据
    upscaledBlob?: Blob;
    error?: string;
    isPreupscale: boolean; // 是否是预超分任务
}

export interface UpscaleMemoryCacheState {
    tasks: Map<string, UpscaleTask>;
    currentTaskId?: string;
    queue: string[]; // 任务ID队列
    totalCached: number; // 缓存总数
    totalCachedSize: number; // 缓存总大小（字节）
}

// 初始状态
const initialState: UpscaleMemoryCacheState = {
    tasks: new Map(),
    queue: [],
    totalCached: 0,
    totalCachedSize: 0
};

// 主 store
export const upscaleMemoryCache = writable<UpscaleMemoryCacheState>(initialState);

// 当前任务
export const currentUpscaleTask = derived(
    upscaleMemoryCache,
    $cache => $cache.currentTaskId ? $cache.tasks.get($cache.currentTaskId) : undefined
);

// 任务队列
export const upscaleTaskQueue = derived(
    upscaleMemoryCache,
    $cache => $cache.queue.map(id => $cache.tasks.get(id)).filter(Boolean) as UpscaleTask[]
);

// 缓存统计
export const upscaleCacheStats = derived(
    upscaleMemoryCache,
    $cache => ({
        totalTasks: $cache.tasks.size,
        totalCached: $cache.totalCached,
        totalCachedSize: $cache.totalCachedSize,
        queueLength: $cache.queue.length
    })
);

/**
 * 创建新的超分任务
 */
export function createUpscaleTask(
    imageHash: string,
    imagePath: string,
    model: string,
    scale: number,
    isPreupscale: boolean = false
): UpscaleTask {
    return {
        id: `${imageHash}_${model}_${scale}_${Date.now()}`,
        imageHash,
        imagePath,
        model,
        scale,
        status: 'queued',
        progress: 0,
        progressColor: isPreupscale ? 'yellow' : 'green',
        startTime: Date.now(),
        isPreupscale
    };
}

/**
 * 添加任务到队列
 */
export function addUpscaleTask(task: UpscaleTask) {
    upscaleMemoryCache.update(cache => {
        cache.tasks.set(task.id, task);
        cache.queue.push(task.id);
        return cache;
    });
}

/**
 * 更新任务进度
 */
export function updateTaskProgress(taskId: string, progress: number, status?: UpscaleTaskStatus) {
    upscaleMemoryCache.update(cache => {
        const task = cache.tasks.get(taskId);
        if (task) {
            task.progress = Math.min(100, Math.max(0, progress));
            if (status) {
                task.status = status;
                // 更新进度条颜色
                if (status === 'preupscaling') {
                    task.progressColor = 'yellow';
                } else if (status === 'upscaling') {
                    task.progressColor = 'green';
                } else if (status === 'error') {
                    task.progressColor = 'red';
                }
            }
        }
        return cache;
    });
}

/**
 * 完成任务（设置超分数据）
 */
export function completeUpscaleTask(
    taskId: string,
    upscaledData: Uint8Array,
    upscaledBlob?: Blob
) {
    upscaleMemoryCache.update(cache => {
        const task = cache.tasks.get(taskId);
        if (task) {
            task.status = 'completed';
            task.progress = 100;
            task.progressColor = 'green';
            task.upscaledData = upscaledData;
            task.upscaledBlob = upscaledBlob;
            task.endTime = Date.now();
            task.duration = task.endTime - task.startTime;
            
            // 更新缓存统计
            cache.totalCached++;
            cache.totalCachedSize += upscaledData.length;
        }
        return cache;
    });
}

/**
 * 设置任务错误
 */
export function setTaskError(taskId: string, error: string) {
    upscaleMemoryCache.update(cache => {
        const task = cache.tasks.get(taskId);
        if (task) {
            task.status = 'error';
            task.progressColor = 'red';
            task.error = error;
            task.endTime = Date.now();
            task.duration = task.endTime - task.startTime;
        }
        return cache;
    });
}

/**
 * 设置当前任务
 */
export function setCurrentTask(taskId: string | undefined) {
    upscaleMemoryCache.update(cache => {
        cache.currentTaskId = taskId;
        return cache;
    });
}

/**
 * 从队列移除任务
 */
export function removeTaskFromQueue(taskId: string) {
    upscaleMemoryCache.update(cache => {
        const index = cache.queue.indexOf(taskId);
        if (index > -1) {
            cache.queue.splice(index, 1);
        }
        return cache;
    });
}

/**
 * 获取任务的超分数据（内存中）
 */
export function getUpscaledData(taskId: string): Uint8Array | undefined {
    let result: Uint8Array | undefined;
    upscaleMemoryCache.subscribe(cache => {
        const task = cache.tasks.get(taskId);
        if (task?.upscaledData) {
            result = task.upscaledData;
        }
    })();
    return result;
}

/**
 * 获取任务的超分 Blob（内存中）
 */
export function getUpscaledBlob(taskId: string): Blob | undefined {
    let result: Blob | undefined;
    upscaleMemoryCache.subscribe(cache => {
        const task = cache.tasks.get(taskId);
        if (task?.upscaledBlob) {
            result = task.upscaledBlob;
        }
    })();
    return result;
}

/**
 * 清理缓存（LRU）
 */
export function cleanupMemoryCache(maxSize: number = 500 * 1024 * 1024) { // 默认 500MB
    upscaleMemoryCache.update(cache => {
        if (cache.totalCachedSize > maxSize) {
            // 按完成时间排序，删除最旧的
            const sortedTasks = Array.from(cache.tasks.values())
                .filter(t => t.status === 'completed')
                .sort((a, b) => (a.endTime || 0) - (b.endTime || 0));
            
            let freed = 0;
            for (const task of sortedTasks) {
                if (cache.totalCachedSize <= maxSize) break;
                
                if (task.upscaledData) {
                    freed += task.upscaledData.length;
                    cache.totalCachedSize -= task.upscaledData.length;
                    task.upscaledData = undefined;
                    task.upscaledBlob = undefined;
                    cache.totalCached--;
                }
            }
            
            console.log(`[UpscaleMemoryCache] 清理缓存，释放 ${freed} 字节`);
        }
        return cache;
    });
}

/**
 * 清空所有缓存
 */
export function clearAllCache() {
    upscaleMemoryCache.set(initialState);
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats() {
    let stats: any = {};
    upscaleMemoryCache.subscribe(cache => {
        stats = {
            totalTasks: cache.tasks.size,
            totalCached: cache.totalCached,
            totalCachedSize: cache.totalCachedSize,
            queueLength: cache.queue.length,
            currentTask: cache.currentTaskId ? cache.tasks.get(cache.currentTaskId) : undefined
        };
    })();
    return stats;
}
