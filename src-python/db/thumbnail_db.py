"""
缩略图数据库
使用 SQLite 存储缩略图缓存
完全兼容 Rust/Tauri 版本的数据库结构

Rust 表结构:
- thumbs: key, size, date, ghash, category, value, emm_json, rating_data, ai_translation, manual_tags
- failed_thumbnails: key, reason, retry_count, last_attempt, error_message
- metadata: key, value (存储版本号等)
"""
import sqlite3
import time
import json
from pathlib import Path
from typing import Optional, Dict, List, Tuple, Any
from contextlib import contextmanager
from datetime import datetime


def _get_default_db_path() -> Path:
    """获取默认数据库路径（与 Rust/Tauri 兼容）"""
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
DB_VERSION = "2.4"


class ThumbnailDB:
    """
    缩略图数据库管理器
    完全兼容 Rust/Tauri 版本的表结构
    """
    
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn: Optional[sqlite3.Connection] = None
    
    @contextmanager
    def _get_conn(self):
        """获取数据库连接"""
        if self._conn is None:
            self._conn = sqlite3.connect(str(self.db_path), timeout=30)
            # 设置 PRAGMA
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
        try:
            yield self._conn
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise
    
    def _current_timestamp(self) -> str:
        """获取当前时间戳字符串（与 Rust 格式兼容）"""
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ==================== 缩略图基本操作 ====================
    
    def get_thumbnail(self, key: str) -> Optional[bytes]:
        """获取缓存的缩略图"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT value FROM thumbs WHERE key = ? AND value IS NOT NULL",
                (key,)
            )
            row = cursor.fetchone()
            if row:
                return row[0]
        return None

    def get_thumbnail_by_key_and_category(self, key: str, category: str) -> Optional[bytes]:
        """根据 key 和 category 获取缩略图（推荐方式）"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT value FROM thumbs WHERE key = ? AND category = ? AND value IS NOT NULL LIMIT 1",
                (key, category)
            )
            row = cursor.fetchone()
            return row[0] if row else None
    
    def get_thumbnail_if_valid(
        self, 
        key: str, 
        file_size: int, 
        file_mtime: int
    ) -> Optional[bytes]:
        """获取缓存的缩略图（检查文件是否修改）"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT value, size FROM thumbs WHERE key = ? AND value IS NOT NULL",
                (key,)
            )
            row = cursor.fetchone()
            if row:
                cached_data, cached_size = row
                # 如果 size 匹配，返回缓存
                if cached_size == file_size:
                    return cached_data
                # 兼容旧数据：如果有数据就返回
                if cached_data:
                    return cached_data
        return None
    
    def save_thumbnail(
        self,
        key: str,
        size: int,
        ghash: int,
        data: bytes,
        category: Optional[str] = None
    ):
        """保存缩略图到缓存"""
        date = self._current_timestamp()
        # 自动判断类别
        cat = category or ("folder" if "::" not in key and "." not in key else "file")
        
        with self._get_conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO thumbs (key, size, date, ghash, category, value)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (key, size, date, ghash, cat, data)
            )
    
    def save_thumbnails_batch(self, items: List[Tuple[str, int, int, bytes]]) -> int:
        """批量保存缩略图"""
        if not items:
            return 0
        
        date = self._current_timestamp()
        saved = 0
        
        with self._get_conn() as conn:
            for key, size, ghash, data in items:
                cat = "folder" if "::" not in key and "." not in key else "file"
                try:
                    conn.execute(
                        """INSERT OR REPLACE INTO thumbs (key, size, date, ghash, category, value)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (key, size, date, ghash, cat, data)
                    )
                    saved += 1
                except Exception:
                    pass
        
        return saved
    
    def has_thumbnail(self, key: str, category: Optional[str] = None) -> bool:
        """检查缩略图是否存在"""
        cat = category or ("folder" if "::" not in key and "." not in key else "file")
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT 1 FROM thumbs WHERE key = ? AND category = ? LIMIT 1",
                (key, cat)
            )
            return cursor.fetchone() is not None
    
    def delete_thumbnail(self, key: str):
        """删除缩略图"""
        with self._get_conn() as conn:
            conn.execute("DELETE FROM thumbs WHERE key = ?", (key,))

    # ==================== 失败记录操作 ====================
    
    def is_failed(self, key: str, max_age: int = 3600) -> bool:
        """检查是否为失败记录"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT last_attempt, retry_count FROM failed_thumbnails WHERE key = ?",
                (key,)
            )
            row = cursor.fetchone()
            if row:
                last_attempt, retry_count = row
                # 重试次数超过 3 次，认为是永久失败
                if retry_count and retry_count >= 3:
                    return True
                # 检查是否过期
                if last_attempt:
                    try:
                        attempt_time = datetime.fromisoformat(last_attempt.replace('Z', '+00:00').replace(' ', 'T'))
                        if (datetime.now() - attempt_time.replace(tzinfo=None)).total_seconds() < max_age:
                            return True
                    except:
                        pass
                # 过期则删除
                conn.execute("DELETE FROM failed_thumbnails WHERE key = ?", (key,))
        return False
    
    def mark_failed(self, key: str, error: str, reason: str = "generation_failed"):
        """标记为失败"""
        timestamp = self._current_timestamp()
        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO failed_thumbnails (key, reason, retry_count, last_attempt, error_message)
                   VALUES (?, ?, 1, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET 
                   retry_count = retry_count + 1,
                   last_attempt = excluded.last_attempt,
                   error_message = excluded.error_message""",
                (key, reason, timestamp, error)
            )
    
    def remove_failed(self, key: str):
        """删除失败记录"""
        with self._get_conn() as conn:
            conn.execute("DELETE FROM failed_thumbnails WHERE key = ?", (key,))

    def batch_check_failed(self, keys: List[str]) -> Dict[str, Tuple[str, int]]:
        """批量检查失败记录"""
        if not keys:
            return {}
        
        results = {}
        with self._get_conn() as conn:
            placeholders = ",".join(["?" for _ in keys])
            cursor = conn.execute(
                f"SELECT key, reason, retry_count FROM failed_thumbnails WHERE key IN ({placeholders})",
                keys
            )
            for row in cursor.fetchall():
                results[row[0]] = (row[1], row[2])
        return results

    def cleanup_old_failures(self, days: int = 7) -> int:
        """清理过期的失败记录"""
        from datetime import timedelta
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        with self._get_conn() as conn:
            cursor = conn.execute(
                "DELETE FROM failed_thumbnails WHERE last_attempt < ?",
                (cutoff,)
            )
            return cursor.rowcount

    # ==================== EMM JSON 缓存方法 ====================

    def save_emm_json(self, key: str, emm_json: str):
        """保存 EMM JSON 缓存"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE thumbs SET emm_json = ? WHERE key = ?",
                (emm_json, key)
            )

    def batch_save_emm_json(self, entries: List[Tuple[str, str]]) -> int:
        """批量保存 EMM JSON 缓存"""
        count = 0
        with self._get_conn() as conn:
            for key, emm_json in entries:
                cursor = conn.execute(
                    "UPDATE thumbs SET emm_json = ? WHERE key = ?",
                    (emm_json, key)
                )
                count += cursor.rowcount
        return count

    def get_emm_json(self, key: str) -> Optional[str]:
        """获取 EMM JSON 缓存"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT emm_json FROM thumbs WHERE key = ?",
                (key,)
            )
            row = cursor.fetchone()
            return row[0] if row and row[0] else None

    def batch_get_emm_json(self, keys: List[str]) -> Dict[str, str]:
        """批量获取 EMM JSON 缓存"""
        if not keys:
            return {}
        
        results = {}
        with self._get_conn() as conn:
            placeholders = ",".join(["?" for _ in keys])
            cursor = conn.execute(
                f"SELECT key, emm_json FROM thumbs WHERE key IN ({placeholders}) AND emm_json IS NOT NULL",
                keys
            )
            for row in cursor.fetchall():
                results[row[0]] = row[1]
        return results

    def upsert_with_emm_json(self, key: str, category: str, emm_json: Optional[str] = None):
        """插入或更新缩略图记录（包含 emm_json）"""
        date = self._current_timestamp()
        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO thumbs (key, category, date, emm_json) VALUES (?, ?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET emm_json = excluded.emm_json, date = excluded.date""",
                (key, category, date, emm_json)
            )

    def get_all_thumbnail_keys(self) -> List[str]:
        """获取所有有缩略图的路径键列表"""
        with self._get_conn() as conn:
            cursor = conn.execute("SELECT key FROM thumbs")
            return [row[0] for row in cursor.fetchall()]

    def get_folder_keys(self) -> List[str]:
        """获取所有文件夹类别的缩略图键"""
        with self._get_conn() as conn:
            cursor = conn.execute("SELECT key FROM thumbs WHERE category = 'folder'")
            return [row[0] for row in cursor.fetchall()]

    def get_keys_without_emm_json(self) -> List[str]:
        """获取 emm_json 为空的缩略图键列表"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT key FROM thumbs WHERE emm_json IS NULL OR emm_json = ''"
            )
            return [row[0] for row in cursor.fetchall()]

    def get_thumbnail_keys_by_prefix(self, prefix: str) -> List[str]:
        """获取指定目录下的所有缩略图键"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT key FROM thumbs WHERE key LIKE ?",
                (f"{prefix}%",)
            )
            return [row[0] for row in cursor.fetchall()]

    # ==================== Rating 读写方法 ====================

    def update_rating_data(self, key: str, rating_data: Optional[str]):
        """更新单个记录的 rating_data（JSON 格式）"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE thumbs SET rating_data = ? WHERE key = ?",
                (rating_data, key)
            )

    def get_rating_data(self, key: str) -> Optional[str]:
        """获取单个记录的 rating_data"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT rating_data FROM thumbs WHERE key = ?",
                (key,)
            )
            row = cursor.fetchone()
            return row[0] if row else None

    def batch_get_rating_data(self, keys: List[str]) -> Dict[str, Optional[str]]:
        """批量获取 rating_data（用于排序）"""
        if not keys:
            return {}
        
        results = {}
        now = int(datetime.now().timestamp() * 1000)
        
        with self._get_conn() as conn:
            placeholders = ",".join(["?" for _ in keys])
            cursor = conn.execute(
                f"SELECT key, rating_data, emm_json FROM thumbs WHERE key IN ({placeholders})",
                keys
            )
            for row in cursor.fetchall():
                key, rating_data, emm_json = row
                # 优先使用 rating_data，如果为空则从 emm_json 中提取
                if rating_data:
                    results[key] = rating_data
                elif emm_json:
                    try:
                        data = json.loads(emm_json)
                        rating = data.get("rating")
                        if rating and rating > 0:
                            results[key] = json.dumps({
                                "value": rating,
                                "source": "emm",
                                "timestamp": now
                            })
                        else:
                            results[key] = None
                    except:
                        results[key] = None
                else:
                    results[key] = None
        return results

    def get_rating_data_by_prefix(self, prefix: str) -> List[Tuple[str, Optional[str]]]:
        """获取指定目录下所有条目的 rating_data"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT key, rating_data FROM thumbs WHERE key LIKE ? AND rating_data IS NOT NULL",
                (f"{prefix}%",)
            )
            return [(row[0], row[1]) for row in cursor.fetchall()]

    def save_emm_with_rating_data(self, key: str, emm_json: str, rating_data: Optional[str] = None):
        """同时保存 emm_json 和 rating_data"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE thumbs SET emm_json = ?, rating_data = ? WHERE key = ?",
                (emm_json, rating_data, key)
            )

    def batch_save_emm_with_rating_data(self, entries: List[Tuple[str, str, Optional[str]]]) -> int:
        """批量保存 emm_json 和 rating_data（使用 UPSERT）"""
        count = 0
        with self._get_conn() as conn:
            for key, emm_json, rating_data in entries:
                cursor = conn.execute(
                    """INSERT INTO thumbs (key, emm_json, rating_data, category) VALUES (?, ?, ?, 'file')
                       ON CONFLICT(key) DO UPDATE SET emm_json = excluded.emm_json, rating_data = excluded.rating_data""",
                    (key, emm_json, rating_data)
                )
                count += cursor.rowcount
        return count

    # ==================== Manual Tags 读写方法 ====================

    def update_manual_tags(self, key: str, manual_tags: Optional[str]):
        """更新单个记录的 manual_tags（JSON 格式）"""
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE thumbs SET manual_tags = ? WHERE key = ?",
                (manual_tags, key)
            )

    def get_manual_tags(self, key: str) -> Optional[str]:
        """获取单个记录的 manual_tags"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT manual_tags FROM thumbs WHERE key = ?",
                (key,)
            )
            row = cursor.fetchone()
            return row[0] if row else None

    def batch_get_manual_tags(self, keys: List[str]) -> Dict[str, Optional[str]]:
        """批量获取 manual_tags"""
        if not keys:
            return {}
        
        results = {}
        with self._get_conn() as conn:
            placeholders = ",".join(["?" for _ in keys])
            cursor = conn.execute(
                f"SELECT key, manual_tags FROM thumbs WHERE key IN ({placeholders})",
                keys
            )
            for row in cursor.fetchall():
                results[row[0]] = row[1]
        return results

    # ==================== AI 翻译方法 ====================

    def save_ai_translation(self, key: str, ai_translation_json: str):
        """保存 AI 翻译到数据库"""
        with self._get_conn() as conn:
            # 先检查记录是否存在
            cursor = conn.execute("SELECT 1 FROM thumbs WHERE key = ? LIMIT 1", (key,))
            exists = cursor.fetchone() is not None
            
            if exists:
                conn.execute(
                    "UPDATE thumbs SET ai_translation = ? WHERE key = ?",
                    (ai_translation_json, key)
                )
            else:
                date = self._current_timestamp()
                cat = "folder" if "::" not in key and "." not in key else "file"
                conn.execute(
                    "INSERT INTO thumbs (key, date, category, ai_translation) VALUES (?, ?, ?, ?)",
                    (key, date, cat, ai_translation_json)
                )

    def load_ai_translation(self, key: str, model_filter: Optional[str] = None) -> Optional[str]:
        """读取 AI 翻译"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT ai_translation FROM thumbs WHERE key = ? LIMIT 1",
                (key,)
            )
            row = cursor.fetchone()
            if not row or not row[0]:
                return None
            
            json_str = row[0]
            # 如果有模型过滤器，检查模型是否匹配
            if model_filter:
                try:
                    data = json.loads(json_str)
                    stored_model = data.get("model", "")
                    stored_service = data.get("service", "")
                    # 对于 ollama 服务，需要匹配模型
                    if stored_service == "ollama" and stored_model != model_filter:
                        return None
                except:
                    pass
            return json_str

    def batch_load_ai_translations(self, keys: List[str], model_filter: Optional[str] = None) -> Dict[str, str]:
        """批量读取 AI 翻译"""
        results = {}
        for key in keys:
            result = self.load_ai_translation(key, model_filter)
            if result:
                results[key] = result
        return results

    def get_ai_translation_count(self) -> int:
        """获取 AI 翻译缓存数量"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT COUNT(*) FROM thumbs WHERE ai_translation IS NOT NULL"
            )
            return cursor.fetchone()[0]

    # ==================== 数据库维护方法 ====================

    def get_stats(self) -> Dict[str, Any]:
        """获取数据库统计信息"""
        with self._get_conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM thumbs").fetchone()[0]
            with_emm = conn.execute(
                "SELECT COUNT(*) FROM thumbs WHERE emm_json IS NOT NULL AND emm_json != ''"
            ).fetchone()[0]
            invalid = conn.execute(
                "SELECT COUNT(*) FROM thumbs WHERE value IS NULL OR length(value) = 0"
            ).fetchone()[0]
            folders = conn.execute(
                "SELECT COUNT(*) FROM thumbs WHERE category = 'folder'"
            ).fetchone()[0]
            failed = conn.execute("SELECT COUNT(*) FROM failed_thumbnails").fetchone()[0]
        
        db_size = self.db_path.stat().st_size if self.db_path.exists() else 0
        
        return {
            "total": total,
            "with_emm": with_emm,
            "invalid": invalid,
            "folders": folders,
            "failed": failed,
            "db_size_bytes": db_size,
            "size_bytes": db_size  # 兼容 API 使用的字段名
        }

    def vacuum(self):
        """清理数据库（VACUUM）"""
        with self._get_conn() as conn:
            conn.execute("VACUUM")

    def clear_cache(self, category: Optional[str] = None):
        """清空缓存（可按分类）"""
        with self._get_conn() as conn:
            if category:
                conn.execute("DELETE FROM thumbs WHERE category = ?", (category,))
            else:
                conn.execute("DELETE FROM thumbs")
                conn.execute("DELETE FROM failed_thumbnails")

    def clear_expired(self, days: int = 30, exclude_folders: bool = True) -> int:
        """清理过期条目"""
        from datetime import timedelta
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        
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

    def clear_by_prefix(self, prefix: str) -> int:
        """清理指定路径前缀下的所有缩略图"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "DELETE FROM thumbs WHERE key LIKE ?",
                (f"{prefix}%",)
            )
            count = cursor.rowcount
            conn.execute(
                "DELETE FROM failed_thumbnails WHERE key LIKE ?",
                (f"{prefix}%",)
            )
            return count

    def cleanup_invalid_entries(self) -> int:
        """清理无效条目（没有缩略图数据的条目）"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "DELETE FROM thumbs WHERE value IS NULL OR length(value) = 0"
            )
            return cursor.rowcount

    def cleanup_invalid_paths(self) -> int:
        """清理不存在路径的缩略图记录"""
        import os
        keys = self.get_all_thumbnail_keys()
        invalid_keys = []
        
        for key in keys:
            # 处理压缩包内路径
            actual_path = key.split("::")[0] if "::" in key else key
            if not os.path.exists(actual_path):
                invalid_keys.append(key)
        
        with self._get_conn() as conn:
            for key in invalid_keys:
                conn.execute("DELETE FROM thumbs WHERE key = ?", (key,))
                conn.execute("DELETE FROM failed_thumbnails WHERE key = ?", (key,))
        
        return len(invalid_keys)

    def find_earliest_thumbnail_in_path(self, folder_path: str) -> Optional[Tuple[str, bytes]]:
        """查找路径下最早的缩略图记录（用于文件夹绑定）"""
        with self._get_conn() as conn:
            # 匹配两种路径分隔符
            pattern1 = f"{folder_path}/%"
            pattern2 = f"{folder_path}\\%"
            cursor = conn.execute(
                """SELECT key, value FROM thumbs 
                   WHERE (key LIKE ? OR key LIKE ?) AND category = 'file' AND value IS NOT NULL
                   ORDER BY date ASC LIMIT 1""",
                (pattern1, pattern2)
            )
            row = cursor.fetchone()
            return (row[0], row[1]) if row else None

    def get_all_failed_keys(self) -> List[str]:
        """获取所有失败记录的键列表"""
        with self._get_conn() as conn:
            cursor = conn.execute("SELECT key FROM failed_thumbnails")
            return [row[0] for row in cursor.fetchall()]


# ==================== 全局实例 ====================

_thumbnail_db: Optional[ThumbnailDB] = None


def get_thumbnail_db() -> ThumbnailDB:
    """获取全局缩略图数据库实例"""
    global _thumbnail_db
    if _thumbnail_db is None:
        _thumbnail_db = ThumbnailDB()
        print(f"✅ 缩略图数据库已初始化: {_thumbnail_db.db_path}")
    return _thumbnail_db
