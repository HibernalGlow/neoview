# 内存中超分工作流 - 完整集成指南

## 📋 概述

完整的内存中超分系统，包括：
- ✅ **二进制数据流** - 不保存到本地
- ✅ **内存缓存** - LRU 管理
- ✅ **实时进度** - 百分比 + 颜色状态
- ✅ **Viewer 集成** - 直接替换原图
- ✅ **右侧边栏同步** - 实时状态显示
- ✅ **底部进度条** - 绿色（超分中）/ 黄色（预超分）/ 红色（错误）
- ✅ **预超分功能** - 后台低优先级处理

## 🏗️ 架构

```
┌─────────────────────────────────────────┐
│         Frontend (Svelte)               │
├─────────────────────────────────────────┤
│  ImageViewer                            │
│  ├─ 显示原图                            │
│  ├─ 接收超分数据                        │
│  └─ 替换为超分图                        │
├─────────────────────────────────────────┤
│  RightSidebar (UpscalePanel)            │
│  ├─ 显示超分状态                        │
│  ├─ 实时进度百分比                      │
│  └─ 缓存信息                            │
├─────────────────────────────────────────┤
│  BottomProgressBar                      │
│  ├─ 颜色状态（黄/绿/红）                │
│  ├─ 进度百分比                          │
│  └─ 任务队列显示                        │
├─────────────────────────────────────────┤
│  UpscaleWorkflow (Store)                │
│  ├─ performUpscaleInMemory()            │
│  ├─ preupscaleInMemory()                │
│  └─ 内存缓存管理                        │
├─────────────────────────────────────────┤
│  UpscaleMemoryCache (Store)             │
│  ├─ 任务管理                            │
│  ├─ 进度跟踪                            │
│  └─ LRU 缓存                            │
├─────────────────────────────────────────┤
│  PyO3 Sr_vulkan Integration             │
│  └─ 返回二进制数据                      │
└─────────────────────────────────────────┘
```

## 📦 核心 Store

### 1. UpscaleMemoryCache.svelte.ts
管理内存中的超分任务和缓存

```typescript
// 创建任务
const task = createUpscaleTask(hash, path, model, scale, isPreupscale);
addUpscaleTask(task);

// 更新进度
updateTaskProgress(taskId, progress, status);

// 完成任务
completeUpscaleTask(taskId, upscaledData, upscaledBlob);

// 获取数据
const data = getUpscaledData(taskId);
const blob = getUpscaledBlob(taskId);
```

### 2. UpscaleWorkflow.svelte.ts
完整的超分工作流

```typescript
// 执行超分（内存中）
const { data, blob, taskId } = await performUpscaleInMemory(
    imageHash,
    imagePath,
    imageData,
    model,
    scale,
    gpuId,
    tileSize,
    tta,
    (progress) => console.log(progress)
);

// 预超分（后台）
const preupscaleTaskId = await preupscaleInMemory(
    imageHash,
    imagePath,
    imageData,
    model,
    scale
);

// 获取进度
const progress = getTaskProgress(taskId);
const status = getTaskStatus(taskId);
const color = getTaskProgressColor(taskId); // 'yellow' | 'green' | 'red'
```

## 🎨 UI 集成

### ImageViewer 集成
```svelte
<script>
    import { performUpscaleInMemory, getUpscaledImageFromMemory, createBlobUrl } from '$lib/stores/upscale/UpscaleWorkflow.svelte';
    
    let currentImageData = $state('');
    let upscaledImageUrl = $state('');
    
    async function handleUpscale() {
        const { blob, taskId } = await performUpscaleInMemory(
            imageHash,
            imagePath,
            imageData,
            'REALESRGAN_X4PLUS_UP4X',
            2.0
        );
        
        // 创建 Blob URL
        upscaledImageUrl = createBlobUrl(blob);
        
        // 更新显示
        currentImageData = upscaledImageUrl;
    }
</script>

<!-- 显示超分图 -->
<img src={upscaledImageUrl} alt="Upscaled" />
```

### RightSidebar (UpscalePanel) 集成
```svelte
<script>
    import { currentUpscaleTask, upscaleCacheStats } from '$lib/stores/upscale/UpscaleMemoryCache.svelte';
    import { getTaskProgress, getTaskProgressColor } from '$lib/stores/upscale/UpscaleWorkflow.svelte';
    
    let task = $state($currentUpscaleTask);
    let progress = $state(0);
    let progressColor = $state('green');
    let stats = $state($upscaleCacheStats);
    
    $effect(() => {
        if (task) {
            progress = getTaskProgress(task.id);
            progressColor = getTaskProgressColor(task.id);
        }
    });
</script>

<!-- 显示进度 -->
<div class="upscale-panel">
    <div class="progress-bar" style:background-color={progressColor}>
        <div style:width="{progress}%"></div>
    </div>
    <p>进度: {progress}%</p>
    <p>状态: {task?.status}</p>
    <p>缓存: {stats.totalCached} 个，{(stats.totalCachedSize / 1024 / 1024).toFixed(2)} MB</p>
</div>
```

### BottomProgressBar 集成
```svelte
<script>
    import { upscaleTaskQueue } from '$lib/stores/upscale/UpscaleMemoryCache.svelte';
    import { getTaskProgressColor } from '$lib/stores/upscale/UpscaleWorkflow.svelte';
    
    let queue = $state($upscaleTaskQueue);
</script>

<!-- 显示所有任务进度 -->
<div class="bottom-progress-bar">
    {#each queue as task}
        <div 
            class="progress-item"
            style:background-color={getTaskProgressColor(task.id)}
            style:width="{task.progress}%"
        >
            {task.progress}%
        </div>
    {/each}
</div>
```

## 🔄 完整工作流示例

### 1. 用户点击超分按钮
```typescript
async function onUpscaleClick() {
    // 获取当前图片数据
    const imageData = await getCurrentImageData();
    
    // 执行超分（内存中）
    try {
        const { blob, taskId } = await performUpscaleInMemory(
            imageHash,
            imagePath,
            imageData,
            selectedModel,
            selectedScale,
            gpuId,
            tileSize,
            tta,
            (progress) => {
                // 更新 UI 进度
                updateProgressUI(progress);
            }
        );
        
        // 创建 Blob URL
        const blobUrl = createBlobUrl(blob);
        
        // 更新 Viewer 显示
        updateViewerImage(blobUrl);
        
        // 显示成功提示
        showSuccessToast('超分完成！');
        
    } catch (error) {
        showErrorToast(`超分失败: ${error}`);
    }
}
```

### 2. 预超分（后台）
```typescript
async function startPreupscale() {
    const nextPages = getNextPages(3); // 预加载后续 3 页
    
    for (const page of nextPages) {
        const imageData = await loadPageImage(page);
        
        // 启动预超分任务
        await preupscaleInMemory(
            page.hash,
            page.path,
            imageData,
            selectedModel,
            selectedScale
        );
    }
}
```

### 3. 实时进度更新
```typescript
// Store 自动更新 UI
$effect(() => {
    const task = $currentUpscaleTask;
    if (task) {
        // 右侧边栏自动更新
        rightSidebarProgress = task.progress;
        rightSidebarStatus = task.status;
        rightSidebarColor = task.progressColor;
        
        // 底部进度条自动更新
        bottomProgressItems = $upscaleTaskQueue.map(t => ({
            progress: t.progress,
            color: t.progressColor
        }));
    }
});
```

## 📊 数据流

### 超分流程
```
用户点击超分
    ↓
获取图片数据 (Uint8Array)
    ↓
创建超分任务 (内存中)
    ↓
调用 PyO3 sr_vulkan (返回二进制数据)
    ↓
存储到内存缓存 (Uint8Array + Blob)
    ↓
创建 Blob URL
    ↓
更新 Viewer 显示
    ↓
更新进度条 (绿色 → 完成)
```

### 预超分流程
```
后台启动预超分
    ↓
读取下一页图片
    ↓
创建预超分任务 (黄色进度条)
    ↓
调用 PyO3 sr_vulkan
    ↓
存储到内存缓存
    ↓
更新进度条 (黄色 → 完成)
    ↓
继续下一页
```

## 🎨 进度条颜色

| 颜色 | 含义 | 状态 |
|------|------|------|
| 🟨 黄色 | 预超分中 | `preupscaling` |
| 🟩 绿色 | 超分中/完成 | `upscaling` / `completed` |
| 🟥 红色 | 错误 | `error` |

## 💾 内存管理

### LRU 缓存清理
```typescript
// 自动清理（超过 500MB）
cleanupMemoryCache(500 * 1024 * 1024);

// 手动清理
clearAllCache();

// 获取统计
const stats = getCacheStats();
// {
//   totalTasks: 10,
//   totalCached: 5,
//   totalCachedSize: 123456789,
//   queueLength: 2
// }
```

## 🔧 配置

### 设置最大内存
```typescript
import { setMaxMemory } from '$lib/stores/upscale/UpscaleWorkflow.svelte';

setMaxMemory(500); // 500MB
```

### 启用/禁用预超分
```typescript
import { setPreupscaleEnabled } from '$lib/stores/upscale/UpscaleWorkflow.svelte';

setPreupscaleEnabled(true); // 启用
setPreupscaleEnabled(false); // 禁用
```

## 📝 API 参考

### UpscaleMemoryCache
- `createUpscaleTask()` - 创建任务
- `addUpscaleTask()` - 添加到队列
- `updateTaskProgress()` - 更新进度
- `completeUpscaleTask()` - 完成任务
- `setTaskError()` - 设置错误
- `getUpscaledData()` - 获取二进制数据
- `getUpscaledBlob()` - 获取 Blob
- `cleanupMemoryCache()` - 清理缓存
- `clearAllCache()` - 清空所有

### UpscaleWorkflow
- `performUpscaleInMemory()` - 执行超分
- `preupscaleInMemory()` - 预超分
- `getUpscaledImageFromMemory()` - 获取图片
- `createBlobUrl()` - 创建 URL
- `releaseBlobUrl()` - 释放 URL
- `getTaskProgress()` - 获取进度
- `getTaskStatus()` - 获取状态
- `getTaskProgressColor()` - 获取颜色
- `setPreupscaleEnabled()` - 启用预超分
- `setMaxMemory()` - 设置内存限制

## ✅ 集成清单

- [ ] 导入 UpscaleMemoryCache store
- [ ] 导入 UpscaleWorkflow store
- [ ] 在 ImageViewer 中集成超分
- [ ] 在 UpscalePanel 中显示进度
- [ ] 在 BottomProgressBar 中显示颜色
- [ ] 实现预超分功能
- [ ] 测试内存管理
- [ ] 测试实时进度更新
- [ ] 测试 Blob URL 管理

---

**状态**: ✅ 完成
**性能**: 内存中处理，无本地 I/O
**实时性**: 完整的实时进度更新
**用户体验**: 流畅的超分体验
