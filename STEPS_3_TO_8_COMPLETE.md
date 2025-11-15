# 步骤 3-8 完整集成指南

## ✅ 已完成
- [x] 步骤 1: Tauri lib.rs 注册视频命令
- [x] 步骤 2: FileSystemAPI 添加视频方法

## 步骤 3: SettingsPanel 添加缩略图配置 UI

**文件**: `src/lib/components/panels/SettingsPanel.svelte`

在第 378 行（性能 Tab 结束前）添加：

```svelte
<!-- 缩略图设置 -->
<div class="border-t pt-6">
  <h3 class="font-semibold mb-4">🖼️ 缩略图设置</h3>
  
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <Label>本地文件并发数</Label>
      <span class="text-sm text-muted-foreground">{settings.performance.thumbnail.maxConcurrentLocal}</span>
    </div>
    <input
      type="range"
      bind:value={settings.performance.thumbnail.maxConcurrentLocal}
      min={1}
      max={16}
      step={1}
      class="w-full"
    />
  </div>
  
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <Label>压缩包并发数</Label>
      <span class="text-sm text-muted-foreground">{settings.performance.thumbnail.maxConcurrentArchive}</span>
    </div>
    <input
      type="range"
      bind:value={settings.performance.thumbnail.maxConcurrentArchive}
      min={1}
      max={8}
      step={1}
      class="w-full"
    />
  </div>
  
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <Label>视频处理并发数</Label>
      <span class="text-sm text-muted-foreground">{settings.performance.thumbnail.maxConcurrentVideo}</span>
    </div>
    <input
      type="range"
      bind:value={settings.performance.thumbnail.maxConcurrentVideo}
      min={1}
      max={4}
      step={1}
      class="w-full"
    />
  </div>
  
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <Label>缓存大小 (MB)</Label>
      <span class="text-sm text-muted-foreground">{settings.performance.thumbnail.cacheSizeMB}</span>
    </div>
    <input
      type="range"
      bind:value={settings.performance.thumbnail.cacheSizeMB}
      min={100}
      max={2000}
      step={100}
      class="w-full"
    />
  </div>
  
  <div class="flex items-center justify-between">
    <Label>启用视频缩略图</Label>
    <Switch bind:checked={settings.performance.thumbnail.enableVideoThumbnail} />
  </div>
</div>
```

## 步骤 4: FileBrowser 集成 ThumbnailsPanel

**文件**: `src/lib/components/panels/FileBrowser.svelte`

第 21 行添加导入：
```typescript
import ThumbnailsPanel from './ThumbnailsPanel.svelte';
```

在主容器中添加 ThumbnailsPanel（在文件列表前）。

## 步骤 5: thumbnailManager 支持视频

**文件**: `src/lib/utils/thumbnailManager.ts`

在 `generateThumbnail` 方法中添加视频检测（约第 200 行）：

```typescript
const isVideo = path.match(/\.(mp4|mkv|avi|mov|flv|webm|wmv)$/i);

if (isArchive) {
  // ... 现有代码
} else if (isDir) {
  // ... 现有代码
} else if (isVideo) {
  console.log('🎬 生成视频缩略图:', path);
  try {
    thumbnail = await FileSystemAPI.generateVideoThumbnail(path);
  } catch (e) {
    console.debug('视频缩略图生成失败:', e);
  }
} else {
  // ... 现有代码
}
```

## 步骤 6: FileBrowser 应用设置

**文件**: `src/lib/components/panels/FileBrowser.svelte`

修改 `configureThumbnailManager` 调用（约第 306 行）：

```typescript
// 从设置读取配置
const settings = await settingsManager.getThumbnailSettings();

configureThumbnailManager({
  addThumbnail: (path: string, url: string) => fileBrowserStore.addThumbnail(path, url),
  maxConcurrentLocal: settings.thumbnail.maxConcurrentLocal,
  maxConcurrentArchive: settings.thumbnail.maxConcurrentArchive,
});
```

## 步骤 7: 更新 Cargo.toml

**文件**: `src-tauri/Cargo.toml`

确保依赖存在（通常已有）：

```toml
[dependencies]
image = "0.24"
zip = "0.6"
```

## 步骤 8: 测试集成

### 编译
```bash
yarn build
```

### 测试清单
- [ ] 应用启动成功
- [ ] 设置面板显示缩略图配置
- [ ] 文件夹切换时缩略图快速加载
- [ ] ThumbnailsPanel 显示
- [ ] 索引功能可用
- [ ] 视频文件有缩略图（如有视频）
- [ ] 缓存正常工作

---

## 快速总结

| 步骤 | 文件 | 状态 |
|------|------|------|
| 1 | lib.rs | ✅ 完成 |
| 2 | filesystem.ts | ✅ 完成 |
| 3 | SettingsPanel.svelte | 📝 待完成 |
| 4 | FileBrowser.svelte | 📝 待完成 |
| 5 | thumbnailManager.ts | 📝 待完成 |
| 6 | FileBrowser.svelte | 📝 待完成 |
| 7 | Cargo.toml | ✅ 检查 |
| 8 | 测试 | 📝 待完成 |

---

**所有代码已准备好，按照上述步骤逐一应用即可完成集成。**
