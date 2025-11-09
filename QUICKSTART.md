# 🚀 NeoView 快速开始指南

## 📋 前置要求

### 必需软件
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (最新稳定版)
- [Yarn](https://yarnpkg.com/) 包管理器

### Windows 特别要求
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) 
  - 勾选 "Desktop development with C++"

## 🎯 快速启动（3步）

### 1. 安装依赖
```bash
cd neoview-tauri
yarn install
```

### 2. 启动开发服务器
```bash
yarn tauri dev
```

### 3. 开始使用
- 应用会自动打开
- 点击 "Open Folder" 按钮选择包含图片的文件夹
- 使用键盘或工具栏按钮浏览图片

## ⌨️ 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `→` or `PageDown` | 下一页 |
| `←` or `PageUp` | 上一页 |
| `+` or `=` | 放大 |
| `-` or `_` | 缩小 |
| `0` | 重置缩放 |

## 🔧 常用命令

### 开发
```bash
# 启动开发服务器（热重载）
yarn tauri dev

# 检查代码
yarn check

# 格式化代码
yarn format

# Lint 检查
yarn lint
```

### 构建
```bash
# 构建生产版本
yarn tauri build

# 构建输出位置
# Windows: src-tauri/target/release/bundle/
```

## 📁 项目结构速览

```
neoview-tauri/
├── src/                    # 前端代码
│   ├── lib/
│   │   ├── api/           # Tauri API 封装
│   │   ├── components/    # Svelte 组件
│   │   ├── stores/        # 状态管理
│   │   └── types/         # TypeScript 类型
│   └── App.svelte         # 主应用
│
├── src-tauri/             # 后端代码
│   ├── src/
│   │   ├── commands/      # Tauri 命令
│   │   ├── core/          # 核心逻辑
│   │   └── models/        # 数据模型
│   └── Cargo.toml
│
└── package.json
```

## 🎨 添加 UI 组件

使用 shadcn-svelte CLI：

```bash
# 添加新组件
npx shadcn-svelte@next add <component-name>

# 例如：
npx shadcn-svelte@next add button
npx shadcn-svelte@next add card
npx shadcn-svelte@next add dialog
```

## 🐛 常见问题

### 编译错误：找不到 Rust
```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# 或访问 https://rustup.rs/
```

### Windows: MSVC 链接错误
需要安装 Visual Studio Build Tools 并选择 C++ 开发工具

### 端口占用
如果 1420 端口被占用，Vite 会自动选择其他端口

### Tauri 版本不匹配
```bash
# 清理并重新安装
yarn cache clean
rm -rf node_modules yarn.lock
yarn install
```

## 📖 学习资源

### 官方文档
- [Tauri 文档](https://tauri.app/)
- [Svelte 教程](https://learn.svelte.dev/)
- [Rust Book](https://doc.rust-lang.org/book/)

### 项目文档
- `NEOVIEW_README.md` - 完整文档
- `PROJECT_SUMMARY.md` - 项目总结
- `../ref/gen/` - 原项目分析文档

## 🤝 开发工作流

### 1. 创建新功能
```bash
# 创建新分支
git checkout -b feature/your-feature-name

# 开发...
yarn tauri dev

# 提交
git commit -m "Add: your feature description"
```

### 2. 添加 Rust 功能
1. 在 `src-tauri/src/core/` 添加逻辑
2. 在 `src-tauri/src/commands/` 添加命令
3. 在 `src-tauri/src/lib.rs` 注册命令
4. 在 `src/lib/api/` 添加前端封装

### 3. 添加 UI 组件
1. 在 `src/lib/components/` 创建 `.svelte` 文件
2. 使用 shadcn-svelte 组件
3. 通过 Store 管理状态
4. 在父组件中导入使用

## 🎯 下一步

### 立即可做
1. ✅ 浏览文件夹中的图片
2. ✅ 使用键盘翻页
3. ✅ 缩放图像

### 即将支持
1. ⏳ 压缩包（ZIP/RAR）
2. ⏳ PDF 文件
3. ⏳ 历史记录
4. ⏳ 书签功能

### 长期规划
查看 `PROJECT_SUMMARY.md` 了解完整路线图

## 💡 提示

- 使用 `F12` 打开浏览器开发工具
- Rust 日志会显示在终端
- 修改 Rust 代码会自动重新编译
- 修改 Svelte 代码会热重载

## 🆘 获取帮助

- 查看项目文档
- 搜索 Tauri/Svelte 官方文档
- 检查终端的错误信息

---

**准备好了吗？运行 `yarn tauri dev` 开始吧！** 🚀
