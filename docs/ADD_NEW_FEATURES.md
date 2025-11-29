# 从 neoview-latest 添加新功能指南

本文档说明如何在保留 1.3 版本加载性能的基础上，从 `ref/neoview-latest` 添加与加载无关的新功能。

**前提**：当前分支已回退到 1.3 版本，保留了原有的加载性能。

---

## 新功能列表

从 `ref/neoview-latest` 添加以下新功能：

1. **文件夹面板重构**
2. **侧边栏自定义系统**
3. **信息面板相关设置**
4. **翻页翻书模板化提示**
5. **缩放模式的锁定和临时锁定**
6. **适应窗口模式**
7. **悬停滚动**

---

## 需要复制的文件

### 1. 文件夹面板重构

从 `ref/neoview-latest/src/lib/components/panels/folderPanel/` 复制整个目录到 `src/lib/components/panels/folderPanel/`

```powershell
Copy-Item "ref\neoview-latest\src\lib\components\panels\folderPanel" "src\lib\components\panels\folderPanel" -Recurse -Force
```

### 2. 侧边栏自定义系统

```powershell
Copy-Item "ref\neoview-latest\src\lib\components\settings\SidebarPanelManager.svelte" "src\lib\components\settings\SidebarPanelManager.svelte" -Force
Copy-Item "ref\neoview-latest\src\lib\stores\sidebarConfig.svelte.ts" "src\lib\stores\sidebarConfig.svelte.ts" -Force
```

### 3. 侧边栏组件

```powershell
Copy-Item "ref\neoview-latest\src\lib\components\layout\LeftSidebar.svelte" "src\lib\components\layout\LeftSidebar.svelte" -Force
```

### 4. 顶部工具栏（包含缩放锁定、适应窗口等）

```powershell
Copy-Item "ref\neoview-latest\src\lib\components\layout\TopToolbar.svelte" "src\lib\components\layout\TopToolbar.svelte" -Force
```

### 5. UI Store（悬停滚动、缩放锁定状态等）

```powershell
Copy-Item "ref\neoview-latest\src\lib\stores\ui.svelte.ts" "src\lib\stores\ui.svelte.ts" -Force
```

### 6. 设置相关

```powershell
Copy-Item "ref\neoview-latest\src\lib\settings\settingsManager.ts" "src\lib\settings\settingsManager.ts" -Force
Copy-Item "ref\neoview-latest\src\lib\settings\types.ts" "src\lib\settings\types.ts" -Force
```

### 7. 面板索引

```powershell
Copy-Item "ref\neoview-latest\src\lib\components\panels\index.ts" "src\lib\components\panels\index.ts" -Force
```

---

## 快速添加命令（一键执行）

```powershell
# 文件夹面板
Copy-Item "ref\neoview-latest\src\lib\components\panels\folderPanel" "src\lib\components\panels\folderPanel" -Recurse -Force

# 侧边栏系统
Copy-Item "ref\neoview-latest\src\lib\components\settings\SidebarPanelManager.svelte" "src\lib\components\settings\SidebarPanelManager.svelte" -Force
Copy-Item "ref\neoview-latest\src\lib\stores\sidebarConfig.svelte.ts" "src\lib\stores\sidebarConfig.svelte.ts" -Force
Copy-Item "ref\neoview-latest\src\lib\components\layout\LeftSidebar.svelte" "src\lib\components\layout\LeftSidebar.svelte" -Force

# 工具栏和 UI
Copy-Item "ref\neoview-latest\src\lib\components\layout\TopToolbar.svelte" "src\lib\components\layout\TopToolbar.svelte" -Force
Copy-Item "ref\neoview-latest\src\lib\stores\ui.svelte.ts" "src\lib\stores\ui.svelte.ts" -Force

# 设置
Copy-Item "ref\neoview-latest\src\lib\settings\settingsManager.ts" "src\lib\settings\settingsManager.ts" -Force
Copy-Item "ref\neoview-latest\src\lib\settings\types.ts" "src\lib\settings\types.ts" -Force

# 面板索引
Copy-Item "ref\neoview-latest\src\lib\components\panels\index.ts" "src\lib\components\panels\index.ts" -Force
```

---

## ⚠️ 不要复制的文件（会影响加载性能）

以下文件与图片加载相关，**不要从 latest 复制**：

- `src/lib/components/viewer/flow/imageLoader.ts`
- `src/lib/components/viewer/flow/preloadManager.svelte.ts`
- `src/lib/components/viewer/flow/preloadRuntime.ts`
- `src/lib/api/filesystem.ts`
- `src/lib/api/fs.ts`
- `src/lib/components/layout/BottomThumbnailBar.svelte`
- `src/lib/components/viewer/ImageViewer.svelte`
- `src/lib/stores/book.svelte.ts`
- `src/lib/stores/fileBrowser.svelte.ts`
- `src-tauri/src/commands/fs_commands.rs`
- `src-tauri/src/lib.rs`

---

## 验证

添加完成后运行：

```bash
yarn build
```

确保没有编译错误。如有缺失依赖，根据错误提示补充相关文件。
