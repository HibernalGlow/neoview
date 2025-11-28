# Viewer 重构计划

## 目标

将现有的 `ImageViewer` 重构为模块化、可维护的架构，参考 NeeView 设计。

## 设计原则

1. **模块化** - 每个功能独立模块，通过组合调用
2. **代码量控制** - 每个文件不超过 800 行
3. **文档完善** - 每个模块配详细文档和实现原理
4. **可替换** - 新系统可直接替换旧系统

## 迁移策略：忒休斯之船

采用渐进式替换策略，在保持现有 Viewer 功能的同时，逐步将内部组件替换为新实现：

```
阶段 1: 在 Flow 模式创建独立测试环境
        ├── NewReaderNode (测试节点)
        └── PipelineDebugNode (性能监控)

阶段 2: 创建新的核心组件，但不替换旧组件
        ├── ImageRenderer (新) ← 测试完成后替换旧的图片渲染
        ├── GestureHandler (新) ← 测试完成后替换旧的手势处理
        └── 其他组件...

阶段 3: 在现有 ImageViewer 中逐步引入新组件
        ├── 先替换图片渲染部分
        ├── 再替换手势处理部分
        └── 最后替换状态管理

阶段 4: 完全切换到新系统
        └── 删除旧代码
```

**优势**：
- 每一步都可以实时看到变化
- 出问题可以快速回滚
- 不影响用户正常使用
- 可以逐步验证每个组件

## 模块划分

### 1. 核心模块 (已完成)

| 模块 | 文件 | 行数 | 职责 |
|------|------|------|------|
| 类型定义 | `core/types.ts` | ~400 | 所有类型定义 |
| 虚拟页面列表 | `core/virtualPageList.ts` | ~600 | 页面管理、分割、旋转 |
| 页面帧管理 | `core/pageFrameManager.ts` | ~400 | 帧管理、导航 |
| 预加载管道 | `core/preloadPipeline.ts` | ~600 | 图片预加载、缓存 |
| 书籍管理器 | `core/bookManager.ts` | ~500 | 门面类，协调各模块 |
| 视图控制器 | `core/viewerController.ts` | ~400 | 缩放、平移、旋转 |

### 2. 视图模块 (待重构)

| 模块 | 文件 | 行数 | 职责 |
|------|------|------|------|
| 图片渲染器 | `viewer/ImageRenderer.svelte` | ~300 | 图片显示、裁剪、旋转 |
| 手势处理器 | `viewer/GestureHandler.ts` | ~400 | 触摸、鼠标、键盘事件 |
| 缩放控制器 | `viewer/ZoomController.ts` | ~200 | 缩放逻辑 |
| 平移控制器 | `viewer/PanController.ts` | ~200 | 平移逻辑 |
| 动画管理器 | `viewer/AnimationManager.ts` | ~200 | 过渡动画 |
| 主视图组件 | `viewer/NewViewer.svelte` | ~500 | 组合所有模块 |

### 3. UI 模块 (待重构)

| 模块 | 文件 | 行数 | 职责 |
|------|------|------|------|
| 工具栏 | `viewer/Toolbar.svelte` | ~200 | 顶部工具栏 |
| 页面指示器 | `viewer/PageIndicator.svelte` | ~100 | 页码显示 |
| 缩略图条 | `viewer/ThumbnailStrip.svelte` | ~300 | 底部缩略图 |
| 设置面板 | `viewer/SettingsPanel.svelte` | ~300 | 设置选项 |

## 重构步骤

### Phase 1: 核心视图组件 (当前)

1. **ImageRenderer** - 图片渲染
   - 支持裁剪 (clip-path)
   - 支持旋转 (transform)
   - 支持缩放 (scale)
   - 支持平移 (translate)

2. **GestureHandler** - 手势处理
   - 触摸手势 (pinch, pan, tap)
   - 鼠标事件 (wheel, drag)
   - 键盘快捷键

### Phase 2: 视图控制

3. **ZoomController** - 缩放控制
   - 适应模式 (fit width, fit height, fit page)
   - 手动缩放
   - 双击缩放

4. **PanController** - 平移控制
   - 边界限制
   - 惯性滚动
   - 自动居中

### Phase 3: 动画与过渡

5. **AnimationManager** - 动画管理
   - 页面切换动画
   - 缩放动画
   - 平移动画

### Phase 4: 集成

6. **NewViewer** - 主视图组件
   - 组合所有模块
   - 状态管理
   - 事件分发

## 文件结构

```
src/lib/
├── core/                    # 核心模块 (已完成)
│   ├── types.ts
│   ├── virtualPageList.ts
│   ├── pageFrameManager.ts
│   ├── preloadPipeline.ts
│   ├── bookManager.ts
│   └── viewerController.ts
│
├── viewer/                  # 视图模块 (待创建)
│   ├── ImageRenderer.svelte
│   ├── GestureHandler.ts
│   ├── ZoomController.ts
│   ├── PanController.ts
│   ├── AnimationManager.ts
│   └── NewViewer.svelte
│
├── stores/
│   └── bookStore2.ts        # 状态管理 (已完成)
│
└── components/
    └── canvas/
        └── nodes/
            └── NewReaderNode.svelte  # Flow 测试节点 (已完成)
```

## 迁移策略

1. **并行开发** - 新系统在 Flow 模式测试，不影响旧系统
2. **渐进替换** - 功能验证后逐步替换旧组件
3. **保持兼容** - 新系统 API 与旧系统兼容

## 现有 TopToolbar 功能清单

需要在新 Viewer 中支持的功能：

### 视图控制
- [x] 缩放 (zoomIn, zoomOut, resetZoom)
- [x] 旋转 (rotateClockwise)
- [ ] 缩放模式 (fit, fill, fitWidth, fitHeight, original)
- [ ] 视图模式锁定

### 页面控制
- [x] 翻页 (上一页, 下一页)
- [x] 页面模式 (单页, 双页)
- [x] 阅读方向 (LTR, RTL)
- [x] 横向分割
- [x] 自动旋转
- [ ] 排序模式

### 布局控制
- [ ] 布局模式 (layoutMode)


## 已完成

### 阶段 1: 测试环境 ✅
1. ✅ 创建 `src/lib/viewer/` 目录
2. ✅ 实现 `ImageRenderer.svelte` - 图片渲染组件
3. ✅ 实现 `GestureHandler.ts` - 手势处理器
4. ✅ 创建 `NewViewer.svelte` - 主视图组件
5. ✅ 创建 `index.ts` 导出
6. ✅ 创建 `NewReaderNode.svelte` - Flow 测试节点
7. ✅ 创建 `PipelineDebugNode.svelte` - 性能监控节点
8. ✅ 在 TopToolbar 缩放菜单添加分割/自动旋转选项

### 核心系统 ✅
1. ✅ `virtualPageList.ts` - 支持分割、自动旋转
2. ✅ `bookManager.ts` - 书籍管理
3. ✅ `bookStore2.ts` - 状态管理
4. ✅ 修复尺寸更新时的 rebuild 触发逻辑

## 当前问题

1. **$effect 循环** - 需要使用 `untrack` 避免
2. **尺寸信息延迟** - 初始化时 width/height 为 0，需要异步更新后 rebuild
3. **新旧系统同步** - 需要稳定的双向同步机制

## 下一步

### 阶段 2: 完善测试环境
1. [x] 修复 NewReaderNode 的 $effect 循环问题（使用 untrack）
2. [x] 在 NewReaderNode 中集成 ImageRenderer 组件
3. [x] 修复 ImageRenderer 的 splitHalf 属性
4. [x] 创建 ImageViewerDisplay2（兼容旧接口的新实现）
5. [x] 创建 NeoViewer 主组件
6. [x] 在 TopToolbar 添加 NeoViewer 开关
7. [x] 在 Classic 模式集成 NeoViewer
8. [x] NeoViewer 集成 bookStore2 虚拟页面系统
9. [x] 修复分割页面居中问题（添加 translateX 补偿）
10. [x] 禁用滚轮缩放（用户另外绑定翻页）
11. [x] 创建 imageSizePreloader 模块
12. [x] 创建 NeoImageLoader 模块
13. [x] NeoImageLoader 预加载时获取尺寸并更新 bookStore2
14. [ ] 验证分割和自动旋转功能
15. [ ] 集成 NeoImageLoader 到 NeoViewer 使用虚拟列表）

### 阶段 3: 在现有 ImageViewer 中引入新组件
1. [ ] 分析现有 ImageViewer 结构
2. [ ] 识别可替换的组件边界
3. [ ] 逐步替换图片渲染部分
4. [ ] 逐步替换手势处理部分

### 阶段 4: 完全切换
1. [ ] 验证所有功能正常
2. [ ] 删除旧代码
3. [ ] 更新文档
