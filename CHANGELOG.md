# NeoView Changelog

## [0.2.0-alpha] - 2025-11-09

### 🐛 Bug Fixes
- **修复 lucide-svelte 兼容性问题**
  - 移除不兼容的 `lucide-svelte` 包
  - 改用 `@lucide/svelte` (与 Svelte 5 兼容)
  - 更新所有组件的图标导入

### ✨ New Features

#### 🎹 完整快捷键系统
- **快捷键管理**
  - 新增 `keyboard.ts` 类型定义
  - 新增 `keyboard.svelte.ts` Store
  - 支持 40+ 默认快捷键绑定
  - 快捷键分类管理（导航、缩放、文件、视图、转换、书签）

- **快捷键功能**
  - 支持 Ctrl, Shift, Alt, Meta 组合键
  - 自动生成按键组合字符串
  - 命令查找和执行系统
  - 快捷键冲突检测

#### ⚙️ 设置系统
- **设置对话框** (`SettingsDialog.svelte`)
  - 多标签页界面（通用、查看器、快捷键、性能）
  - 响应式布局
  - 左侧导航 + 右侧内容

- **快捷键配置面板** (`KeyBindingPanel.svelte`)
  - 实时快捷键录制
  - 按分类显示所有快捷键
  - 搜索过滤功能
  - 一键重置为默认值
  - 可视化按键显示 (kbd 标签)

- **查看器设置面板** (`ViewerSettingsPanel.svelte`)
  - 背景颜色选择器
  - 显示网格开关
  - 平滑缩放开关
  - 默认缩放级别滑块

#### 🎨 UI 改进
- 标题栏添加设置按钮
- 集成设置对话框到主界面
- 优化按钮图标显示

### 🔧 Technical Improvements
- 统一的命令执行系统
- 可扩展的快捷键架构
- 类型安全的 Store 管理
- 更好的代码组织结构

### 📝 Default Shortcuts

#### 导航
- `→` / `PageDown` - 下一页
- `←` / `PageUp` - 上一页
- `Home` - 第一页
- `End` - 最后一页

#### 缩放
- `+` / `=` - 放大
- `-` / `_` - 缩小
- `0` - 重置缩放
- `w` - 适应宽度
- `h` - 适应高度
- `f` - 适应屏幕

#### 文件操作
- `Ctrl+O` - 打开文件
- `Ctrl+W` - 关闭书籍
- `F5` - 刷新

#### 视图
- `F11` - 全屏切换
- `Ctrl+B` - 侧边栏切换
- `Ctrl+/` - 状态栏切换

#### 转换
- `Ctrl+L` - 向左旋转
- `Ctrl+R` - 向右旋转
- `Ctrl+H` - 水平翻转
- `Ctrl+V` - 垂直翻转

#### 书签
- `Ctrl+D` - 添加/移除书签
- `Ctrl+Shift+D` - 显示书签

### 📊 Statistics
- **新增文件**: 6个
  - `keyboard.ts` - 类型定义
  - `keyboard.svelte.ts` - Store
  - `SettingsDialog.svelte` - 设置对话框
  - `KeyBindingPanel.svelte` - 快捷键面板
  - `ViewerSettingsPanel.svelte` - 查看器设置
  - `CHANGELOG.md` - 更新日志

- **修改文件**: 6个
  - `App.svelte` - 图标导入修复
  - `TitleBar.svelte` - 添加设置按钮
  - `ImageViewer.svelte` - 集成快捷键系统
  - `Sidebar.svelte` - 图标导入修复
  - `types/index.ts` - 导出 keyboard 类型
  - `stores/index.ts` - 导出 keyboard store

- **代码统计**:
  - 新增代码: ~500 行
  - 总代码: ~2500 行

---

## [0.1.0-alpha] - 2025-11-09

### 🎉 Initial Release
- 基础项目结构搭建
- Tauri 2 + Svelte 5 + Rust 架构
- 书籍管理系统
- 图像加载和显示
- 基础 UI 布局
- 状态管理系统

详见 `PROJECT_SUMMARY.md`
