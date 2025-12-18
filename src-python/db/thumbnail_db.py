"""
缩略图数据库
使用 SQLite 存储缩略图缓存
兼容 Rust/Tauri 版本的数据库结构
"""
import sqlite3
import time
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

# 默认数据库路径
# 优先使用环境变量，否则使用 D:\temp\neoview（与 Tauri 模式兼容）
def _get_default_db_path() -> Path:
    import os
    env_path = os.environ.get("NEOVIEW_THUMBNAIL_DB")
    if env_path:
        return Path(env_path)
    # Windows 默认路径（与 Tauri 模式兼容）
    if os.name == 'nt':
        return Path("D:/temp/neoview/thumbnails.db")
    # 其他系统使用 home 目录
    return Path.home() / ".neoview" / "thumbnails.db"

DEFAULT_DB_PATH = _get_default_db_path()


class ThumbnailDB:
    """
    缩略图数据库管理器
    兼容 Rust/Tauri 版本的表结构：
    - thumbs 表: key, size, date, ghash, value, category, ...
    - failed_thumbnails 表: path_key, error, failed_at
    """
    
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self):
        """初始化数据库表（兼容 Rust 版本）"""
        with self._get_conn() as conn:
            # 检查 thumbs 表是否存在（Rust 版本创建的）
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='thumbs'"
            )
            if not cursor.fetchone():
                # 如果不存在，创建兼容的表结构
                conn.executescript("""
                    PRAGMA journal_mode=WAL;
                    PRAGMA synchronous=NORMAL;
                    
                    CREATE TABLE IF NOT EXISTS thumbs (
                        key TEXT NOT NULL PRIMARY KEY,
                        size INTEGER,
                        date INTEGER,
                        ghash INTEGER,
                        value BLOB,
                        category TEXT DEFAULT 'file'
                    );
                    CREATE INDEX IF NOT EXISTS idx_thumbs_key ON thumbs(key);
                    CREATE INDEX IF NOT EXISTS idx_thumbs_category ON thumbs(category);
                    CREATE INDEX IF NOT EXISTS idx_thumbs_date ON thumbs(date);
                    
                    CREATE TABLE IF NOT EXISTS failed_thumbnails (
                        path_key TEXT PRIMARY KEY,
                        error TEXT,
                        failed_at INTEGER
                    );
                """)
    
    @contextmanager
    def _get_conn(self):
        """获取数据库连接"""
        conn = sqlite3.connect(str(self.db_path), timeout=30)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()
    
    def get_thumbnail(self, path_key: str) -> Optional[bytes]:
        """获取缓存的缩略图（兼容 Rust 表结构）"""
        with self._get_conn() as conn:
            # Rust 表结构: thumbs(key, size, date, ghash, value, category)
            cursor = conn.execute(
                "SELECT value FROM thumbs WHERE key = ?",
                (path_key,)
            )
            row = cursor.fetchone()
            if row:
                # 更新访问时间
                conn.execute(
                    "UPDATE thumbs SET date = ? WHERE key = ?",
                    (int(time.time()), path_key)
                )
                return row[0]
        return None
    
    def get_thumbnail_if_valid(
        self, 
        path_key: str, 
        file_size: int, 
        file_mtime: int
    ) -> Optional[bytes]:
        """获取缓存的缩略图（如果文件未修改）"""
        with self._get_conn() as conn:
            # Rust 表结构: size 是文件大小，date 是修改时间
            cursor = conn.execute(
                "SELECT value, size, date FROM thumbs WHERE key = ?",
                (path_key,)
            )
            row = cursor.fetchone()
            if row:
                cached_data, cached_size, cached_date = row
                # 检查文件是否修改（size 和 mtime 匹配）
                if cached_size == file_size and cached_date == file_mtime:
                    return cached_data
                # 如果只有 date 匹配也返回（兼容旧数据）
                if cached_date == file_mtime:
                    return cached_data
        return None
    
    def save_thumbnail(
        self,
        path_key: str,
        data: bytes,
        file_size: int,
        file_mtime: int,
        category: str = "file"
    ):
        """保存缩略图到缓存（兼容 Rust 表结构）"""
        with self._get_conn() as conn:
            # Rust 表结构: thumbs(key, size, date, ghash, value, category)
            conn.execute(
                """INSERT OR REPLACE INTO thumbs 
                   (key, size, date, ghash, value, category)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (path_key, file_size, file_mtime, 0, data, category)
            )
    
    def is_failed(self, path_key: str, max_age: int = 3600) -> bool:
        """检查是否为失败记录"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT failed_at FROM failed_thumbnails WHERE path_key = ?",
                (path_key,)
            )
            row = cursor.fetchone()
            if row:
                # 检查是否过期
                if time.time() - row[0] < max_age:
                    return True
                # 过期则删除
                conn.execute(
                    "DELETE FROM failed_thumbnails WHERE path_key = ?",
                    (path_key,)
                )
        return False
    
    def mark_failed(self, path_key: str, error: str):
        """标记为失败"""
        with self._get_conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO failed_thumbnails 
                   (path_key, error, failed_at) VALUES (?, ?, ?)""",
                (path_key, error, int(time.time()))
            )
    
    def clear_cache(self, category: Optional[str] = None):
        """清除缓存（兼容 Rust 表结构）"""
        with self._get_conn() as conn:
            if category:
                conn.execute(
                    "DELETE FROM thumbs WHERE category = ?",
                    (category,)
                )
            else:
                conn.execute("DELETE FROM thumbs")
                conn.execute("DELETE FROM failed_thumbnails")
    
    def get_stats(self) -> dict:
        """获取缓存统计（兼容 Rust 表结构）"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                """SELECT category, COUNT(*), SUM(LENGTH(value)) 
                   FROM thumbs GROUP BY category"""
            )
            stats = {}
            total_count = 0
            total_size = 0
            folder_count = 0
            for row in cursor:
                category, count, size = row
                stats[category] = {"count": count, "size": size or 0}
                total_count += count
                total_size += size or 0
                if category == "folder":
                    folder_count = count
            
            # 获取数据库文件大小
            db_size = self.db_path.stat().st_size if self.db_path.exists() else 0
            
            stats["total"] = total_count
            stats["folders"] = folder_count
            stats["size_bytes"] = db_size
            return stats
    
    def cleanup_old(self, max_age_days: int = 30, max_count: int = 10000):
        """清理旧缓存（兼容 Rust 表结构）"""
        cutoff = int(time.time()) - max_age_days * 86400
        with self._get_conn() as conn:
            # 删除过期的
            conn.execute(
                "DELETE FROM thumbs WHERE date < ?",
                (cutoff,)
            )
            
            # 如果还是太多，删除最旧的
            cursor = conn.execute("SELECT COUNT(*) FROM thumbs")
            count = cursor.fetchone()[0]
            if count > max_count:
                conn.execute(
                    """DELETE FROM thumbs WHERE key IN (
                        SELECT key FROM thumbs 
                        ORDER BY date ASC LIMIT ?
                    )""",
                    (count - max_count,)
                )
    
    def vacuum(self):
        """压缩数据库"""
        with self._get_conn() as conn:
            conn.execute("VACUUM")
    
    def clear_expired(self, expire_days: int = 30, exclude_folders: bool = True) -> int:
        """清除过期缩略图（兼容 Rust 表结构）"""
        cutoff = int(time.time()) - expire_days * 86400
        with self._get_conn() as conn:
            if exclude_folders:
                cursor = conn.execute(
                    "DELETE FROM thumbs WHERE date < ? AND category != 'folder'",
                    (cutoff,)
                )
            else:
                cursor = conn.execute(
                    "DELETE FROM thumbs WHERE date < ?",
                    (cutoff,)
                )
            return cursor.rowcount
    
    def clear_by_prefix(self, path_prefix: str) -> int:
        """按路径前缀清除缩略图（兼容 Rust 表结构）"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "DELETE FROM thumbs WHERE key LIKE ?",
                (f"{path_prefix}%",)
            )
            return cursor.rowcount


# 全局实例
_db: Optional[ThumbnailDB] = None


def get_thumbnail_db() -> ThumbnailDB:
    """获取全局数据库实例"""
    global _db
    if _db is None:
        _db = ThumbnailDB()
    return _db
