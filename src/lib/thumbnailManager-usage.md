# Blob 缩略图系统使用指南

## 概述

新的 Blob 缩略图系统实现了"缓存→预取→前后端联动"的三层优化，可以立即显示原始图片，同时在后台生成优化的 WebP 缩略图。

## 主要特性

1. **立即显示**：通过 `blob:{hash}` URL 立即显示原始图片
2. **后台生成**：自动在后台生成 WebP 缩略图
3. **自动切换**：WebP 完成后自动切换并释放 blob
4. **事件驱动**：通过事件系统实时更新 UI

## API 使用

### 1. 加载压缩包缩略图

```typescript
import { loadArchiveThumbnail, setupThumbnailEventListener } from '$lib/thumbnailManager';

// 设置事件监听（在组件 onMount 中）
const cleanup = setupThumbnailEventListener();

// 加载缩略图
await loadArchiveThumbnail('path/to/archive.zip');

// 组件销毁时清理
cleanup();
```

### 2. 直接获取 Blob URL

```typescript
import { getArchiveFirstImageBlob } from '$lib/thumbnailManager';

// 获取 blob URL
const blobUrl = await getArchiveFirstImageBlob('path/to/archive.zip');
// img.src = blobUrl;
```

### 3. 订阅缩略图状态

```typescript
import { thumbnailStore } from '$lib/thumbnailManager';

// 订阅特定路径的缩略图
const thumbnail = thumbnailStore.get('path/to/archive.zip');
// thumbnail.url - 缩略图 URL
// thumbnail.isBlob - 是否为 blob
// thumbnail.isLoading - 是否正在加载
// thumbnail.blobKey - blob 键值（用于释放）
```

## 事件系统

### thumbnail:firstImageReady

当首图 blob 准备就绪时触发：

```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<{
  archivePath: string;
  blob: string;
}>('thumbnail:firstImageReady', (event) => {
  console.log('首图就绪:', event.payload.archivePath, event.payload.blob);
});
```

### thumbnail:updated

当 WebP 缩略图生成完成时触发：

```typescript
const unlisten = await listen<{
  archivePath: string;
  webpUrl: string;
  blobUrl: string | null;
}>('thumbnail:updated', (event) => {
  console.log('缩略图更新:', event.payload.archivePath, event.payload.webpUrl);
  // 前端会自动释放旧的 blobUrl
});
```

## 组件示例

参见 `BlobThumbnailDemo.svelte` 查看完整的使用示例。

## 注意事项

1. **统一状态源**：UI 应该只订阅 `thumbnailStore`，避免使用旧的 `thumbnailState`
2. **事件监听**：记得在组件销毁时调用返回的清理函数
3. **Blob 生命周期**：系统会自动管理 blob 的释放，无需手动处理

## 迁移指南

如果你正在使用旧的缩略图系统：

1. 将 `thumbnailState.cacheThumbnail` 替换为 `thumbnailStore.update`
2. 移除 `addThumbnailCb` 回调，改为订阅 `thumbnailStore`
3. 使用 `loadArchiveThumbnail` 替代直接的 API 调用