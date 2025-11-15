# 缩略图系统 4 阶段集成指南

## 📋 快速集成清单

### ✅ 已完成的实现
- [x] 文件夹切换优先级修复
- [x] 设置类型定义 (ThumbnailSettings)
- [x] 缩略图 Store (thumbnail.svelte.ts)
- [x] 缩略图管理面板 (ThumbnailPanel.svelte)
- [x] 视频处理核心 (video_thumbnail.rs)
- [x] 视频命令模块 (video_commands.rs)

### 🔧 需要集成的步骤

## 步骤 1: 在 Tauri lib.rs 中注册视频命令

**文件**: `src-tauri/src/lib.rs`

```rust
// 在 mod 声明中添加
pub mod core {
    pub mod video_thumbnail;  // 新增
    // ... 其他模块
}

pub mod commands {
    pub mod video_commands;   // 新增
    // ... 其他命令
}

// 在 invoke_handler 中注册
.invoke_handler(tauri::generate_handler![
    // ... 现有命令
    video_commands::check_ffmpeg_available,
    video_commands::generate_video_thumbnail,
    video_commands::get_video_duration,
    video_commands::is_video_file,
])
```

## 步骤 2: 在 FileSystemAPI 中添加方法

**文件**: `src/lib/api/index.ts` 或 `src/lib/api/filesystem.ts`

```typescript
// 添加视频相关方法
export const FileSystemAPI = {
  // ... 现有方法
  
  // 视频支持
  async generateVideoThumbnail(videoPath: string, timeSeconds?: number): Promise<string> {
    return invoke('generate_video_thumbnail', {
      videoPath,
      timeSeconds
    });
  },
  
  async getVideoDuration(videoPath: string): Promise<number> {
    return invoke('get_video_duration', {
      videoPath
    });
  },
  
  async isVideoFile(filePath: string): Promise<boolean> {
    return invoke('is_video_file', {
      filePath
    });
  },
  
  async checkFFmpegAvailable(): Promise<boolean> {
    return invoke('check_ffmpeg_available');
  }
};
```

## 步骤 3: 在 SettingsPanel 中添加缩略图配置

**文件**: `src/lib/components/panels/SettingsPanel.svelte`

在性能 Tab 中添加:

```svelte
<!-- 性能设置 -->
<TabsContent value="performance" class="p-4 space-y-6">
  <!-- ... 现有配置 ... -->
  
  <!-- 缩略图设置 -->
  <div class="border-t pt-6">
    <h3 class="font-semibold mb-4">🖼️ 缩略图设置</h3>
    
    <!-- 本地文件并发 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label>本地文件并发数</Label>
        <span class="text-sm text-muted-foreground">{settings.thumbnail.maxConcurrentLocal}</span>
      </div>
      <input
        type="range"
        bind:value={settings.thumbnail.maxConcurrentLocal}
        min={1}
        max={16}
        step={1}
        class="w-full"
      />
    </div>
    
    <!-- 压缩包并发 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label>压缩包并发数</Label>
        <span class="text-sm text-muted-foreground">{settings.thumbnail.maxConcurrentArchive}</span>
      </div>
      <input
        type="range"
        bind:value={settings.thumbnail.maxConcurrentArchive}
        min={1}
        max={8}
        step={1}
        class="w-full"
      />
    </div>
    
    <!-- 视频并发 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label>视频处理并发数</Label>
        <span class="text-sm text-muted-foreground">{settings.thumbnail.maxConcurrentVideo}</span>
      </div>
      <input
        type="range"
        bind:value={settings.thumbnail.maxConcurrentVideo}
        min={1}
        max={4}
        step={1}
        class="w-full"
      />
    </div>
    
    <!-- 缓存大小 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label>缓存大小 (MB)</Label>
        <span class="text-sm text-muted-foreground">{settings.thumbnail.cacheSizeMB}</span>
      </div>
      <input
        type="range"
        bind:value={settings.thumbnail.cacheSizeMB}
        min={100}
        max={2000}
        step={100}
        class="w-full"
      />
    </div>
    
    <!-- 缩略图尺寸 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label>缩略图尺寸 (px)</Label>
        <span class="text-sm text-muted-foreground">{settings.thumbnail.thumbnailSize}</span>
      </div>
      <input
        type="range"
        bind:value={settings.thumbnail.thumbnailSize}
        min={128}
        max={512}
        step={64}
        class="w-full"
      />
    </div>
    
    <!-- 启用视频缩略图 -->
    <div class="flex items-center justify-between">
      <Label>启用视频缩略图</Label>
      <Switch bind:checked={settings.thumbnail.enableVideoThumbnail} />
    </div>
    
    <!-- 视频截图时间 -->
    {#if settings.thumbnail.enableVideoThumbnail}
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>视频截图时间 (秒)</Label>
          <span class="text-sm text-muted-foreground">{settings.thumbnail.videoFrameTime}</span>
        </div>
        <input
          type="range"
          bind:value={settings.thumbnail.videoFrameTime}
          min={0}
          max={60}
          step={1}
          class="w-full"
        />
      </div>
    {/if}
    
    <!-- 启动时自动索引 -->
    <div class="flex items-center justify-between">
      <Label>启动时自动索引</Label>
      <Switch bind:checked={settings.thumbnail.autoIndexOnStartup} />
    </div>
  </div>
</TabsContent>
```

## 步骤 4: 在 FileBrowser 中集成 ThumbnailPanel

**文件**: `src/lib/components/panels/FileBrowser.svelte`

在左侧边栏中添加缩略图面板标签:

```svelte
<script>
  import ThumbnailPanel from './ThumbnailPanel.svelte';
  // ... 其他导入
</script>

<!-- 在标签列表中添加 -->
<Tabs>
  <TabsList>
    <TabsTrigger value="files">📁 文件</TabsTrigger>
    <TabsTrigger value="bookmarks">⭐ 书签</TabsTrigger>
    <TabsTrigger value="thumbnails">🖼️ 缩略图</TabsTrigger>
  </TabsList>
  
  <!-- 文件浏览 -->
  <TabsContent value="files">
    <!-- ... 现有内容 ... -->
  </TabsContent>
  
  <!-- 书签 -->
  <TabsContent value="bookmarks">
    <!-- ... 现有内容 ... -->
  </TabsContent>
  
  <!-- 缩略图管理 -->
  <TabsContent value="thumbnails">
    <ThumbnailPanel />
  </TabsContent>
</Tabs>
```

## 步骤 5: 在 thumbnailManager.ts 中支持视频

**文件**: `src/lib/utils/thumbnailManager.ts`

在 `generateThumbnail` 方法中添加视频支持:

```typescript
private async generateThumbnail(task: QueueTask) {
  const { item, source, epoch } = task;
  const path = item.path;

  // ... 现有代码 ...

  try {
    let thumbnail: string | null = null;
    const isArchive = this.isArchiveTask(task);
    const isDir = itemIsDirectory(item);
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

    // ... 现有代码 ...
  } catch (e) {
    console.error('❌ 缩略图生成失败:', path, e);
  }
}
```

## 步骤 6: 在 FileBrowser 中应用设置

**文件**: `src/lib/components/panels/FileBrowser.svelte`

修改 `configureThumbnailManager` 调用:

```typescript
// 从设置读取配置
const settings = await settingsManager.getThumbnailSettings();

configureThumbnailManager({
  addThumbnail: (path: string, url: string) => fileBrowserStore.addThumbnail(path, url),
  maxConcurrentLocal: settings.thumbnail.maxConcurrentLocal,
  maxConcurrentArchive: settings.thumbnail.maxConcurrentArchive,
  // 注意: maxConcurrentVideo 由后端处理
});
```

## 步骤 7: 更新 Cargo.toml (如需要)

**文件**: `src-tauri/Cargo.toml`

确保已有依赖:

```toml
[dependencies]
image = "0.24"
zip = "0.6"
# FFmpeg 通过系统命令调用，无需额外依赖
```

## 步骤 8: 测试集成

### 编译测试
```bash
yarn build
```

### 功能测试
1. ✅ 打开应用，进入设置 → 性能 Tab
2. ✅ 调整缩略图配置，验证保存
3. ✅ 打开文件浏览器，切换文件夹
4. ✅ 验证当前文件夹缩略图快速加载
5. ✅ 打开缩略图管理面板
6. ✅ 点击"选择文件夹索引"
7. ✅ 验证进度显示和统计信息
8. ✅ 测试暂停/恢复功能
9. ✅ 测试视频缩略图生成 (如有视频文件)

### 性能测试
1. 📊 打开包含 100+ 文件的文件夹
2. 📊 观察首屏加载时间
3. 📊 监控内存占用
4. 📊 检查 CPU 使用率

---

## 🔍 故障排除

### FFmpeg 不可用
```
错误: FFmpeg 不可用，请安装 FFmpeg
解决: 
1. Windows: 从 ffmpeg.org 下载
2. Mac: brew install ffmpeg
3. Linux: apt-get install ffmpeg
```

### 视频缩略图生成失败
```
错误: 提取视频帧失败
解决:
1. 检查 FFmpeg 是否正确安装
2. 检查视频文件是否完整
3. 查看日志获取详细错误信息
```

### 缓存不一致
```
错误: 缓存显示但文件不存在
解决:
1. 清空缓存: 点击"清空缓存"按钮
2. 重新索引文件夹
```

---

## 📊 集成检查清单

- [ ] 步骤 1: Tauri lib.rs 注册命令
- [ ] 步骤 2: FileSystemAPI 添加方法
- [ ] 步骤 3: SettingsPanel 添加 UI
- [ ] 步骤 4: FileBrowser 集成面板
- [ ] 步骤 5: thumbnailManager 支持视频
- [ ] 步骤 6: FileBrowser 应用设置
- [ ] 步骤 7: Cargo.toml 依赖检查
- [ ] 步骤 8: 测试集成

---

## 🎉 完成标志

当以下条件都满足时，集成完成:

✅ 应用编译成功  
✅ 设置面板显示缩略图配置  
✅ 缩略图管理面板可用  
✅ 文件夹切换时缩略图快速加载  
✅ 索引功能正常工作  
✅ 视频缩略图生成成功  
✅ 缓存管理正常  

---

**版本**: 1.0  
**最后更新**: 2024-11-15  
**状态**: 准备集成
