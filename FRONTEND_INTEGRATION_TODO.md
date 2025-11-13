# 前端集成待办事项

## ✅ 已完成的后端工作

1. **Python 包装层** - `src-tauri/python/upscale_wrapper.py`
   - ✅ 完整的 UpscaleManager 类
   - ✅ 7 种模型支持
   - ✅ 异步任务队列

2. **Rust PyO3 层** - `src-tauri/src/core/pyo3_upscaler.rs`
   - ✅ PyO3 集成
   - ✅ 缓存管理
   - ✅ 编译成功

3. **Tauri 命令** - `src-tauri/src/commands/pyo3_upscale_commands.rs`
   - ✅ 9 个命令函数
   - ✅ 完整的 API

4. **前端管理器** - `src/lib/stores/upscale/PyO3UpscaleManager.svelte.ts`
   - ✅ TypeScript 类型
   - ✅ 完整的方法

## 🔧 需要完成的前端工作

### 1. 简化兼容层

当前的 `UpscaleMemoryCache.svelte.ts` 和 `UpscaleWorkflow.svelte.ts` 试图兼容旧系统，但这导致了复杂的类型问题。

**建议方案**：直接在组件中使用 `pyo3UpscaleManager`，不需要兼容层。

### 2. 更新 UpscalePanel.svelte

```svelte
<script lang="ts">
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
import { onMount } from 'svelte';

let selectedModel = $state('cunet');
let scale = $state(2);
let tileSize = $state(0);
let noiseLevel = $state(0);
let isProcessing = $state(false);
let progress = $state(0);

const availableModels = $derived(
    pyo3UpscaleManager.isAvailable() 
        ? pyo3UpscaleManager.getAvailableModels() 
        : []
);

onMount(async () => {
    // 初始化 PyO3 管理器
    try {
        await pyo3UpscaleManager.initialize(
            './src-tauri/python/upscale_wrapper.py',
            './cache/pyo3-upscale'
        );
    } catch (error) {
        console.error('初始化失败:', error);
    }
});

async function handleModelChange() {
    await pyo3UpscaleManager.setModel(selectedModel, scale);
}

async function handleUpscale(imagePath: string) {
    isProcessing = true;
    progress = 0;
    
    try {
        pyo3UpscaleManager.setTileSize(tileSize);
        pyo3UpscaleManager.setNoiseLevel(noiseLevel);
        
        progress = 50;
        const result = await pyo3UpscaleManager.upscaleImage(imagePath);
        progress = 100;
        
        // 转换为 URL
        const blob = new Blob([result], { type: 'image/webp' });
        const url = URL.createObjectURL(blob);
        
        // 使用 url...
        
    } catch (error) {
        console.error('超分失败:', error);
    } finally {
        isProcessing = false;
    }
}
</script>

<div class="upscale-panel">
    <!-- 模型选择 -->
    <select bind:value={selectedModel} onchange={handleModelChange}>
        {#each availableModels as model}
            <option value={model}>{model}</option>
        {/each}
    </select>
    
    <!-- 缩放倍数 -->
    <input type="number" bind:value={scale} min="2" max="4" />
    
    <!-- Tile Size -->
    <input type="number" bind:value={tileSize} min="0" max="1024" step="32" />
    
    <!-- 降噪等级 -->
    <input type="number" bind:value={noiseLevel} min="-1" max="3" />
    
    <!-- 进度条 -->
    {#if isProcessing}
        <div class="progress-bar">
            <div 
                class="progress-fill" 
                style="width: {progress}%"
                class:bg-blue-500={progress < 30}
                class:bg-yellow-500={progress >= 30 && progress < 70}
                class:bg-green-500={progress >= 70}
            ></div>
        </div>
    {/if}
</div>
```

### 3. 更新 ImageViewer.svelte

在图片查看器中集成超分功能：

```svelte
<script lang="ts">
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';

let currentImagePath = $state('');
let upscaledUrl = $state('');
let isUpscaling = $state(false);

async function upscaleCurrentImage() {
    if (!currentImagePath) return;
    
    isUpscaling = true;
    try {
        const result = await pyo3UpscaleManager.upscaleImage(currentImagePath);
        const blob = new Blob([result], { type: 'image/webp' });
        upscaledUrl = URL.createObjectURL(blob);
    } catch (error) {
        console.error('超分失败:', error);
    } finally {
        isUpscaling = false;
    }
}
</script>

<!-- 在图片上添加超分按钮 -->
<button onclick={upscaleCurrentImage} disabled={isUpscaling}>
    {isUpscaling ? '超分中...' : '超分'}
</button>

{#if upscaledUrl}
    <img src={upscaledUrl} alt="超分结果" />
{/if}
```

### 4. 进度条颜色变化

```svelte
<script lang="ts">
function getProgressColor(progress: number): string {
    if (progress < 30) return 'bg-blue-500';
    if (progress < 70) return 'bg-yellow-500';
    return 'bg-green-500';
}
</script>

<div class="progress-bar">
    <div 
        class="progress-fill {getProgressColor(progress)}" 
        style="width: {progress}%"
    ></div>
</div>

<style>
.progress-bar {
    width: 100%;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    transition: width 0.3s ease, background-color 0.3s ease;
}
</style>
```

### 5. 缓存管理界面

```svelte
<script lang="ts">
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';

let cacheStats = $state({ totalFiles: 0, totalSize: 0, cacheDir: '' });

async function updateStats() {
    cacheStats = await pyo3UpscaleManager.getCacheStats();
}

async function cleanupCache() {
    const removed = await pyo3UpscaleManager.cleanupCache(30);
    console.log(`已删除 ${removed} 个文件`);
    await updateStats();
}

onMount(updateStats);
</script>

<div class="cache-panel">
    <h3>缓存统计</h3>
    <p>文件数: {cacheStats.totalFiles}</p>
    <p>总大小: {(cacheStats.totalSize / 1024 / 1024).toFixed(2)} MB</p>
    <p>目录: {cacheStats.cacheDir}</p>
    
    <button onclick={cleanupCache}>清理缓存</button>
</div>
```

## 📋 快速集成步骤

1. **移除旧的兼容层文件**（可选）
   - 删除或重命名 `UpscaleMemoryCache.svelte.ts`
   - 删除或重命名 `UpscaleWorkflow.svelte.ts`

2. **在主应用中初始化**
   ```typescript
   // src/App.svelte 或主布局
   import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
   
   onMount(async () => {
       await pyo3UpscaleManager.initialize(
           './src-tauri/python/upscale_wrapper.py',
           './cache/pyo3-upscale'
       );
   });
   ```

3. **更新 UpscalePanel.svelte**
   - 使用上面的示例代码
   - 移除对旧 API 的依赖

4. **更新 ImageViewer.svelte**
   - 添加超分按钮
   - 集成超分功能

5. **测试**
   - 确保 `sr_vulkan` 模块可用
   - 测试超分功能
   - 测试缓存功能

## 🎯 核心 API

```typescript
// 初始化
await pyo3UpscaleManager.initialize(pythonModulePath, cacheDir);

// 检查可用性
if (pyo3UpscaleManager.isAvailable()) { ... }

// 获取模型列表
const models = pyo3UpscaleManager.getAvailableModels();

// 设置模型
await pyo3UpscaleManager.setModel('cunet', 2);

// 设置参数
pyo3UpscaleManager.setTileSize(512);
pyo3UpscaleManager.setNoiseLevel(0);

// 执行超分
const result = await pyo3UpscaleManager.upscaleImage(imagePath, 60.0);

// 转换为 URL
const blob = new Blob([result], { type: 'image/webp' });
const url = URL.createObjectURL(blob);

// 缓存管理
const stats = await pyo3UpscaleManager.getCacheStats();
const removed = await pyo3UpscaleManager.cleanupCache(30);
```

## 📚 相关文档

- `PYO3_UPSCALE_SYSTEM.md` - 完整系统文档
- `PYO3_MIGRATION_COMPLETE.md` - 迁移完成报告
- `QUICKSTART_PYO3.md` - 快速开始指南

## ✨ 总结

后端已完全完成并编译成功！前端只需要：
1. 直接使用 `pyo3UpscaleManager`
2. 不需要复杂的兼容层
3. 按照上面的示例更新组件

这样可以避免类型系统的复杂性，直接使用简单清晰的 API。
