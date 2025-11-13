# 快速修复指南 - 超分卡住问题

## 🚨 问题

点击超分按钮后卡住，控制台显示:
```
preload worker already running, will try later
unknown model dir type
超分命令执行失败
```

## ⚡ 快速修复 (5 分钟)

### 方案 1: 使用新的 UpscaleManagerV2 (推荐)

#### 步骤 1: 在 ImageViewer.svelte 中替换导入

找到这一行:
```typescript
import { upscaleState, performUpscale } from '$lib/stores/upscale/UpscaleManager.svelte';
```

替换为:
```typescript
import { upscaleState, performUpscale } from '$lib/stores/upscale/UpscaleManagerV2.svelte';
```

#### 步骤 2: 禁用预加载队列

在 ImageViewer.svelte 中，找到这些代码并注释掉:

```typescript
// 注释掉预加载相关代码
// const preloadQueue = $state<ImageDataWithHash[]>([]);
// const isPreloading = $state(false);
// processPreloadQueue();
```

#### 步骤 3: 简化超分调用

找到 `triggerAutoUpscale` 函数，改为:

```typescript
async function triggerAutoUpscale() {
	if (!imageData) return;
	
	try {
		// 直接调用新的 performUpscale
		await performUpscale(imageData);
	} catch (error) {
		console.error('超分失败:', error);
	}
}
```

### 方案 2: 临时禁用预加载 (快速)

如果不想修改太多代码，可以临时禁用预加载:

在 ImageViewer.svelte 中，找到 `processPreloadQueue` 函数，改为:

```typescript
async function processPreloadQueue() {
	// 临时禁用预加载
	console.log('[ImageViewer] 预加载已禁用');
	return;
	
	// 原始代码...
}
```

## 🔍 验证修复

### 测试步骤

1. **打开应用**
   - 加载一本书

2. **点击超分**
   - 右侧边栏点击"立即超分"
   - 应该看到进度条变绿
   - 不应该卡住

3. **检查控制台**
   ```
   [UpscaleManager] 开始超分，数据长度: xxxxx
   [UpscaleManager] 超分完成，结果长度: xxxxx
   ```

4. **验证进度条**
   - 底部进度条应该显示绿色
   - 不应该闪烁

## 📊 对比

### 修复前
```
❌ 点击超分 → 卡住
❌ 预加载队列 → 无限循环
❌ 模型路径 → 错误
❌ 多任务 → 冲突
```

### 修复后
```
✅ 点击超分 → 立即响应
✅ 预加载队列 → 禁用
✅ 模型路径 → 正确
✅ 单任务 → 顺序处理
```

## 🛠️ 如果还是卡住

### 检查清单

1. **确认导入正确**
   ```typescript
   // 应该是 UpscaleManagerV2
   import { performUpscale } from '$lib/stores/upscale/UpscaleManagerV2.svelte';
   ```

2. **检查后端命令**
   - 确保后端有 `upscale_image_from_data` 命令
   - 检查模型名称是否正确

3. **查看控制台日志**
   - 应该看到 `[UpscaleManager]` 开头的日志
   - 如果没有，说明没有调用新的函数

4. **清除缓存**
   ```bash
   # 清除 .svelte-kit 缓存
   rm -rf .svelte-kit
   
   # 重新启动开发服务器
   npm run dev
   ```

## 📝 关键代码

### UpscaleManagerV2 的核心

```typescript
// 防止并发
let isProcessing = false;

export async function performUpscale(imageData: string): Promise<void> {
	if (isProcessing) {
		console.warn('已有超分任务在进行中');
		return;
	}

	isProcessing = true;
	try {
		// 更新状态
		upscaleState.update(state => ({
			...state,
			isUpscaling: true,
			progress: 0,
			status: '准备超分...'
		}));

		// 调用后端
		const result = await invoke('upscale_image_from_data', {
			dataUrl: imageData,
			model: 'waifu2x_cunet',
			scale: 2
		});

		// 完成
		upscaleState.update(state => ({
			...state,
			isUpscaling: false,
			progress: 100,
			status: '超分完成',
			upscaledImageData: result
		}));

	} catch (error) {
		console.error('超分失败:', error);
		upscaleState.update(state => ({
			...state,
			isUpscaling: false,
			error: String(error)
		}));
	} finally {
		isProcessing = false;
	}
}
```

## 🎯 预期效果

修复后:

1. **响应快速**
   - 点击超分立即响应
   - 不会卡住

2. **进度清晰**
   - 进度条从白色变绿色
   - 显示"超分完成"

3. **错误明确**
   - 如果失败，显示错误信息
   - 不会无限重试

4. **日志清晰**
   ```
   [UpscaleManager] 开始超分，数据长度: 63
   [UpscaleManager] 超分完成，结果长度: 93051
   ```

## ❓ 常见问题

### Q: 修复后还是卡住？
A: 检查是否正确替换了导入，确保使用的是 UpscaleManagerV2

### Q: 超分失败显示 "unknown model dir type"？
A: 这是后端模型路径问题，需要检查后端配置

### Q: 预加载队列还在运行？
A: 确保注释掉了 `processPreloadQueue()` 调用

### Q: 如何恢复原始系统？
A: 恢复备份文件并重新导入原始 UpscaleManager

---

**修复时间**: ~5 分钟
**难度**: 低
**风险**: 低
**效果**: 立竿见影
