"""
Python + pyvips 缩略图系统
高性能缩略图生成服务，支持压缩包首图早停扫描
"""

import asyncio
import base64
import concurrent.futures
import functools
import io
import json
import logging
import os
import sqlite3
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any

import pyvips
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel
import uvicorn

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # 控制台输出
        logging.FileHandler('thumbnail_service.log', encoding='utf-8')  # 文件输出
    ]
)
logger = logging.getLogger(__name__)

# 请求模型
class EnsureReq(BaseModel):
    bookpath: str
    source_path: str
    is_folder: bool = False
    is_archive: bool = False
    source_mtime: int = 0
    max_size: int = 2048

class PrefetchReq(BaseModel):
    dir_path: str
    entries: List[Dict[str, Any]]

class ThumbnailResp(BaseModel):
    webp_bytes: bytes  # 实际将通过 HTTP body 返回
    width: int
    height: int
    file_size: int

class HealthResp(BaseModel):
    status: str
    workers: int

# 数据库管理
class ThumbnailDatabase:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """初始化数据库表结构"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS thumbnails (
                    bookpath TEXT PRIMARY KEY,
                    relative_thumb_path TEXT NOT NULL,
                    thumbnail_name TEXT NOT NULL,
                    hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    source_modified INTEGER NOT NULL,
                    is_folder BOOLEAN NOT NULL DEFAULT 0,
                    width INTEGER NOT NULL,
                    height INTEGER NOT NULL,
                    file_size INTEGER NOT NULL,
                    content BLOB
                )
            """)
            
            # 检查并添加 content 字段（迁移）
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(thumbnails)")
            columns = [row[1] for row in cursor.fetchall()]
            
            if 'content' not in columns:
                logger.info("数据库迁移：添加 content BLOB 字段")
                conn.execute("ALTER TABLE thumbnails ADD COLUMN content BLOB")
            
            conn.commit()
    
    def get_thumbnail(self, bookpath: str) -> Optional[Dict[str, Any]]:
        """获取缩略图记录"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM thumbnails WHERE bookpath = ?", 
                (bookpath,)
            )
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None
    
    def upsert_thumbnail(self, record: Dict[str, Any]) -> None:
        """插入或更新缩略图记录"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO thumbnails 
                (bookpath, relative_thumb_path, thumbnail_name, hash, created_at, 
                 source_modified, is_folder, width, height, file_size, content)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record['bookpath'],
                record['relative_thumb_path'],
                record['thumbnail_name'],
                record['hash'],
                record['created_at'],
                record['source_modified'],
                record['is_folder'],
                record['width'],
                record['height'],
                record['file_size'],
                record['content']
            ))
            conn.commit()
    
    def batch_get_thumbnails(self, bookpaths: List[str]) -> List[Dict[str, Any]]:
        """批量获取缩略图记录"""
        if not bookpaths:
            return []
        
        placeholders = ','.join(['?' for _ in bookpaths])
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                f"SELECT * FROM thumbnails WHERE bookpath IN ({placeholders})",
                bookpaths
            )
            return [dict(row) for row in cursor.fetchall()]

# 缩略图管理器
class ThumbnailManager:
    def __init__(self, db_path: str, max_workers: int = 8):
        self.db = ThumbnailDatabase(db_path)
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
        self.loop = asyncio.get_event_loop()
        self.max_workers = max_workers
    
    async def ensure_thumbnail(self, req: EnsureReq) -> bytes:
        """确保缩略图存在，返回 WebP 二进制数据"""
        # 检查缓存
        cached = self.db.get_thumbnail(req.bookpath)
        if cached and cached.get('content'):
            if cached['source_modified'] == req.source_mtime:
                logger.info(f"缓存命中: {req.bookpath}")
                return cached['content']
            else:
                logger.info(f"缓存过期需要重新生成: {req.bookpath} "
                           f"(缓存: {cached['source_modified']}, 当前: {req.source_mtime})")
        else:
            logger.info(f"缓存未命中，需要生成: {req.bookpath}")
        
        # 生成新缩略图
        logger.debug(f"开始生成缩略图: {req.bookpath}")
        future = self.loop.run_in_executor(
            self.executor,
            functools.partial(self._generate_thumbnail_sync, req)
        )
        webp_bytes, width, height = await future
        
        # 保存到数据库
        now = datetime.utcnow().isoformat()
        record = {
            'bookpath': req.bookpath,
            'relative_thumb_path': f"{req.bookpath}.webp",
            'thumbnail_name': f"{hash(req.bookpath)}.webp",
            'hash': str(hash(req.bookpath)),
            'created_at': now,
            'source_modified': req.source_mtime,
            'is_folder': req.is_folder,
            'width': width,
            'height': height,
            'file_size': len(webp_bytes),
            'content': webp_bytes
        }
        self.db.upsert_thumbnail(record)
        
        logger.info(f"缩略图生成完成: {req.bookpath} ({width}x{height}, {len(webp_bytes)} bytes)")
        return webp_bytes
    
    def _generate_thumbnail_sync(self, req: EnsureReq) -> Tuple[bytes, int, int]:
        """同步生成缩略图"""
        try:
            if req.is_archive:
                logger.debug(f"处理压缩包: {req.source_path}")
                img_bytes, width, height = self._process_archive(req.source_path)
            else:
                logger.debug(f"处理普通文件: {req.source_path}")
                img_bytes, width, height = self._process_file(req.source_path)
            
            # 使用 pyvips 编码为 WebP
            logger.debug(f"加载图片: 原始尺寸 {width}x{height}")
            image = pyvips.Image.new_from_buffer(img_bytes, access="sequential")
            image = self._resize_image(image, req.max_size)
            webp_bytes = image.write_to_buffer(".webp", Q=85)
            
            logger.debug(f"WebP 编码完成: 输出尺寸 {image.width}x{image.height}, "
                        f"大小 {len(webp_bytes)} bytes")
            return webp_bytes, image.width, image.height
        except Exception as e:
            logger.error(f"生成缩略图失败: {req.source_path}, error={str(e)}", exc_info=True)
            raise
    
    def _process_file(self, file_path: str) -> Tuple[bytes, int, int]:
        """处理普通图片文件"""
        try:
            logger.debug(f"加载图片文件: {file_path}")
            image = pyvips.Image.new_from_file(file_path, access="sequential")
            logger.debug(f"图片加载成功: {image.width}x{image.height}")
            return image.write_to_buffer(".v"), image.width, image.height
        except Exception as e:
            logger.error(f"加载图片失败: {file_path}, error={str(e)}", exc_info=True)
            raise
    
    def _process_archive(self, archive_path: str) -> Tuple[bytes, int, int]:
        """处理压缩包，实现首图早停扫描"""
        logger.debug(f"开始扫描压缩包: {archive_path}")
        
        try:
            with zipfile.ZipFile(archive_path) as zf:
                all_files = zf.namelist()
                logger.debug(f"压缩包包含 {len(all_files)} 个文件")
                
                # 早停策略：按文件名排序，扫描到第一个合法图片即停
                for name in sorted(all_files):
                    if self._is_supported_image(name):
                        logger.info(f"压缩包首图: {archive_path} :: {name}")
                        with zf.open(name, "r") as fp:
                            data = fp.read()
                        
                        logger.debug(f"提取文件: {name}, 大小: {len(data)} bytes")
                        
                        # 使用 pyvips 从内存加载
                        image = pyvips.Image.new_from_buffer(data, access="sequential")
                        return image.write_to_buffer(".v"), image.width, image.height
                
                logger.warning(f"压缩包内未找到支持的图片: {archive_path}")
                logger.debug(f"压缩包文件列表: {all_files[:10]}...")  # 只显示前10个
        except Exception as e:
            logger.error(f"处理压缩包失败: {archive_path}, error={str(e)}", exc_info=True)
            raise
        
        raise ValueError("压缩包内未找到支持的图片")
    
    def _resize_image(self, image: pyvips.Image, max_size: int) -> pyvips.Image:
        """等比例缩放图片"""
        if image.width <= max_size and image.height <= max_size:
            logger.debug(f"图片无需缩放: {image.width}x{image.height} <= {max_size}")
            return image
        
        scale = min(max_size / image.width, max_size / image.height)
        new_width = int(image.width * scale)
        new_height = int(image.height * scale)
        
        logger.debug(f"缩放图片: {image.width}x{image.height} -> {new_width}x{new_height} (scale={scale:.3f})")
        return image.resize(scale)
    
    def _is_supported_image(self, filename: str) -> bool:
        """检查是否为支持的图片格式"""
        ext = Path(filename).suffix.lower()
        return ext in {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.avif', '.jxl'}
    
    async def prefetch_directory(self, req: PrefetchReq) -> int:
        """预加载目录缩略图"""
        tasks = []
        for entry in req.entries:
            if entry.get('is_image') or entry.get('is_dir'):
                task = self.ensure_thumbnail(EnsureReq(
                    bookpath=entry['path'],
                    source_path=entry['path'],
                    is_folder=entry.get('is_dir', False),
                    is_archive=entry.get('is_archive', False),
                    source_mtime=entry.get('mtime', 0)
                ))
                tasks.append(task)
        
        # 并发处理，但限制并发数
        semaphore = asyncio.Semaphore(self.max_workers)
        
        async def bounded_task(task):
            async with semaphore:
                try:
                    await task
                    return True
                except Exception as e:
                    logger.error(f"预加载失败: {e}")
                    return False
        
        results = await asyncio.gather(*[bounded_task(t) for t in tasks])
        return sum(results)
    
    def stats(self) -> Dict[str, int]:
        """获取服务统计信息"""
        return {
            "workers": self.max_workers,
            "status": 1  # 简化状态
        }

# FastAPI 应用
app = FastAPI(title="Python Thumbnail Service", version="1.0.0")
thumb_mgr = ThumbnailManager("thumbnails.db")

@app.post("/ensure")
async def ensure_thumbnail(req: EnsureReq):
    """确保缩略图存在，返回 WebP 二进制流"""
    logger.info(f"收到缩略图请求: bookpath={req.bookpath}, source_path={req.source_path}, "
                f"is_folder={req.is_folder}, is_archive={req.is_archive}, max_size={req.max_size}")
    
    try:
        start_time = time.time()
        webp_bytes = await thumb_mgr.ensure_thumbnail(req)
        elapsed = time.time() - start_time
        
        logger.info(f"缩略图生成成功: bookpath={req.bookpath}, "
                   f"size={len(webp_bytes)} bytes, 耗时={elapsed:.3f}s")
        
        return Response(
            content=webp_bytes,
            media_type="image/webp",
            headers={
                "X-Width": str(req.max_size),
                "X-Height": str(req.max_size),
                "X-File-Size": str(len(webp_bytes)),
                "X-Process-Time": f"{elapsed:.3f}"
            }
        )
    except Exception as e:
        logger.error(f"生成缩略图失败: bookpath={req.bookpath}, error={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/prefetch")
async def prefetch(req: PrefetchReq):
    """预加载目录缩略图"""
    logger.info(f"收到预加载请求: dir_path={req.dir_path}, entries_count={len(req.entries)}")
    
    try:
        start_time = time.time()
        count = await thumb_mgr.prefetch_directory(req)
        elapsed = time.time() - start_time
        
        logger.info(f"预加载完成: 处理了 {count} 个条目, 耗时={elapsed:.3f}s")
        return {"queued": count, "processed": count}
    except Exception as e:
        logger.error(f"预加载失败: dir_path={req.dir_path}, error={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """健康检查"""
    stats = thumb_mgr.stats()
    logger.debug(f"健康检查请求: stats={stats}")
    return {"status": "ok", **stats}

@app.get("/batch")
async def batch_thumbnails(bookpaths: str):
    """批量获取缩略图"""
    try:
        paths = json.loads(bookpaths)
        logger.info(f"批量获取请求: paths_count={len(paths)}")
        
        records = thumb_mgr.db.batch_get_thumbnails(paths)
        
        # 返回有 content 的记录
        results = []
        for record in records:
            if record.get('content'):
                results.append({
                    'bookpath': record['bookpath'],
                    'width': record['width'],
                    'height': record['height'],
                    'file_size': record['file_size']
                })
        
        logger.info(f"批量获取完成: 找到 {len(results)} 个缓存记录")
        return {"results": results}
    except Exception as e:
        logger.error(f"批量获取失败: error={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    logger.info("=" * 50)
    logger.info("Python + pyvips 缩略图服务启动")
    logger.info(f"版本: 1.0.0")
    logger.info(f"监听地址: http://127.0.0.1:8899")
    logger.info(f"工作线程数: {thumb_mgr.max_workers}")
    logger.info("=" * 50)
    
    uvicorn.run(
        "thumbnail_service:app",
        host="127.0.0.1",
        port=8899,
        log_level="info",
        reload=False
    )