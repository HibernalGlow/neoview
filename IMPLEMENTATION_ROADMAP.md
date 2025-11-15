# 缩略图系统功能增强 - 实现路线图

## 快速概览

这个功能增强包含 4 个主要部分，建议分阶段实现以降低风险和复杂度。

## 阶段 1: 设置面板集成 (优先级: 🔴 高)

### 目标
将缩略图相关配置从硬编码移到设置面板，支持动态调整。

### 工作项
- [ ] 扩展 `settings.ts` 类型定义
- [ ] 修改 `SettingsPanel.svelte` 添加缩略图配置 UI
- [ ] 修改 `settingsManager.ts` 支持缩略图配置持久化
- [ ] 修改 `FileBrowser.svelte` 从设置读取配置
- [ ] 支持实时应用配置（无需重启）

### 关键文件
```
src/lib/types/settings.ts              [修改]
src/lib/components/panels/SettingsPanel.svelte [修改]
src/lib/settings/settingsManager.ts    [修改]
src/lib/components/panels/FileBrowser.svelte   [修改]
```

### 预期效果
- ✅ 用户可在设置中调整并发数
- ✅ 配置自动保存和加载
- ✅ 无需重启应用即可生效

### 时间估计: 1-2 天

---

## 阶段 2: 缩略图管理面板 (优先级: 🔴 高)

### 目标
在左侧边栏添加缩略图管理面板，支持索引、进度显示、缓存管理。

### 工作项
- [ ] 创建 `ThumbnailPanel.svelte` 组件
- [ ] 创建 `thumbnail.svelte.ts` store 管理状态
- [ ] 实现索引功能（扫描未处理文件）
- [ ] 实现进度跟踪和显示
- [ ] 实现暂停/恢复/取消功能
- [ ] 实现缓存统计和清理

### 关键文件
```
src/lib/components/panels/ThumbnailPanel.svelte [新增]
src/lib/stores/thumbnail.svelte.ts             [新增]
src/lib/utils/thumbnailManager.ts              [修改]
```

### 核心功能
```typescript
// 索引接口
interface ThumbnailIndexer {
  start(path: string): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  getProgress(): { processed: number; total: number; percentage: number };
}

// Store 状态
interface ThumbnailState {
  isIndexing: boolean;
  progress: number;
  processed: number;
  total: number;
  cacheSize: number;
  speed: number;  // 缩略图/秒
  currentFile: string;
}
```

### 预期效果
- ✅ 用户可一键索引整个目录
- ✅ 实时显示索引进度
- ✅ 支持暂停/恢复
- ✅ 显示缓存统计信息

### 时间估计: 2-3 天

---

## 阶段 3: 视频支持 (优先级: 🟡 中)

### 目标
使用 FFmpeg 为视频文件生成缩略图，采用与压缩包相同的流程。

### 工作项
- [ ] 创建 `video_thumbnail.rs` 模块
- [ ] 集成 FFmpeg 命令行工具
- [ ] 实现视频帧提取逻辑
- [ ] 创建 `video_commands.rs` Tauri 命令
- [ ] 修改 `thumbnailManager.ts` 支持视频类型
- [ ] 修改 `ThumbnailPanel.svelte` 显示视频处理状态

### 关键文件
```
src-tauri/src/core/video_thumbnail.rs  [新增]
src-tauri/src/commands/video_commands.rs [新增]
src-tauri/src/core/thumbnail.rs        [修改]
src/lib/utils/thumbnailManager.ts      [修改]
```

### 核心实现
```rust
// video_thumbnail.rs
pub struct VideoThumbnailGenerator {
    ffmpeg_path: PathBuf,
}

impl VideoThumbnailGenerator {
    pub fn extract_frame(
        &self,
        video_path: &Path,
        time_seconds: f64,
    ) -> Result<DynamicImage, String> {
        // 使用 FFmpeg 提取指定时间的帧
        // 返回 DynamicImage 供缩略图处理
    }
}
```

### 支持的格式
- MP4, MKV, AVI, MOV, FLV, WebM, WMV

### 预期效果
- ✅ 视频文件显示缩略图
- ✅ 支持自定义截图时间
- ✅ 缓存视频缩略图

### 时间估计: 3-4 天

---

## 阶段 4: 统一缓存系统 (优先级: 🟡 中)

### 目标
统一所有文件类型（图片、压缩包、视频）的缓存管理。

### 工作项
- [ ] 统一缓存键格式
- [ ] 实现通用缓存查询接口
- [ ] 实现自动失效机制
- [ ] 实现增量更新支持
- [ ] 修改 `thumbnail.rs` 支持多类型缓存

### 缓存键格式
```
image::/path/to/file.jpg
archive::/path/to/file.zip
video::/path/to/file.mp4
video::/path/to/file.mp4::10    # 10秒处
```

### 关键文件
```
src-tauri/src/core/thumbnail.rs        [修改]
src-tauri/src/core/thumbnail_db.rs     [修改]
src/lib/utils/thumbnailManager.ts      [修改]
```

### 预期效果
- ✅ 统一的缓存管理
- ✅ 自动失效机制
- ✅ 增量更新支持

### 时间估计: 2-3 天

---

## 实现顺序建议

### 推荐顺序
```
1. 阶段 1 (设置面板) ← 基础，其他阶段依赖
   ↓
2. 阶段 2 (管理面板) ← 核心功能
   ↓
3. 阶段 3 (视频支持) ← 可选但有价值
   ↓
4. 阶段 4 (统一缓存) ← 优化和完善
```

### 快速路径 (最小可行产品)
如果时间紧张，可以先做：
1. ✅ 阶段 1 (设置面板)
2. ✅ 阶段 2 (管理面板 - 基础功能)

这样用户就能：
- 调整性能配置
- 一键索引缩略图
- 查看进度和统计

---

## 关键决策点

### 1. FFmpeg 集成方式
- **选项 A**: 调用系统 FFmpeg（用户需自行安装）
- **选项 B**: 打包 FFmpeg 到应用（应用体积增加 ~50MB）
- **推荐**: 选项 A，提供自动检测和下载提示

### 2. 缓存存储位置
- **选项 A**: `~/.neoview/cache/thumbnails/`
- **选项 B**: 系统缓存目录（`%APPDATA%` 等）
- **推荐**: 选项 A，便于管理和清理

### 3. 索引策略
- **选项 A**: 全量索引（每次都重新扫描）
- **选项 B**: 增量索引（只处理新增/修改文件）
- **推荐**: 选项 B，性能更好

### 4. 并发控制
- **本地文件**: 6-8 个（CPU 密集）
- **压缩包**: 3-4 个（I/O 密集）
- **视频**: 2-3 个（FFmpeg 资源密集）

---

## 技术栈

### 前端
- Svelte 5 + TypeScript
- shadcn/ui 组件库
- Tauri IPC 通信

### 后端
- Rust + Tauri
- image crate（图片处理）
- zip crate（压缩包处理）
- FFmpeg（视频处理）

### 数据库
- SQLite（缩略图元数据）
- 内存缓存（最近使用）

---

## 风险和缓解

| 风险 | 概率 | 影响 | 缓解方案 |
|------|------|------|---------|
| FFmpeg 不可用 | 中 | 高 | 提供自动检测和下载 |
| 性能下降 | 中 | 中 | 充分的并发控制和测试 |
| 缓存不一致 | 低 | 高 | 完善的失效机制 |
| 内存溢出 | 低 | 中 | 限制缓存大小 |

---

## 测试策略

### 单元测试
```
- 视频帧提取
- 缓存键生成
- 设置加载/保存
- 索引逻辑
```

### 集成测试
```
- 混合类型文件索引
- 并发控制
- 缓存一致性
- 设置应用
```

### 性能测试
```
- 1000+ 文件索引时间
- 内存占用
- CPU 使用率
- 缓存命中率
```

---

## 文档和交付

### 需要编写的文档
- [ ] 用户指南（缩略图管理）
- [ ] 配置参考
- [ ] FFmpeg 安装指南
- [ ] 故障排除指南

### 需要更新的文档
- [ ] README.md
- [ ] 设置说明
- [ ] API 文档

---

## 成功标准

### 阶段 1 完成
- ✅ 设置面板显示缩略图配置
- ✅ 配置可动态调整
- ✅ 配置自动保存

### 阶段 2 完成
- ✅ 缩略图面板显示
- ✅ 索引功能可用
- ✅ 进度显示准确
- ✅ 统计信息正确

### 阶段 3 完成
- ✅ 视频文件有缩略图
- ✅ 视频缓存正常工作
- ✅ 性能可接受

### 阶段 4 完成
- ✅ 统一的缓存管理
- ✅ 自动失效机制
- ✅ 增量更新支持

---

## 后续优化方向

1. **AI 驱动的缩略图选择**
   - 自动选择最有代表性的帧
   - 支持自定义选择算法

2. **多语言支持**
   - 国际化 UI 文本
   - 本地化文档

3. **云同步**
   - 跨设备缓存同步
   - 云端备份

4. **高级统计**
   - 缓存分析
   - 性能报告
   - 使用统计

---

**版本**: 1.0  
**最后更新**: 2024-11-15  
**状态**: 规划中  
**下一步**: 确认优先级和时间表
