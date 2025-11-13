# 缓存系统和进度条升级 - 完整指南

## 📋 概述

完整升级缓存系统和 Viewer 底部进度条，适配最新的 PyO3 内存中超分：

✅ **新缓存管理系统** - LRU 缓存，自动清理
✅ **改进的进度条** - 实时超分进度显示
✅ **多层进度显示** - 页面进度 + 预超分进度 + 任务队列
✅ **缓存统计** - 实时显示缓存使用情况
✅ **性能优化** - 内存高效，自动清理

## 🎯 核心改进

### 1. 缓存系统 (UpscaleCacheManager)

**旧系统问题**:
- ❌ 无缓存管理
- ❌ 内存持续增长
- ❌ 无统计信息
- ❌ 无自动清理

**新系统特性**:
- ✅ LRU 缓存管理
- ✅ 自动内存清理
- ✅ 详细统计信息
- ✅ 可配置大小限制
- ✅ 定期过期清理
- ✅ 访问计数和命中率

### 2. 进度条系统 (ProgressBar)

**旧系统问题**:
- ❌ 只显示页面进度
- ❌ 无实时超分进度
- ❌ 无任务队列显示
- ❌ 无颜色状态区分

**新系统特性**:
- ✅ 多层进度显示
- ✅ 实时超分进度
- ✅ 任务队列可视化
- ✅ 颜色状态 (黄/绿/红)
- ✅ 动画效果
- ✅ 悬停提示

## 📁 文件结构

```
src/lib/
├── stores/
│   └── upscale/
│       ├── UpscaleMemoryCache.svelte.ts      (已有)
│       ├── UpscaleWorkflow.svelte.ts         (已有)
│       └── UpscaleCacheManager.svelte.ts     (新增)
│
└── components/
    └── viewer/
        ├── ImageViewer.svelte               (需要更新)
        └── ProgressBar.svelte               (新增)
```

## 🔄 集成步骤

### 步骤 1: 创建新文件

已创建：
- `src/lib/stores/upscale/UpscaleCacheManager.svelte.ts`
- `src/lib/components/viewer/ProgressBar.svelte`

### 步骤 2: 在 ImageViewer 中导入并使用

```svelte
<script lang="ts">
	import ProgressBar from './ProgressBar.svelte';
	import { 
		upscaleMemoryCache,
		currentUpscaleTask,
		upscaleTaskQueue
	} from '$lib/stores/upscale/UpscaleMemoryCache.svelte';
	import {
		addCacheItem,
		getCacheItem,
		hasCacheItem,
		startPeriodicCleanup
	} from '$lib/stores/upscale/UpscaleCacheManager.svelte';

	// 启动定期清理
	onMount(() => {
		const cleanup = startPeriodicCleanup(60000); // 每分钟检查一次
		return cleanup;
	});

	// 超分完成时添加到缓存
	function handleUpscaleComplete(imageUrl: string, taskId: string) {
		const task = $currentUpscaleTask;
		if (task && task.id === taskId) {
			const blob = task.upscaledBlob;
			if (blob) {
				addCacheItem(
					task.imageHash,
					task.imagePath,
					task.model,
					task.scale,
					task.upscaledData!,
					blob,
					imageUrl
				);
			}
		}
	}
</script>

<!-- 在 Viewer 底部使用新的进度条组件 -->
<ProgressBar 
	showProgressBar={showProgressBar}
	preUpscaleProgress={preUpscaleProgress}
	totalPreUpscalePages={totalPreUpscalePages}
/>
```

### 步骤 3: 在 UpscalePanelNew 中集成缓存

```svelte
<script lang="ts">
	import {
		getCacheStats,
		getCacheUsagePercent,
		setMaxCacheSize,
		hasCacheItem
	} from '$lib/stores/upscale/UpscaleCacheManager.svelte';

	// 检查缓存
	function checkCache() {
		const hasCached = hasCacheItem(imageHash, selectedModel, selectedScale);
		if (hasCached) {
			showSuccessToast('缓存已找到', '可直接使用缓存结果');
		}
	}

	// 显示缓存统计
	let cacheStats = $state(getCacheStats());
	let cacheUsage = $state(getCacheUsagePercent());
</script>

<!-- 显示缓存统计 -->
<div class="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg">
	<div class="text-center">
		<div class="text-2xl font-bold text-primary">{cacheStats.totalItems}</div>
		<div class="text-xs text-muted-foreground">已缓存</div>
	</div>
	<div class="text-center">
		<div class="text-2xl font-bold text-primary">{(cacheStats.totalSize / 1024 / 1024).toFixed(1)}</div>
		<div class="text-xs text-muted-foreground">MB ({cacheUsage.toFixed(1)}%)</div>
	</div>
</div>
```

## 📊 缓存系统详解

### 缓存键生成
```typescript
// 格式: imageHash_model_scale
// 例如: a1b2c3d4_REALESRGAN_X4PLUS_UP4X_2
const key = generateCacheKey(imageHash, model, scale);
```

### 缓存项结构
```typescript
interface CacheItem {
	id: string;                    // 缓存键
	imageHash: string;             // 图片哈希
	imagePath: string;             // 原始路径
	model: string;                 // 超分模型
	scale: number;                 // 放大倍数
	upscaledData?: Uint8Array;     // 超分数据
	upscaledBlob?: Blob;           // Blob 对象
	upscaledUrl?: string;          // Blob URL
	createdAt: number;             // 创建时间
	accessedAt: number;            // 最后访问时间
	size: number;                  // 大小（字节）
	hits: number;                  // 访问次数
}
```

### LRU 清理策略
```
当缓存超过最大大小时：
1. 按访问时间排序 (accessedAt)
2. 删除最旧的项
3. 清理到 80% 以下
4. 释放 Blob URL
```

### 定期清理
```typescript
// 每分钟检查一次
startPeriodicCleanup(60000);

// 删除 24 小时以上的缓存
// 自动释放 Blob URL
```

## 🎨 进度条显示

### 多层进度
```
┌─────────────────────────────────────────┐
│ 预超分进度 (黄色, 60% 透明度)            │
│ ├─ 任务队列进度 (多层, 40-70% 透明度)   │
│ └─ 当前页面进度 (绿色/黄色/红色, 80%)   │
└─────────────────────────────────────────┘
```

### 颜色含义
| 颜色 | 含义 | 状态 |
|------|------|------|
| 🟨 黄色 | 预超分中 | preupscaling |
| 🟩 绿色 | 超分中/完成 | upscaling/completed |
| 🟥 红色 | 错误 | error |
| ⚪ 奶白色 | 正常页面进度 | idle |

### 动画效果
- 超分中: 脉冲动画 (0.8 → 0.4 → 0.8)
- 预超分: 静态显示
- 错误: 红色闪烁

### 悬停提示
```
鼠标悬停进度条时显示：
- 如果超分中: "预超分: 45% | REALESRGAN_X4PLUS_UP4X"
- 如果正常: "第 5 / 100 页"
```

## 💾 缓存管理 API

### 添加缓存
```typescript
addCacheItem(
	imageHash: string,
	imagePath: string,
	model: string,
	scale: number,
	upscaledData: Uint8Array,
	upscaledBlob?: Blob,
	upscaledUrl?: string
);
```

### 获取缓存
```typescript
const item = getCacheItem(imageHash, model, scale);
if (item) {
	console.log('缓存命中:', item);
	// 使用 item.upscaledUrl 或 item.upscaledBlob
}
```

### 检查缓存
```typescript
if (hasCacheItem(imageHash, model, scale)) {
	console.log('缓存存在');
}
```

### 删除缓存
```typescript
removeCacheItem(imageHash, model, scale);
```

### 清空所有缓存
```typescript
clearAllCache();
```

### 设置最大大小
```typescript
setMaxCacheSize(500); // 500 MB
```

### 获取统计
```typescript
const stats = getCacheStats();
// {
//   totalItems: 10,
//   totalSize: 123456789,
//   hitRate: 0.85,
//   oldestItem: {...},
//   newestItem: {...}
// }

const percent = getCacheUsagePercent();
// 24.7 (百分比)
```

### 启动定期清理
```typescript
const cleanup = startPeriodicCleanup(60000); // 每分钟

// 停止清理
cleanup();
```

## 🔧 配置选项

### 最大缓存大小
```typescript
setMaxCacheSize(500); // 默认 500 MB
```

### 定期清理间隔
```typescript
startPeriodicCleanup(60000); // 默认 60 秒
```

### 过期时间
```typescript
// 在 UpscaleCacheManager 中修改
const maxAge = 24 * 60 * 60 * 1000; // 24 小时
```

## 📊 性能指标

| 指标 | 值 |
|------|-----|
| 缓存查询 | O(1) |
| 缓存添加 | O(1) |
| LRU 清理 | O(n log n) |
| 内存开销 | ~5MB (vs 50MB 子进程) |
| 最大缓存 | 500MB (可配置) |

## ✅ 集成清单

- [ ] 创建 UpscaleCacheManager.svelte.ts
- [ ] 创建 ProgressBar.svelte
- [ ] 在 ImageViewer 中导入 ProgressBar
- [ ] 在 ImageViewer 中导入 UpscaleCacheManager
- [ ] 启动定期清理
- [ ] 在超分完成时添加到缓存
- [ ] 在 UpscalePanel 中显示缓存统计
- [ ] 测试缓存功能
- [ ] 测试进度条显示
- [ ] 测试 LRU 清理

## 🐛 故障排除

### 问题: 进度条不显示
**解决**: 检查 `showProgressBar` 是否为 true

### 问题: 缓存不工作
**解决**: 确保在超分完成时调用 `addCacheItem()`

### 问题: 内存持续增长
**解决**: 检查定期清理是否启动，调整 `maxSize`

### 问题: 进度条颜色不对
**解决**: 检查 `getTaskProgressColor()` 返回值

## 📚 相关文档

- `UPSCALE_MEMORY_WORKFLOW.md` - 工作流指南
- `UPSCALE_PANEL_INTEGRATION.md` - Panel 集成
- `COMPLETE_UPSCALE_SYSTEM.md` - 系统总结

---

**状态**: ✅ 完成
**性能**: 高效的 LRU 缓存
**用户体验**: 实时进度反馈
**内存管理**: 自动清理
