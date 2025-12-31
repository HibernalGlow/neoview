# NeoView 内存泄露审计报告

**审计日期**: 2024年
**范围**: 前端 (Svelte/TypeScript) + 后端 (Rust/Tauri)

---

## 📋 执行摘要

经过全面检查，NeoView 项目整体内存管理良好。本次审计修复了 **3 个严重问题**，发现了 **2 个低风险问题**，并确认了大部分代码遵循正确的资源清理模式。

---

## ✅ 已修复的问题（之前会话）

### 1. CurrentFrameLayer.svelte - setTimeout 泄露 [严重]
**位置**: `src/lib/stackview/layers/CurrentFrameLayer.svelte`
**问题**: 动画清理定时器未保存引用，快速翻页时定时器累积
**修复**: 保存定时器引用，在新动画开始和 onDestroy 时清理

### 2. CurrentFrameLayer.svelte - Store 订阅泄露 [中等]
**位置**: `src/lib/stackview/layers/CurrentFrameLayer.svelte`
**问题**: `pageTransitionStore.subscribe()` 返回的取消函数未使用
**修复**: 保存 unsubscribe 函数，在 onDestroy 中调用

### 3. will-change CSS 滥用 [中等]
**位置**: `FrameImage.svelte`, `CanvasImage.svelte`
**问题**: 持久性 `will-change` 导致 GPU 图层持续分配
**修复**: 移除持久性 will-change，保留 translateZ(0) 基础优化

### 4. PageFlipMonitorCard.svelte - setInterval 泄露 [中等]
**位置**: `src/lib/cards/benchmark/PageFlipMonitorCard.svelte`
**问题**: setInterval 未在组件销毁时清理
**修复**: 使用 onMount/onDestroy 正确管理生命周期

---

## ✅ 正确实现的模式

### Store 订阅
| 文件 | 模式 | 状态 |
|------|------|------|
| SidebarControlLayer.svelte | 12个订阅 + onDestroy 清理 | ✅ 正确 |
| ImageInfoLayer.svelte | 订阅 + onDestroy 清理 | ✅ 正确 |
| InfoPanel.svelte | 订阅 + onDestroy 清理 | ✅ 正确 |
| FrameImage.svelte | $effect 返回清理函数 | ✅ 正确 |

### 事件监听器
| 文件 | 模式 | 状态 |
|------|------|------|
| hoverScroll.ts | destroy() 清理所有监听器 | ✅ 正确 |
| hoverPan.ts | destroy() 清理所有监听器 | ✅ 正确 |
| cursorAutoHide.ts | destroy() 清理监听器和定时器 | ✅ 正确 |
| gestures.ts | destroy() 清理所有监听器 | ✅ 正确 |
| HoverScrollLayer.svelte | onDestroy 清理监听器+Observer | ✅ 正确 |
| HoverLayer.svelte | onDestroy 清理所有资源 | ✅ 正确 |
| StackView.svelte | onDestroy 清理所有资源 | ✅ 正确 |
| runtimeTheme.ts | beforeunload 清理 Tauri listener | ✅ 正确 |

### Observer 清理
| 文件 | 模式 | 状态 |
|------|------|------|
| StackView.svelte | ResizeObserver.disconnect() | ✅ 正确 |
| HoverScrollLayer.svelte | ResizeObserver + MutationObserver disconnect | ✅ 正确 |
| HoverLayer.svelte | ResizeObserver + MutationObserver disconnect + timeout清理 | ✅ 正确 |

### requestAnimationFrame 清理
| 文件 | 模式 | 状态 |
|------|------|------|
| hoverScroll.ts | cancelAnimationFrame in destroy | ✅ 正确 |
| hoverPan.ts | cancelAnimationFrame in destroy | ✅ 正确 |
| perfMonitor.ts | stopFrameRateMonitor() 清理 | ✅ 正确 |
| HoverScrollLayer.svelte | 多处 cancelAnimationFrame | ✅ 正确 |
| HoverLayer.svelte | cancelAnimationFrame in onDestroy | ✅ 正确 |
| viewerController.ts | cancelAnimation() 方法 | ✅ 正确 |

### URL.createObjectURL 清理
| 文件 | 模式 | 状态 |
|------|------|------|
| imagePool.ts | evict() 方法调用 revokeObjectURL | ✅ 正确 |
| thumbnailStoreV3.svelte.ts | cleanup() 清理所有 blob URL | ✅ 正确 |
| thumbnailWorker.ts | 加载后立即 revoke | ✅ 正确 |
| FolderThumbnailLoader.ts | 清理时 revoke | ✅ 正确 |
| VideoPlayer.svelte | 组件销毁时 revoke | ✅ 正确 |
| settingsExport.ts | 使用后 revoke | ✅ 正确 |

### Worker 清理
| 文件 | 模式 | 状态 |
|------|------|------|
| imageDecoderManager.ts | worker.terminate() | ✅ 正确 |
| imageDecoder.ts | decoderWorker.terminate() | ✅ 正确 |

### Tauri Event Listeners
| 文件 | 模式 | 状态 |
|------|------|------|
| thumbnailStoreV3.svelte.ts | cleanup() 调用 unlisten | ✅ 正确 |
| runtimeTheme.ts | beforeunload 清理 unlisten | ✅ 正确 |
| fontManager.ts | destroy() 清理 unlisten | ✅ 正确 |
| sidebarConfig.svelte.ts | beforeunload 清理 unlisten | ✅ 正确 |
| streamingLoader.svelte.ts | setUnlisten() 管理 | ✅ 正确 |
| ipcService.ts | unlisten 管理 | ✅ 正确 |

---

## ⚠️ 低风险问题

### 1. autoBackground.ts - 无界缓存
**位置**: `src/lib/utils/autoBackground.ts:1`
```typescript
const cache = new Map<string, string>();
```
**风险等级**: 低
**影响**: 背景色缓存会随着浏览的图片增加而增长
**建议**: 缓存的值很小（颜色字符串），且只在图片浏览时增加，影响有限。可考虑添加 LRU 限制或在书本切换时清理。

### 2. pathHash.ts - 无界缓存
**位置**: `src/lib/utils/pathHash.ts:42`
```typescript
const hashCache = new Map<string, string>();
```
**风险等级**: 低
**影响**: 路径哈希缓存会随着访问的文件增加而增长
**说明**: 已提供 `clearHashCache()` 函数用于清理，但未被主动调用。可在书本切换时调用。

### 3. placeholders.ts - 有限缓存
**位置**: `src/lib/utils/thumbnail/placeholders.ts:66`
```typescript
const placeholderCache = new Map<string, string>();
```
**风险等级**: 无
**说明**: 仅缓存固定的占位图类型（image, video, archive 等），条目数量有限，无问题。

---

## 🔧 后端 (Rust) 检查结果

### DirectoryCache
**位置**: `src-tauri/src/core/directory_cache.rs`
**状态**: ✅ 设计良好
- 容量限制 (512 条目默认)
- TTL 过期 (120秒)
- LRU+LFU 混合淘汰策略
- 访问计数保护热点目录

### 其他缓存
- `dimension_cache` - 持久化到文件
- `upscale_cache` - 有专门的 cleanup 命令
- `thumbnail_cache` - 使用 SQLite，有维护命令

---

## 📊 模块级订阅（故意设计）

以下模块级订阅是故意设计的单例模式，不需要清理：

| 文件 | 说明 |
|------|------|
| cacheMaintenance.ts | taskScheduler 订阅用于跟踪清理任务 |
| hoverPreviewSettings.svelte.ts | store 订阅用于持久化设置 |

---

## 📝 最佳实践检查清单

### Svelte 5 组件
- [x] 使用 `onDestroy` 清理资源，不要依赖 `onMount` 返回值
- [x] 保存 `subscribe()` 返回的 unsubscribe 函数
- [x] 清理 setTimeout/setInterval
- [x] 清理 ResizeObserver/MutationObserver
- [x] 清理 requestAnimationFrame
- [x] 清理 addEventListener

### 资源管理
- [x] URL.createObjectURL 后必须 revokeObjectURL
- [x] Worker 必须 terminate
- [x] Tauri listen 必须 unlisten

### 缓存设计
- [x] 使用 LRU 或其他有界缓存
- [x] 提供清理方法
- [ ] 考虑在上下文切换时主动清理（可选优化）

---

## 🎯 建议的后续优化

1. **可选**: 在 `bookStore` 切换书本时调用 `clearHashCache()` 清理路径哈希缓存
2. **可选**: 为 `autoBackground.ts` 的缓存添加 LRU 限制（如 1000 条）
3. **可选**: 添加定期内存监控日志，便于生产环境问题排查

---

## ✅ 结论

NeoView 项目的内存管理整体健康。主要的内存泄露问题（翻页动画相关）已在本次会话中修复。剩余的低风险问题影响有限，可根据实际需要进行优化。

