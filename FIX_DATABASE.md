# 数据库修复指南

## 问题
数据库表 `thumbnails` 的字段名不匹配，导致缩略图保存失败。

## 解决方案

### 方法 1: 删除旧数据库（推荐）

1. 关闭应用
2. 删除数据库文件：
   ```
   Windows: %APPDATA%\com.neoview.app\neoview.db
   或
   ~/.neoview/neoview.db
   ```
3. 重新启动应用，数据库会自动重建

### 方法 2: 手动修复（如果需要保留数据）

如果需要保留已有的缩略图数据，可以：

1. 备份数据库文件
2. 使用 SQLite 工具打开数据库
3. 检查表结构：
   ```sql
   PRAGMA table_info(thumbnails);
   ```
4. 如果字段名有拼写错误，重建表：
   ```sql
   ALTER TABLE thumbnails RENAME TO thumbnails_old;
   
   CREATE TABLE thumbnails (
       bookpath TEXT PRIMARY KEY,
       relative_thumb_path TEXT NOT NULL,
       thumbnail_name TEXT NOT NULL,
       hash TEXT NOT NULL,
       created_at TEXT NOT NULL,
       source_modified INTEGER NOT NULL,
       is_folder INTEGER NOT NULL,
       width INTEGER,
       height INTEGER,
       file_size INTEGER
   );
   
   INSERT INTO thumbnails 
   SELECT * FROM thumbnails_old;
   
   DROP TABLE thumbnails_old;
   ```

## 验证

重启应用后，检查日志是否还有数据库错误。如果没有错误，说明问题已解决。

## 预防

确保代码中的 SQL 查询字段名与表定义一致。
