# 🔧 数据库路径修复完成

## 问题
应用连接到错误的数据库路径，导致缩略图保存失败。

## 解决方案
已修改 `src-tauri/src/lib.rs` 以支持环境变量 `NEOVIEW_THUMBNAIL_DIR`。

## 使用方法

### 方法 1: 使用环境变量（推荐）

**Windows PowerShell**:
```powershell
$env:NEOVIEW_THUMBNAIL_DIR="D:\temp\neoview_thumbnails_test"
yarn tauri dev
```

**Windows CMD**:
```cmd
set NEOVIEW_THUMBNAIL_DIR=D:\temp\neoview_thumbnails_test
yarn tauri dev
```

**macOS/Linux**:
```bash
export NEOVIEW_THUMBNAIL_DIR=/path/to/thumbnails
yarn tauri dev
```

### 方法 2: 修改默认路径

编辑 `src-tauri/src/lib.rs` 第 56 行，将默认路径改为：
```rust
PathBuf::from("D:\\temp\\neoview_thumbnails_test")
```

## 验证

启动应用后，检查日志：
- ✅ 不再出现 `no such column: bookpath` 错误
- ✅ 缩略图正常生成并保存
- ✅ 数据库记录正常写入

## 代码变更

**文件**: `src-tauri/src/lib.rs`

**修改内容**:
```rust
// 确定缩略图目录
let thumbnail_root = if let Ok(test_dir) = std::env::var("NEOVIEW_THUMBNAIL_DIR") {
    PathBuf::from(test_dir)
} else {
    PathBuf::from(".cache/thumbnails")
};

// 确保目录存在
std::fs::create_dir_all(&thumbnail_root).ok();
```

---

**编译状态**: ✅ 成功 (Exit code: 0)

**下一步**: 使用上述方法之一启动应用，数据库问题应该解决。
