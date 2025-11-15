# 步骤 5-8 快速完成指南

## ✅ 已完成
- [x] 步骤 1: Tauri lib.rs 注册视频命令
- [x] 步骤 2: FileSystemAPI 添加视频方法
- [x] 步骤 3: SettingsPanel 添加缩略图配置 UI
- [x] 步骤 4: FileBrowser 导入 ThumbnailsPanel

## 步骤 5: thumbnailManager.ts 支持视频

**文件**: `src/lib/utils/thumbnailManager.ts`

在 `generateThumbnail` 方法中（约第 200 行），找到文件类型判断，添加视频支持：

```typescript
// 在 isArchive 和 isDir 判断后添加
const isVideo = path.match(/\.(mp4|mkv|avi|mov|flv|webm|wmv)$/i);

if (isArchive) {
  console.log('📦 生成压缩包缩略图:', path);
  thumbnail = await FileSystemAPI.generateArchiveThumbnailRoot(path);
} else if (isDir) {
  console.log('📁 生成文件夹缩略图:', path);
  thumbnail = await FileSystemAPI.generateFolderThumbnail(path);
} else if (isVideo) {
  console.log('🎬 生成视频缩略图:', path);
  try {
    thumbnail = await FileSystemAPI.generateVideoThumbnail(path);
  } catch (e) {
    console.debug('视频缩略图生成失败，跳过:', e);
  }
} else {
  console.log('🖼️ 生成文件缩略图:', path);
  thumbnail = await FileSystemAPI.generateFileThumbnail(path);
}
```

## 步骤 6: FileBrowser 应用设置

**文件**: `src/lib/components/panels/FileBrowser.svelte`

找到 `configureThumbnailManager` 调用（约第 306 行），修改为：

```typescript
// 从设置读取配置
const settings = await settingsManager.getThumbnailSettings();

configureThumbnailManager({
  addThumbnail: (path: string, url: string) => fileBrowserStore.addThumbnail(path, url),
  maxConcurrentLocal: settings?.thumbnail?.maxConcurrentLocal || 6,
  maxConcurrentArchive: settings?.thumbnail?.maxConcurrentArchive || 3,
});
```

## 步骤 7: 检查 Cargo.toml

**文件**: `src-tauri/Cargo.toml`

确保依赖存在（通常已有）：

```toml
[dependencies]
image = "0.24"
zip = "0.6"
```

FFmpeg 通过系统命令调用，无需额外 Rust 依赖。

## 步骤 8: 测试集成

### 编译
```bash
yarn build
```

### 测试清单
1. ✅ 应用启动成功
2. ✅ 打开设置 → 性能 Tab
3. ✅ 看到缩略图配置选项
4. ✅ 调整并发数，验证保存
5. ✅ 打开文件浏览器
6. ✅ 切换文件夹，验证缩略图快速加载
7. ✅ 看到 ThumbnailsPanel 面板
8. ✅ 点击索引按钮
9. ✅ 验证进度显示
10. ✅ 测试视频缩略图（如有视频文件）

### 性能验证
- 首屏加载: <500ms
- 完整加载: <3s
- 内存占用: <200MB

---

## 集成完成清单

| 步骤 | 文件 | 状态 |
|------|------|------|
| 1 | lib.rs | ✅ |
| 2 | filesystem.ts | ✅ |
| 3 | SettingsPanel.svelte | ✅ |
| 4 | FileBrowser.svelte | ✅ |
| 5 | thumbnailManager.ts | 📝 |
| 6 | FileBrowser.svelte | 📝 |
| 7 | Cargo.toml | ✅ |
| 8 | 测试 | 📝 |

---

## 关键要点

✅ **已完成的工作**:
- 后端视频命令注册
- 前端 API 方法添加
- 设置 UI 集成
- ThumbnailsPanel 导入

📝 **需要完成的工作**:
- 在 thumbnailManager 中添加视频检测
- 在 FileBrowser 中应用设置
- 编译和测试

**预计时间**: 5-10 分钟完成所有步骤

---

**所有代码已准备就绪，按照上述步骤逐一应用即可完成集成。**
