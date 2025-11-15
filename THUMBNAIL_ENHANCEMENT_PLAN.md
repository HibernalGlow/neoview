# 缩略图系统功能增强计划

## 需求概述

### 1. 设置面板集成
- 将缩略图相关配置移到性能 Tab
- 支持动态调整并发数、缓存大小等参数
- 配置项包括：
  - 本地文件并发数
  - 压缩包并发数
  - 视频处理并发数
  - 缓存大小
  - 缩略图尺寸
  - 启用/禁用视频处理

### 2. 缩略图面板增强
- 在左侧边栏添加缩略图管理面板
- 功能包括：
  - **索引按钮**：一键索引未处理的缩略图
  - **进度条**：显示当前索引进度
  - **统计信息**：已处理/总数
  - **暂停/恢复**：控制索引过程
  - **清空缓存**：清理缩略图缓存

### 3. 视频支持
- 使用 FFmpeg 生成视频封面
- 支持格式：mp4, mkv, avi, mov, flv 等
- 采用与压缩包相同的流程：
  - 提取第一帧或指定时间点
  - 生成缩略图
  - 缓存到磁盘
  - 记录到数据库

### 4. 统一缓存流程
- 所有类型（图片、压缩包、视频 需要可以添加其他文件）使用同一套缓存系统
- 缓存键格式：`type::path::identifier`
- 支持增量更新和智能失效

## 实现方案

### Phase 1: 设置面板扩展 (1-2天)

#### 1.1 扩展 settings.ts 类型定义
```typescript
// src/lib/types/settings.ts
export interface ThumbnailSettings {
  // 缩略图配置
  thumbnailSize: number;           // 缩略图尺寸 (px)
  maxConcurrentLocal: number;      // 本地文件并发
  maxConcurrentArchive: number;    // 压缩包并发
  maxConcurrentVideo: number;      // 视频并发
  cacheSize: number;               // 缓存大小 (MB)
  enableVideoThumbnail: boolean;   // 启用视频缩略图
  videoFrameTime: number;          // 视频截图时间 (秒)
  autoIndexOnStartup: boolean;     // 启动时自动索引
}
```

#### 1.2 修改 SettingsPanel.svelte
- 在性能 Tab 中添加缩略图配置部分
- 添加滑块控制并发数
- 添加开关控制视频处理
- 添加输入框设置缓存大小

### Phase 2: 缩略图面板 (2-3天)

#### 2.1 创建 ThumbnailPanel.svelte
```svelte
<script>
  // 显示统计信息
  // 显示进度条
  // 提供索引按钮
  // 显示当前任务队列
</script>
```

#### 2.2 功能实现
- **索引功能**：扫描目录，找出未处理的文件
- **进度跟踪**：实时显示处理进度
- **任务控制**：暂停/恢复/取消
- **统计展示**：已处理/总数/缓存大小

### Phase 3: 视频支持 (3-4天)

#### 3.1 后端实现
- 创建 `video_thumbnail.rs` 模块
- 集成 FFmpeg 命令行工具
- 实现视频帧提取
- 集成到 ThumbnailManager

#### 3.2 前端集成
- 检测视频文件类型
- 调用视频缩略图生成
- 使用相同的缓存流程

### Phase 4: 统一缓存系统 (2-3天)

#### 4.1 缓存键统一
```rust
// 缓存键格式
"image::/path/to/file.jpg"
"archive::/path/to/file.zip"
"video::/path/to/file.mp4"
"video::/path/to/file.mp4::10"  // 10秒处
```

#### 4.2 缓存管理
- 统一的缓存查询接口
- 自动失效机制
- 增量更新支持

## 文件结构规划

```
src/
├── lib/
│   ├── components/
│   │   ├── panels/
│   │   │   ├── ThumbnailPanel.svelte          [新增]
│   │   │   └── SettingsPanel.svelte           [修改]
│   │   └── dialogs/
│   │       └── ThumbnailSettingsPanel.svelte  [新增]
│   ├── stores/
│   │   └── thumbnail.svelte.ts                [新增]
│   ├── types/
│   │   └── settings.ts                        [修改]
│   └── utils/
│       └── thumbnailManager.ts                [修改]
│
src-tauri/
└── src/
    ├── core/
    │   ├── video_thumbnail.rs                 [新增]
    │   └── thumbnail.rs                       [修改]
    └── commands/
        └── video_commands.rs                  [新增]
```

## 关键实现细节

### 1. 设置面板集成
```typescript
// 在 SettingsPanel.svelte 的 performance tab 中添加
<div class="space-y-4">
  <h3>缩略图设置</h3>
  
  <!-- 本地文件并发 -->
  <div class="space-y-2">
    <Label>本地文件并发数</Label>
    <input type="range" bind:value={settings.thumbnail.maxConcurrentLocal} />
  </div>
  
  <!-- 压缩包并发 -->
  <div class="space-y-2">
    <Label>压缩包并发数</Label>
    <input type="range" bind:value={settings.thumbnail.maxConcurrentArchive} />
  </div>
  
  <!-- 视频处理 -->
  <div class="flex items-center justify-between">
    <Label>启用视频缩略图</Label>
    <Switch bind:checked={settings.thumbnail.enableVideoThumbnail} />
  </div>
</div>
```

### 2. 缩略图面板
```svelte
<!-- ThumbnailPanel.svelte -->
<div class="p-4 space-y-4">
  <!-- 统计信息 -->
  <div class="grid grid-cols-2 gap-2 text-sm">
    <div>已处理: {processed}</div>
    <div>总数: {total}</div>
    <div>缓存: {cacheSize}MB</div>
    <div>速度: {speed}/s</div>
  </div>
  
  <!-- 进度条 -->
  <div class="space-y-1">
    <div class="flex justify-between text-xs">
      <span>索引进度</span>
      <span>{progress}%</span>
    </div>
    <div class="w-full bg-gray-200 rounded-full h-2">
      <div class="bg-blue-500 h-2 rounded-full" style="width: {progress}%"></div>
    </div>
  </div>
  
  <!-- 控制按钮 -->
  <div class="flex gap-2">
    <Button onclick={startIndex} disabled={isIndexing}>开始索引</Button>
    <Button onclick={pauseIndex} disabled={!isIndexing}>暂停</Button>
    <Button onclick={clearCache} variant="destructive">清空缓存</Button>
  </div>
</div>
```

### 3. 视频支持
```rust
// video_thumbnail.rs
pub struct VideoThumbnailGenerator {
    ffmpeg_path: PathBuf,
}

impl VideoThumbnailGenerator {
    pub fn extract_frame(&self, video_path: &Path, time_seconds: f64) -> Result<DynamicImage, String> {
        // 使用 FFmpeg 提取指定时间的帧
        // ffmpeg -i input.mp4 -ss 10 -vframes 1 output.png
    }
}
```

## 配置迁移

### 当前配置位置
- `thumbnailManager.ts` 中的硬编码值
- `FileBrowser.svelte` 中的 `configureThumbnailManager` 调用

### 迁移步骤
1. 将配置值移到 `settings.ts`
2. 从 `settingsManager` 读取配置
3. 动态应用到 `configureThumbnailManager`
4. 支持实时更新（无需重启）

## 性能考虑

### 并发控制
- 本地文件：6-8 个并发
- 压缩包：3-4 个并发
- 视频：2-3 个并发（FFmpeg 资源密集）

### 缓存策略
- 内存缓存：最近 100 个缩略图
- 磁盘缓存：所有已生成的缩略图
- 自动清理：超过 30 天未使用的缓存

### 索引优化
- 增量索引：只处理新增/修改的文件
- 后台处理：不阻塞 UI
- 优先级队列：用户可见内容优先

## 测试计划

### 单元测试
- [ ] 视频帧提取
- [ ] 缓存键生成
- [ ] 设置加载/保存

### 集成测试
- [ ] 混合类型文件索引
- [ ] 并发控制
- [ ] 缓存一致性

### 性能测试
- [ ] 1000+ 文件索引时间
- [ ] 内存占用
- [ ] CPU 使用率

## 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| FFmpeg 依赖 | 高 | 中 | 提供下载/检测机制 |
| 性能下降 | 中 | 中 | 充分的并发控制 |
| 缓存不一致 | 低 | 高 | 完善的失效机制 |

## 时间估计

- Phase 1: 1-2 天
- Phase 2: 2-3 天
- Phase 3: 3-4 天
- Phase 4: 2-3 天
- 测试和优化: 2-3 天

**总计**: 12-18 天

## 优先级

1. **高优先级** (必须做)
   - 设置面板集成
   - 缩略图面板基础功能
   - 索引和进度显示

2. **中优先级** (应该做)
   - 视频支持
   - 统一缓存系统
   - 任务控制（暂停/恢复）

3. **低优先级** (可以做)
   - 高级统计信息
   - 自定义索引规则
   - 导出/导入缓存

## 后续优化

1. **AI 驱动的缩略图选择**：自动选择最有代表性的帧
2. **多语言支持**：国际化 UI
3. **云同步**：跨设备缓存同步
4. **智能预加载**：基于使用习惯预加载

---

**文档版本**: 1.0  
**最后更新**: 2024-11-15  
**状态**: 规划中
