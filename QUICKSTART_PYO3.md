# PyO3 超分系统快速开始

## 🚀 5 分钟快速集成

### 步骤 1: 准备 sr_vulkan 模块

从 picacg-qt 项目获取 `sr_vulkan` 模块（.pyd 或 .so 文件），放置在 Python 可以找到的位置。

### 步骤 2: 在主应用中初始化

在 `src/App.svelte` 或主布局组件中：

```svelte
<script lang="ts">
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
import { onMount } from 'svelte';

onMount(async () => {
    try {
        await pyo3UpscaleManager.initialize(
            './src-tauri/python/upscale_wrapper.py',
            './cache/pyo3-upscale'
        );
        
        if (pyo3UpscaleManager.isAvailable()) {
            console.log('✅ PyO3 超分已就绪');
        }
    } catch (error) {
        console.error('初始化失败:', error);
    }
});
</script>
```

### 步骤 3: 在组件中使用

```svelte
<script lang="ts">
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';

async function upscaleImage(imagePath: string) {
    // 设置模型
    await pyo3UpscaleManager.setModel('cunet', 2);
    
    // 执行超分
    const result = await pyo3UpscaleManager.upscaleImage(imagePath);
    
    // 转换为 URL
    const blob = new Blob([result], { type: 'image/webp' });
    const url = URL.createObjectURL(blob);
    
    return url;
}
</script>
```

## 🎯 完整示例

```svelte
<script lang="ts">
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';

let imagePath = $state('');
let upscaledUrl = $state('');
let isProcessing = $state(false);
let error = $state('');

async function handleUpscale() {
    if (!imagePath) return;
    
    isProcessing = true;
    error = '';
    
    try {
        // 检查缓存
        const cached = await pyo3UpscaleManager.checkCache(imagePath);
        if (cached) {
            console.log('使用缓存:', cached);
            upscaledUrl = `file://${cached}`;
            return;
        }
        
        // 执行超分
        const result = await pyo3UpscaleManager.upscaleImage(imagePath, 60.0);
        
        // 显示结果
        const blob = new Blob([result], { type: 'image/webp' });
        upscaledUrl = URL.createObjectURL(blob);
        
    } catch (err) {
        error = err instanceof Error ? err.message : String(err);
    } finally {
        isProcessing = false;
    }
}
</script>

<div class="upscale-demo">
    <input 
        type="text" 
        bind:value={imagePath} 
        placeholder="输入图片路径"
    />
    
    <button onclick={handleUpscale} disabled={isProcessing}>
        {isProcessing ? '处理中...' : '超分'}
    </button>
    
    {#if error}
        <div class="error">{error}</div>
    {/if}
    
    {#if upscaledUrl}
        <img src={upscaledUrl} alt="超分结果" />
    {/if}
</div>
```

## 📋 可用模型

- `cunet` - CUNet 模型（推荐，通用）
- `photo` - 照片模型
- `anime_style_art_rgb` - 动漫风格
- 更多模型见 `MODEL_NAMES` 字典

## ⚙️ 高级配置

```typescript
// 设置 Tile Size（处理大图时使用）
pyo3UpscaleManager.setTileSize(512);

// 设置降噪等级（-1 到 3）
pyo3UpscaleManager.setNoiseLevel(1);

// 获取缓存统计
const stats = await pyo3UpscaleManager.getCacheStats();

// 清理缓存
await pyo3UpscaleManager.cleanupCache(30); // 30 天
```

## 🐛 常见问题

**Q: sr_vulkan 模块不可用？**
A: 确保已正确安装 sr_vulkan 模块，并且 Python 版本兼容。

**Q: 超分很慢？**
A: 首次超分需要加载模型，后续会快很多。可以增加 tile size 或使用更简单的模型。

**Q: 内存不足？**
A: 增加 tile size 参数，例如 `setTileSize(512)`。

## 📚 更多信息

- 完整文档: `PYO3_UPSCALE_SYSTEM.md`
- 迁移指南: `PYO3_MIGRATION_COMPLETE.md`
