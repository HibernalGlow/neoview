# 🔧 快速修复 - 数据库错误

## 问题
数据库表结构错误：`table thumbnails has no column named bookpath`

## 原因
旧数据库文件中的表结构不正确，需要重建。

## 解决方案

### 步骤 1: 关闭应用
确保应用完全关闭。

### 步骤 2: 删除旧数据库

**Windows 用户**:
```powershell
# 打开 PowerShell，运行：
Remove-Item "$env:APPDATA\com.neoview.app\neoview.db" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\com.neoview.app\neoview.db-shm" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\com.neoview.app\neoview.db-wal" -Force -ErrorAction SilentlyContinue
```

**macOS/Linux 用户**:
```bash
rm -f ~/.neoview/neoview.db*
```

### 步骤 3: 重新启动应用

```bash
yarn tauri dev
```

应用会自动重建数据库表，使用正确的字段名。

## 验证

启动应用后，检查日志是否还有 `no such column: bookpath` 错误。

如果没有错误，说明问题已解决。

---

**预期结果**: 
- ✅ 缩略图正常生成
- ✅ 数据库正常保存
- ✅ 不再有字段名错误
