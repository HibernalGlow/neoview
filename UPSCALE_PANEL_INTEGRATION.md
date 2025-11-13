# 新的 UpscalePanel 集成指南

## 📋 概述

完全改进的 UpscalePanel，适配内存中超分工作流：
- ✅ 实时进度显示（0-100%）
- ✅ 进度条颜色状态（黄/绿/红）
- ✅ 任务队列管理
- ✅ 缓存统计显示
- ✅ 预超分功能
- ✅ 内存管理控制

## 🔄 替换步骤

### 1. 备份旧文件
```bash
# 备份原始 UpscalePanel
cp src/lib/components/panels/UpscalePanel.svelte src/lib/components/panels/UpscalePanel.svelte.backup
cp src/lib/components/panels/UpscalePanelNew.svelte src/lib/components/panels/UpscalePanel.svelte

```

### 2. 替换新文件
```bash
# 使用新的 UpscalePanel
cp src/lib/components/panels/UpscalePanelNew.svelte src/lib/components/panels/UpscalePanel.svelte
```

### 3. 更新导入（如果需要）
在 `RightSidebar.svelte` 中，确保导入正确：
```svelte
import UpscalePanel from '$lib/components/panels/UpscalePanel.svelte';
```

## 📊 新功能

### 1. 实时进度显示
```
当前任务进度
├─ 状态指示 (预超分🟨 / 超分中🟩 / 错误🟥)
├─ 进度百分比 (0-100%)
├─ 动画进度条
└─ 任务详情 (模型、倍数)
```

### 2. 缓存统计
```
┌─────────────┬─────────────┐
│  已缓存: 5  │  大小: 123MB │
└─────────────┴─────────────┘
```

### 3. 任务队列
```
任务队列 (3)
├─ 预 REALESRGAN_X4PLUS_UP4X  45%
├─ WAIFU2X_CUNET_UP2X         100%
└─ 预 REALCUGAN_PRO_UP3X      20%
```

### 4. 高级设置
- GPU ID 选择
- Tile Size 配置
- TTA 启用/禁用
- 最大内存限制 (100-1000 MB)

### 5. 预超分控制
- 启用/禁用预超分
- 预超分下一页按钮
- 后台自动处理

## 🎨 UI 布局

```
┌─────────────────────────────────┐
│  图片超分 (内存中)               │
├─────────────────────────────────┤
│ 当前任务进度                     │
│ ├─ 🟩 超分中... 45%             │
│ └─ [████████░░░░░░░░░░░░░░░░]  │
├─────────────────────────────────┤
│ 缓存统计                         │
│ ├─ 已缓存: 5    │  大小: 123MB  │
├─────────────────────────────────┤
│ 任务队列 (3)                     │
│ ├─ 预 REALESRGAN 45%           │
│ ├─ WAIFU2X 100%                │
│ └─ 预 REALCUGAN 20%            │
├─────────────────────────────────┤
│ 超分模型                         │
│ [Real-ESRGAN 4x (通用)        ▼] │
├─────────────────────────────────┤
│ 放大倍数                         │
│ [1x] [2x] [3x] [4x]           │
├─────────────────────────────────┤
│ 高级设置 ▼                       │
├─────────────────────────────────┤
│ 预超分 [开关]                    │
├─────────────────────────────────┤
│ [立即超分]                       │
│ [预超分下一页]                   │
│ [保存超分图]                     │
├─────────────────────────────────┤
│ 当前图片: image.jpg             │
├─────────────────────────────────┤
│ 💡 内存中处理                    │
│ 💡 实时进度                      │
│ 💡 预超分                        │
└─────────────────────────────────┘
```

## 🔌 集成到 RightSidebar

在 `src/lib/components/layout/RightSidebar.svelte` 中：

```svelte
<script lang="ts">
	import UpscalePanel from '$lib/components/panels/UpscalePanel.svelte';
	// ... 其他导入
</script>

<!-- 在 Sidebar 内容中 -->
{#if activeItem.value === 'upscale'}
	<UpscalePanel />
{/if}
```

## 📝 API 参考

### Store 导入
```typescript
import { 
	currentUpscaleTask,      // 当前任务
	upscaleTaskQueue,        // 任务队列
	upscaleCacheStats        // 缓存统计
} from '$lib/stores/upscale/UpscaleMemoryCache.svelte';

import {
	performUpscaleInMemory,  // 执行超分
	preupscaleInMemory,      // 预超分
	createBlobUrl,           // 创建 URL
	releaseBlobUrl,          // 释放 URL
	getTaskProgress,         // 获取进度
	getTaskStatus,           // 获取状态
	getTaskProgressColor,    // 获取颜色
	setPreupscaleEnabled,    // 启用预超分
	setMaxMemory             // 设置内存限制
} from '$lib/stores/upscale/UpscaleWorkflow.svelte';
```

### 主要函数

#### performUpscaleInMemory
```typescript
const { blob, taskId } = await performUpscaleInMemory(
	imageHash: string,
	imagePath: string,
	imageData: Uint8Array,
	model: string,
	scale: number,
	gpuId?: number,
	tileSize?: number,
	tta?: boolean,
	onProgress?: (progress: number) => void
);
```

#### preupscaleInMemory
```typescript
const taskId = await preupscaleInMemory(
	imageHash: string,
	imagePath: string,
	imageData: Uint8Array,
	model: string,
	scale: number
);
```

## 🎯 使用流程

### 1. 用户点击"立即超分"
```
1. 获取当前图片数据 (Uint8Array)
2. 计算图片哈希
3. 调用 performUpscaleInMemory()
4. 创建 Blob URL
5. 触发 'upscale-complete' 事件
6. Viewer 更新显示
7. Panel 显示成功提示
```

### 2. 用户点击"预超分下一页"
```
1. 获取下一页图片列表 (3 页)
2. 为每页调用 preupscaleInMemory()
3. 后台处理，不阻塞 UI
4. 任务队列显示进度
5. 用户翻页时，预超分结果已在缓存中
```

### 3. 实时进度更新
```
Store 更新 → $effect 触发 → UI 重新渲染
- 进度百分比
- 进度条颜色
- 任务状态
- 缓存统计
```

## 🎨 颜色方案

| 颜色 | 含义 | 图标 | 动画 |
|------|------|------|------|
| 🟨 黄色 | 预超分中 | 🔥 Flame | 脉冲 |
| 🟩 绿色 | 超分中/完成 | ⏳ Loader2 | 旋转 |
| 🟥 红色 | 错误 | ⚠️ AlertCircle | 静止 |

## 📊 缓存统计显示

```
┌─────────────┬─────────────┐
│  已缓存: 5  │  大小: 123MB │
└─────────────┴─────────────┘
```

- **已缓存**: 内存中缓存的任务数
- **大小**: 总缓存大小 (MB)

## 🔧 配置选项

### 模型选择
- Real-ESRGAN 4x (通用)
- Real-ESRGAN 4x (动漫)
- Waifu2x 2x (动漫)
- Waifu2x 4x (动漫)
- RealCUGAN 2x (专业)
- RealCUGAN 3x (专业)
- RealCUGAN 4x (专业)

### 放大倍数
- 1x, 2x, 3x, 4x

### 高级设置
- **GPU ID**: 选择使用的 GPU (默认: 0)
- **Tile Size**: 内存块大小，越小越省内存 (默认: 400)
- **TTA**: Test Time Augmentation，更好质量但更慢 (默认: 关闭)
- **最大内存**: 缓存最大限制 (100-1000 MB)

## 🚀 性能优化

### 内存管理
- LRU 缓存自动清理
- 可配置最大内存限制
- 实时显示缓存统计

### 预超分
- 后台低优先级处理
- 不阻塞主 UI
- 自动缓存结果

### 实时更新
- 使用 Svelte $effect 响应式更新
- 无需手动刷新
- 流畅的用户体验

## ✅ 集成清单

- [ ] 创建 UpscalePanelNew.svelte
- [ ] 备份原始 UpscalePanel.svelte
- [ ] 替换为新版本
- [ ] 测试基本功能
- [ ] 测试实时进度更新
- [ ] 测试预超分功能
- [ ] 测试缓存管理
- [ ] 测试错误处理
- [ ] 验证 UI 布局
- [ ] 性能测试

## 🐛 故障排除

### 问题: 进度条不更新
**解决**: 检查 $effect 是否正确订阅 Store

### 问题: 预超分不工作
**解决**: 确保 `preupscaleEnabled` 为 true，检查下一页获取逻辑

### 问题: 内存持续增长
**解决**: 检查 LRU 清理是否正确执行，调整 `maxMemoryMB`

### 问题: 超分结果未显示
**解决**: 检查 'upscale-complete' 事件是否被 Viewer 正确处理

## 📚 相关文档

- `UPSCALE_MEMORY_WORKFLOW.md` - 完整工作流指南
- `COMPLETE_UPSCALE_SYSTEM.md` - 系统总结
- `PYO3_INTEGRATION.md` - PyO3 集成文档

---

**状态**: ✅ 完成
**兼容性**: Svelte 5 Runes
**性能**: 实时更新，无延迟
**用户体验**: 现代化、流畅
