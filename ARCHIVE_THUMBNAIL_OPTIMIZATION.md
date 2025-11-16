# 压缩包缩略图优化方案使用指南

## 概述

本方案实现了三层优化架构，大幅提升压缩包缩略图的加载速度：

1. **缓存层**：首图路径和 blob URL 的内存缓存
2. **预取层**：后台异步扫描和生成缩略图
3. **前后端联动**：立即显示首图，后台生成 WebP 缩略图

## 后端使用方法

### 1. 获取首图 blob URL（立即显示）

```rust
use crate::commands::thumbnail_commands::get_archive_first_image_blob;

// 在 Tauri 命令中使用
#[tauri::command]
async fn get_archive_thumbnail(archive_path: String) -> Result<String, String> {
    // 立即返回首图的 data URL
    let blob_url = get_archive_first_image_blob(archive_path, state).await?;
    Ok(blob_url)
}
```

### 2. 提交预取任务（后台处理）

```rust
use crate::commands::thumbnail_commands::enqueue_archive_preload;

// 在需要预取时调用
#[tauri::command]
async fn preload_thumbnails(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        enqueue_archive_preload(path, state).await?;
    }
    Ok(())
}
```

### 3. 设置前台源（优先处理）

```rust
use crate::commands::thumbnail_commands::set_foreground_source;

// 切换目录时设置前台源
#[tauri::command]
async fn change_directory(dir_path: String) -> Result<(), String> {
    // 设置前台源，优先处理当前目录的缩略图
    set_foreground_source(dir_path, state).await?;
    Ok(())
}
```

## 前端使用方法

### 1. 基本缩略图加载

```typescript
import { loadArchiveThumbnail } from '$lib/thumbnailManager';

// 加载单个压缩包缩略图
async function handleArchiveClick(archivePath: string) {
    await loadArchiveThumbnail(archivePath);
}
```

### 2. 批量预加载

```typescript
import { preloadArchiveThumbnails } from '$lib/thumbnailManager';

// 进入目录时预加载所有压缩包
async function enterDirectory(archivePaths: string[]) {
    await preloadArchiveThumbnails(archivePaths);
}
```

### 3. 监听缩略图更新

```typescript
import { setupThumbnailEventListener, thumbnailStore } from '$lib/thumbnailManager';

// 设置事件监听
const unlisten = setupThumbnailEventListener();

// 在 Svelte 组件中使用
$: thumbnailUrl = thumbnailStore.get(archivePath)?.url || '';
```

### 4. 完整示例组件

```svelte
<script lang="ts">
    import { onMount } from 'svelte';
    import { loadArchiveThumbnail, preloadArchiveThumbnails, setForegroundDirectory } from '$lib/thumbnailManager';
    import { thumbnailStore } from '$lib/thumbnailManager';
    
    export let archivePaths: string[];
    export let currentDir: string;
    
    onMount(async () => {
        // 设置前台源
        await setForegroundDirectory(currentDir);
        
        // 预加载所有缩略图
        await preloadArchiveThumbnails(archivePaths);
    });
    
    async function handleArchiveClick(path: string) {
        await loadArchiveThumbnail(path);
    }
</script>

{#each archivePaths as path}
    <div 
        class="archive-item" 
        on:click={() => handleArchiveClick(path)}
    >
        {#if $thumbnailStore.get(path)}
            <img 
                src={$thumbnailStore.get(path)?.url} 
                alt="Thumbnail" 
            />
        {:else}
            <div class="loading-placeholder">加载中...</div>
        {/if}
    </div>
{/each}
```

## 性能优化效果

### 1. 首次加载
- **之前**：需要完整扫描压缩包 → 提取图片 → 生成缩略图
- **现在**：立即显示首图 blob（< 100ms），后台生成 WebP

### 2. 二次加载
- **之前**：重复扫描和提取
- **现在**：直接命中缓存（< 10ms）

### 3. 批量加载
- **之前**：串行处理，每个压缩包都需要完整流程
- **现在**：并行预取，智能优先级调度

## 监控和调试

### 1. 查看缓存统计

```rust
// 获取处理器指标
let metrics = processor.get_metrics().await;
println!("扫描队列长度: {}", metrics.scan_queue_length);
println!("提取队列长度: {}", metrics.extract_queue_length);
println!("最近任务耗时: {:?}", metrics.recent_durations);
```

### 2. 错误统计

```rust
// 获取错误统计
let error_stats = processor.get_error_stats().await;
for (error, count) in error_stats {
    println!("错误 {}: {} 次", error, count);
}
```

### 3. 日志输出

系统会自动输出详细的性能日志：
- `⚡ 首图缓存命中` - 缓存命中
- `🔄 开始预取` - 预取任务开始
- `✅ 扫描完成` - 扫描成功
- `💾 缩略图已添加到缓存` - 缓存更新

## 注意事项

1. **内存管理**：首图缓存默认限制 512 个条目，自动 LRU 淘汰
2. **并发控制**：扫描阶段低并发（4-16），解码阶段高并发（16-64）
3. **自适应调节**：系统会根据任务耗时自动调节并发数
4. **错误处理**：所有任务都有完善的错误处理和重试机制

## 扩展建议

1. **持久化缓存**：可以将首图索引保存到数据库，重启后仍然有效
2. **预测性加载**：根据用户行为预测可能需要的缩略图
3. **压缩优化**：使用更高效的图片格式如 AVIF
4. **CDN 集成**：将缩略图上传到 CDN，实现跨设备共享