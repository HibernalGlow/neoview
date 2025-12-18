"""
缩略图数据库
使用 SQLite 存储缩略图缓存
"""
import sqlite3
import time
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

# 默认数据库路径
DEFAULT_DB_PATH = Path.home() / ".neoview" / "thumbnails.db"


class ThumbnailDB:
    """缩略图数据库管理器"""
    
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self):
        """初始化数据库表"""
        with self._get_conn() as conn:
            conn.executescript("""
                -- 启用 WAL 模式提高并发性能
                PRAGMA journal_mode=WAL;
                PRAGMA synchronous=NORMAL;
                
                -- 缩略图缓存表
                CREATE TABLE IF NOT EXISTS thumbnails (
                    path_key TEXT PRIMARY KEY,
                    file_size INTEGER,
                    file_mtime INTEGER,
                    data BLOB,
                    created_at INTEGER,
                    accessed_at INTEGER,
                    category TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_accessed_at ON thumbnails(accessed_at);
                CREATE INDEX IF NOT EXISTS idx_category ON thumbnails(category);
                
                -- 目录快照缓存表
                CREATE TABLE IF NOT EXISTS directory_snapshots (
                    path TEXT PRIMARY KEY,
                    mtime INTEGER,
                    items_json TEXT,
                    created_at INTEGER
                );
                
                -- 失败记录表（避免重复尝试）
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
        """获取缓存的缩略图"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT data FROM thumbnails WHERE path_key = ?",
                (path_key,)
            )
            row = cursor.fetchone()
            if row:
                # 更新访问时间
                conn.execute(
                    "UPDATE thumbnails SET accessed_at = ? WHERE path_key = ?",
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
            cursor = conn.execute(
                """SELECT data, file_size, file_mtime FROM thumbnails 
                   WHERE path_key = ?""",
                (path_key,)
            )
            row = cursor.fetchone()
            if row:
                cached_data, cached_size, cached_mtime = row
                # 检查文件是否修改
                if cached_size == file_size and cached_mtime == file_mtime:
                    # 更新访问时间
                    conn.execute(
                        "UPDATE thumbnails SET accessed_at = ? WHERE path_key = ?",
                        (int(time.time()), path_key)
                    )
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
        """保存缩略图到缓存"""
        now = int(time.time())
        with self._get_conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO thumbnails 
                   (path_key, file_size, file_mtime, data, created_at, accessed_at, category)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (path_key, file_size, file_mtime, data, now, now, category)
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
        """清除缓存"""
        with self._get_conn() as conn:
            if category:
                conn.execute(
                    "DELETE FROM thumbnails WHERE category = ?",
                    (category,)
                )
            else:
                conn.execute("DELETE FROM thumbnails")
                conn.execute("DELETE FROM failed_thumbnails")
    
    def get_stats(self) -> dict:
        """获取缓存统计"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                """SELECT category, COUNT(*), SUM(LENGTH(data)) 
                   FROM thumbnails GROUP BY category"""
            )
            stats = {}
            total_count = 0
            total_size = 0
            for row in cursor:
                category, count, size = row
                stats[category] = {"count": count, "size": size or 0}
                total_count += count
                total_size += size or 0
            
            stats["total"] = {"count": total_count, "size": total_size}
            return stats
    
    def cleanup_old(self, max_age_days: int = 30, max_count: int = 10000):
        """清理旧缓存"""
        cutoff = int(time.time()) - max_age_days * 86400
        with self._get_conn() as conn:
            # 删除过期的
            conn.execute(
                "DELETE FROM thumbnails WHERE accessed_at < ?",
                (cutoff,)
            )
            
            # 如果还是太多，删除最旧的
            cursor = conn.execute("SELECT COUNT(*) FROM thumbnails")
            count = cursor.fetchone()[0]
            if count > max_count:
                conn.execute(
                    """DELETE FROM thumbnails WHERE path_key IN (
                        SELECT path_key FROM thumbnails 
                        ORDER BY accessed_at ASC LIMIT ?
                    )""",
                    (count - max_count,)
                )


# 全局实例
_db: Optional[ThumbnailDB] = None


def get_thumbnail_db() -> ThumbnailDB:
    """获取全局数据库实例"""
    global _db
    if _db is None:
        _db = ThumbnailDB()
    return _db
