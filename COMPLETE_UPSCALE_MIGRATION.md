# 完整超分系统迁移 - 从命令行到内存流 Python 超分

## 🎯 迁移目标

从旧版命令行超分系统完全迁移到新版内存流 Python (PyO3) 超分系统。

### 旧系统 (命令行)
```
图片 → 保存到本地 → 调用命令行工具 → 读取结果文件 → 显示
```

### 新系统 (内存流)
```
图片 → Uint8Array → PyO3/sr_vulkan → Uint8Array → Blob URL → 显示
```

## 📋 完整迁移清单

### 阶段 1: 后端 PyO3 集成 ✅
- [x] 创建 `sr_vulkan_upscaler.rs` (PyO3 直接集成)
- [x] 创建 `sr_vulkan_commands.rs` (Tauri 命令)
- [x] 添加 pyo3 依赖
- [x] 注册命令

### 阶段 2: 前端 Store 层 ✅
- [x] 创建 `UpscaleMemoryCache.svelte.ts` (内存缓存)
- [x] 创建 `UpscaleWorkflow.svelte.ts` (工作流)
- [x] 创建 `UpscaleCacheManager.svelte.ts` (缓存管理)

### 阶段 3: UI 层 ✅
- [x] 创建 `UpscalePanelNew.svelte` (新面板)
- [x] 创建 `ProgressBar.svelte` (进度条)
- [x] 添加设置持久化

### 阶段 4: 集成 (当前)
- [ ] 在 ImageViewer 中集成新超分系统
- [ ] 移除旧的预加载队列逻辑
- [ ] 使用新的内存流超分
- [ ] 测试所有功能

## 🔧 完整实现步骤

### 步骤 1: 更新 ImageViewer.svelte

#### 1.1 替换导入

```typescript
// ❌ 删除旧的导入
// import { upscaleState, performUpscale } from '$lib/stores/upscale/UpscaleManager.svelte';

// ✅ 添加新的导入
import { 
	currentUpscaleTask,
	upscaleTaskQueue,
	upscaleCacheStats
} from '$lib/stores/upscale/UpscaleMemoryCache.svelte';

import {
	performUpscaleInMemory,
	preupscaleInMemory,
	createBlobUrl,
	releaseBlobUrl,
	getTaskProgress,
	getTaskStatus,
	getTaskProgressColor
} from '$lib/stores/upscale/UpscaleWorkflow.svelte';

import {
	addCacheItem,
	getCacheItem,
	hasCacheItem
} from '$lib/stores/upscale/UpscaleCacheManager.svelte';
```

#### 1.2 移除旧的预加载队列逻辑

```typescript
// ❌ 删除这些代码
// let preloadQueue = $state<ImageDataWithHash[]>([]);
// let isPreloading = $state(false);
// async function processPreloadQueue() { ... }
// async function addToPreloadQueue() { ... }
```

#### 1.3 添加新的超分函数

```typescript
/**
 * 执行内存中超分
 */
async function performMemoryUpscale(imageData: string, imageHash: string) {
	try {
		console.log('[ImageViewer] 开始内存中超分，hash:', imageHash);

		// 检查缓存
		const cached = getCacheItem(imageHash, 'REALESRGAN_X4PLUS_UP4X', 2);
		if (cached) {
			console.log('[ImageViewer] 使用缓存结果');
			const blobUrl = createBlobUrl(cached.upscaledBlob!);
			
			// 更新显示
			bookStore.upscaledImageData = blobUrl;
			return;
		}

		// 转换为 Uint8Array
		const uint8Array = await dataUrlToUint8Array(imageData);

		// 执行超分
		const { blob, taskId } = await performUpscaleInMemory(
			imageHash,
			bookStore.currentImage?.path || '',
			uint8Array,
			'REALESRGAN_X4PLUS_UP4X',
			2.0,
			0,
			400,
			false,
			(progress) => {
				console.log('[ImageViewer] 超分进度:', progress);
			}
		);

		// 创建 Blob URL
		const blobUrl = createBlobUrl(blob);

		// 添加到缓存
		addCacheItem(
			imageHash,
			bookStore.currentImage?.path || '',
			'REALESRGAN_X4PLUS_UP4X',
			2.0,
			uint8Array,
			blob,
			blobUrl
		);

		// 更新显示
		bookStore.upscaledImageData = blobUrl;

		console.log('[ImageViewer] 超分完成，taskId:', taskId);

	} catch (error) {
		console.error('[ImageViewer] 超分失败:', error);
	}
}

/**
 * 转换 data URL 到 Uint8Array
 */
async function dataUrlToUint8Array(dataUrl: string): Promise<Uint8Array> {
	if (dataUrl.startsWith('data:')) {
		const base64 = dataUrl.split(',')[1];
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	} else if (dataUrl.startsWith('blob:')) {
		const response = await fetch(dataUrl);
		const blob = await response.blob();
		return new Uint8Array(await blob.arrayBuffer());
	}
	throw new Error('不支持的 URL 格式');
}
```

#### 1.4 更新自动超分逻辑

```typescript
/**
 * 触发自动超分
 */
async function triggerAutoUpscale() {
	if (!imageData) return;
	if (!currentImageHash) return;

	// 检查全局开关
	const enabled = await getGlobalUpscaleEnabled();
	if (!enabled) {
		console.log('[ImageViewer] 全局超分开关已关闭');
		return;
	}

	try {
		// 使用新的内存超分
		await performMemoryUpscale(imageData, currentImageHash);
	} catch (error) {
		console.error('[ImageViewer] 自动超分失败:', error);
	}
}
```

#### 1.5 添加预超分功能

```typescript
/**
 * 启动预超分
 */
async function startPreupscale() {
	if (!bookStore.currentBook) return;

	const currentIndex = bookStore.currentPageIndex;
	const pages = bookStore.currentBook.pages;
	const nextPages = pages.slice(currentIndex + 1, currentIndex + 4); // 预超分后续3页

	for (const page of nextPages) {
		try {
			// 加载图片数据
			const pageImageData = await loadPageImageData(page);
			const pageHash = await calculateImageHash(pageImageData);

			// 检查是否已缓存
			if (hasCacheItem(pageHash, 'REALESRGAN_X4PLUS_UP4X', 2)) {
				console.log('[ImageViewer] 页面已缓存，跳过预超分');
				continue;
			}

			// 转换为 Uint8Array
			const uint8Array = await dataUrlToUint8Array(pageImageData);

			// 启动预超分
			await preupscaleInMemory(
				pageHash,
				page.path,
				uint8Array,
				'REALESRGAN_X4PLUS_UP4X',
				2.0
			);

			console.log('[ImageViewer] 预超分已启动，hash:', pageHash);

		} catch (error) {
			console.warn('[ImageViewer] 预超分失败:', error);
		}
	}
}
```

### 步骤 2: 更新进度条

#### 2.1 在 ImageViewer 中使用新进度条

```svelte
<script>
	import ProgressBar from './ProgressBar.svelte';
	
	// 订阅当前任务
	let currentTask = $state($currentUpscaleTask);
	let taskQueue = $state($upscaleTaskQueue);
	
	$effect(() => {
		currentTask = $currentUpscaleTask;
	});
</script>

<!-- 替换旧的进度条 -->
<ProgressBar 
	showProgressBar={showProgressBar}
	preUpscaleProgress={0}
	totalPreUpscalePages={0}
/>
```

### 步骤 3: 完全替换 Panel

#### 3.1 备份旧 Panel

```bash
cp src/lib/components/panels/UpscalePanel.svelte \
   src/lib/components/panels/UpscalePanel.svelte.OLD
```

#### 3.2 使用新 Panel

```bash
cp src/lib/components/panels/UpscalePanelNew.svelte \
   src/lib/components/panels/UpscalePanel.svelte
```

### 步骤 4: 清理旧代码

#### 4.1 移除旧的超分管理器引用

在所有文件中搜索并替换：
```typescript
// 查找
import { ... } from '$lib/stores/upscale/UpscaleManager.svelte';

// 替换为
// 新的导入 (根据需要)
```

#### 4.2 移除旧的预加载逻辑

删除所有包含以下内容的代码：
- `preloadQueue`
- `isPreloading`
- `processPreloadQueue`
- `addToPreloadQueue`

### 步骤 5: 配置后端

#### 5.1 确保后端命令可用

在 `src-tauri/src/lib.rs` 中确保注册了这些命令：
```rust
.invoke_handler(tauri::generate_handler![
    // sr_vulkan 命令
    init_sr_vulkan_manager,
    check_sr_vulkan_availability,
    get_sr_vulkan_gpu_info,
    upscale_image_sr_vulkan,
    get_sr_vulkan_cache_stats,
    cleanup_sr_vulkan_cache,
])
```

#### 5.2 检查模型映射

在 `sr_vulkan_upscaler.rs` 中确保模型映射正确：
```rust
pub fn map_model_name(model: &str) -> (u32, u32) {
    match model {
        "REALESRGAN_X4PLUS_UP4X" => (0, 0),      // Real-ESRGAN x4
        "REALESRGAN_X4PLUSANIME_UP4X" => (0, 1), // Real-ESRGAN x4 Anime
        "WAIFU2X_CUNET_UP2X" => (1, 0),         // Waifu2x 2x
        // ... 更多模型
        _ => (0, 0) // 默认
    }
}
```

## 📊 完整数据流

### 超分流程
```
1. 用户点击超分
   ↓
2. ImageViewer.performMemoryUpscale()
   ├─ 检查缓存
   ├─ 转换 data URL → Uint8Array
   └─ 调用 performUpscaleInMemory()
   ↓
3. UpscaleWorkflow.performUpscaleInMemory()
   ├─ 创建任务 (UpscaleMemoryCache)
   ├─ 保存临时文件
   ├─ 调用 PyO3 sr_vulkan
   ├─ 接收 Uint8Array 结果
   ├─ 创建 Blob
   └─ 返回 { blob, taskId }
   ↓
4. ImageViewer
   ├─ 创建 Blob URL
   ├─ 添加到缓存
   └─ 更新显示
   ↓
5. ProgressBar 自动更新
   ├─ 显示绿色进度条
   └─ 完成后停止闪烁
```

### 预超分流程
```
1. 用户翻页 / 点击预超分
   ↓
2. ImageViewer.startPreupscale()
   ├─ 获取下一3页
   └─ 为每页调用 preupscaleInMemory()
   ↓
3. UpscaleWorkflow.preupscaleInMemory()
   ├─ 创建黄色任务
   ├─ 后台处理
   └─ 自动缓存结果
   ↓
4. 用户翻页时
   ├─ 检查缓存
   └─ 直接使用缓存结果 (无需等待)
```

## ✅ 测试清单

### 基本功能
- [ ] 点击超分按钮
- [ ] 图片正确显示
- [ ] 进度条显示绿色
- [ ] 完成后不闪烁

### 预超分
- [ ] 启用预超分
- [ ] 翻页时预超分下一页
- [ ] 预超分显示黄色进度条
- [ ] 翻页时使用缓存

### 缓存
- [ ] 超分结果正确缓存
- [ ] 再次超分使用缓存
- [ ] LRU 清理工作正常
- [ ] 缓存统计正确显示

### 进度条
- [ ] 超分中：绿色 + 脉冲
- [ ] 超分完成：绿色 + 不闪烁
- [ ] 预超分中：黄色 + 脉冲
- [ ] 错误：红色

### Panel
- [ ] 实时进度显示
- [ ] 任务队列显示
- [ ] 缓存统计显示
- [ ] 设置保存和加载
- [ ] 全局开关工作

## 🎯 验证成功标准

### 日志输出
```
[ImageViewer] 开始内存中超分，hash: xxxxx
[UpscaleWorkflow] 创建超分任务: xxxxx
[UpscaleWorkflow] 调用 PyO3 sr_vulkan
[UpscaleWorkflow] 超分完成，大小: xxxxx
[CacheManager] 添加缓存: xxxxx
[ImageViewer] 超分完成，taskId: xxxxx
```

### UI 表现
- 点击超分立即响应
- 进度条从白色变绿色
- 完成后显示绿色不闪烁
- Panel 显示实时进度
- 缓存统计正确

### 性能指标
- 超分时间: <200ms (2x), <500ms (4x)
- 内存使用: <500MB
- 缓存命中率: >80%
- 无死循环或卡住

## 📚 相关文档

- `PYO3_INTEGRATION.md` - PyO3 集成指南
- `UPSCALE_MEMORY_WORKFLOW.md` - 内存工作流指南
- `UPSCALE_PANEL_INTEGRATION.md` - Panel 集成指南
- `CACHE_AND_PROGRESSBAR_UPGRADE.md` - 缓存和进度条
- `SYSTEM_UPGRADE_COMPLETE.md` - 系统总结

---

**状态**: 准备就绪
**迁移时间**: ~30 分钟
**风险**: 低
**回滚**: 保留旧文件备份
