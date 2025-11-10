#!/usr/bin/env python3
"""
NeoView 缩略图预处理器 (Python版本)

用于预处理文件夹和压缩包的缩略图，提升NeoView浏览性能。

功能特性:
- 🚀 预缓存缩略图，避免实时生成时的卡顿
- 📁 智能查找：自动从文件夹中查找第一张图片，或从压缩包中提取第一张图片
- 🔄 批量处理：支持批量处理整个目录树
- 📊 进度显示：实时显示处理进度和统计信息
- 🎯 自定义尺寸：可自定义缩略图尺寸

支持的图片格式: JPEG/JPG, PNG, GIF, BMP, WebP, AVIF, JXL
支持的压缩包格式: ZIP/CBZ, RAR/CBR, 7Z/CB7
"""

import os
import sys
import hashlib
import argparse
import pathlib
from typing import Optional, List, Tuple
from PIL import Image
import pillow_avif
import pillow_jxl
import zipfile
import rarfile
import py7zr
import tempfile
import shutil
import sqlite3
import base64
import time


class ThumbnailPreprocessor:
    """缩略图预处理器"""

    # 支持的图片格式
    IMAGE_EXTENSIONS = {
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif',
        # '.jxl', 
        '.tiff', '.tif'
    }

    # 支持的压缩包格式
    ARCHIVE_EXTENSIONS = {
        '.zip', '.cbz', '.rar', '.cbr', '.7z', '.cb7'
    }

    def __init__(self, cache_dir: str, max_size: int = 256, verbose: bool = False):
        """
        初始化预处理器

        Args:
            cache_dir: 缩略图数据库目录路径
            max_size: 缩略图最大尺寸
            verbose: 是否显示详细输出
        """
        self.cache_dir = pathlib.Path(cache_dir)
        self.db_path = self.cache_dir / "thumbnails.db"
        self.max_size = max_size
        self.verbose = verbose

        # 确保缓存目录存在
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # 初始化数据库
        self.init_database()

        # 统计信息
        self.stats = {
            'processed': 0,
            'skipped': 0,
            'errors': 0
        }

    def init_database(self):
        """初始化数据库和表"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS thumbnails (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    hash TEXT NOT NULL UNIQUE,
                    file_path TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    thumbnail_data TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    file_modified INTEGER NOT NULL
                )
            ''')
            
            # 创建索引
            conn.execute('CREATE INDEX IF NOT EXISTS idx_hash ON thumbnails(hash)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_file_path ON thumbnails(file_path)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_updated_at ON thumbnails(updated_at)')

    def calculate_hash(self, file_path: str) -> str:
        """计算文件路径的哈希值"""
        return hashlib.sha256(file_path.encode('utf-8')).hexdigest()

    def get_file_modified_time(self, file_path: pathlib.Path) -> int:
        """获取文件的修改时间"""
        try:
            return int(file_path.stat().st_mtime)
        except OSError:
            return 0

    def store_thumbnail(self, file_path: str, thumbnail_data: str):
        """存储缩略图到数据库"""
        hash_value = self.calculate_hash(file_path)
        file_name = pathlib.Path(file_path).name
        file_modified = self.get_file_modified_time(pathlib.Path(file_path))
        now = int(time.time())
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                INSERT OR REPLACE INTO thumbnails
                (hash, file_path, file_name, thumbnail_data, created_at, updated_at, file_modified)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (hash_value, file_path, file_name, thumbnail_data, now, now, file_modified))

    def get_thumbnail(self, file_path: str) -> Optional[str]:
        """从数据库获取缩略图"""
        hash_value = self.calculate_hash(file_path)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute('''
                SELECT thumbnail_data, file_modified FROM thumbnails WHERE hash = ?
            ''', (hash_value,))
            
            row = cursor.fetchone()
            if row:
                stored_data, stored_modified = row
                # 检查文件是否仍然存在且未修改
                file_path_obj = pathlib.Path(file_path)
                if file_path_obj.exists():
                    current_modified = self.get_file_modified_time(file_path_obj)
                    if current_modified <= stored_modified:
                        return stored_data
                # 文件已修改或不存在，删除缓存记录
                self.delete_thumbnail(file_path)
        
        return None

    def delete_thumbnail(self, file_path: str):
        """删除缩略图缓存"""
        hash_value = self.calculate_hash(file_path)
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('DELETE FROM thumbnails WHERE hash = ?', (hash_value,))

    def cleanup_expired_cache(self) -> int:
        """清理过期缓存"""
        cleaned_count = 0
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute('SELECT id, file_path, file_modified FROM thumbnails')
            
            to_delete = []
            for row in cursor:
                thumbnail_id, file_path, stored_modified = row
                file_path_obj = pathlib.Path(file_path)
                
                # 检查文件是否存在
                if not file_path_obj.exists():
                    to_delete.append(thumbnail_id)
                    cleaned_count += 1
                    continue
                
                # 检查文件修改时间
                current_modified = self.get_file_modified_time(file_path_obj)
                if current_modified > stored_modified:
                    to_delete.append(thumbnail_id)
                    cleaned_count += 1
            
            # 批量删除过期记录
            for thumbnail_id in to_delete:
                conn.execute('DELETE FROM thumbnails WHERE id = ?', (thumbnail_id,))
        
        return cleaned_count

    def get_cache_stats(self) -> Tuple[int, int]:
        """获取缓存统计信息"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute('SELECT COUNT(*), COALESCE(SUM(LENGTH(thumbnail_data)), 0) FROM thumbnails')
            count, size = cursor.fetchone()
            return count, size

    def clear_all_cache(self):
        """清空所有缓存"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('DELETE FROM thumbnails')

    def generate_thumbnail_from_file(self, image_path: pathlib.Path) -> Optional[str]:
        """从图片文件生成缩略图"""
        try:
            with Image.open(image_path) as img:
                # 转换为RGB（去除透明度）
                if img.mode in ('RGBA', 'LA', 'P'):
                    # 创建白色背景
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                # 生成缩略图
                thumbnail = self.resize_image(img, self.max_size)

                # 转换为base64
                import io
                buffer = io.BytesIO()
                thumbnail.save(buffer, 'JPEG', quality=85)
                thumbnail_bytes = buffer.getvalue()
                
                return f"data:image/jpeg;base64,{base64.b64encode(thumbnail_bytes).decode('ascii')}"

        except Exception as e:
            if self.verbose:
                print(f"✗ 处理图片失败 {image_path.name}: {e}")

        return None

    def get_cache_path(self, file_path: pathlib.Path) -> pathlib.Path:
        """获取缓存文件路径（基于文件路径的哈希值）"""
        # 使用文件路径的哈希值作为缓存文件名
        path_str = str(file_path.resolve())
        hash_obj = hashlib.sha256(path_str.encode('utf-8'))
        hash_str = hash_obj.hexdigest()
        return self.cache_dir / f"{hash_str}.jpg"

    def is_image_file(self, file_path: pathlib.Path) -> bool:
        """检查是否为图片文件"""
        return file_path.suffix.lower() in self.IMAGE_EXTENSIONS

    def is_archive_file(self, file_path: pathlib.Path) -> bool:
        """检查是否为压缩包文件"""
        return file_path.suffix.lower() in self.ARCHIVE_EXTENSIONS

    def resize_image(self, image: Image.Image, max_size: int) -> Image.Image:
        """等比例缩放图片"""
        width, height = image.size

        # 如果图片尺寸小于等于最大尺寸，直接返回
        if width <= max_size and height <= max_size:
            return image

        # 计算缩放比例
        if width > height:
            scale = max_size / width
        else:
            scale = max_size / height

        new_width = int(width * scale)
        new_height = int(height * scale)

        # 使用LANCZOS滤波器获得更好的缩放质量
        return image.resize((new_width, new_height), Image.Resampling.LANCZOS)

    def process_image_file(self, image_path: pathlib.Path) -> Optional[str]:
        """处理单个图片文件"""
        try:
            # 检查缓存
            cache_path = self.get_cache_path(image_path)
            if cache_path.exists():
                # 检查缓存是否过期
                cache_mtime = cache_path.stat().st_mtime
                image_mtime = image_path.stat().st_mtime

                if cache_mtime >= image_mtime:
                    if self.verbose:
                        print(f"✓ 缓存有效: {image_path.name}")
                    return str(cache_path)

            # 加载图片
            with Image.open(image_path) as img:
                # 转换为RGB（去除透明度）
                if img.mode in ('RGBA', 'LA', 'P'):
                    # 创建白色背景
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                # 生成缩略图
                thumbnail = self.resize_image(img, self.max_size)

                # 保存为JPEG
                thumbnail.save(cache_path, 'JPEG', quality=85)

                if self.verbose:
                    print(f"✓ 生成缩略图: {image_path.name}")
                return str(cache_path)

        except Exception as e:
            if self.verbose:
                print(f"✗ 处理图片失败 {image_path.name}: {e}")
            return None

    def extract_first_image_from_zip(self, zip_path: pathlib.Path) -> Optional[bytes]:
        """从ZIP文件中提取第一张图片"""
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                # 获取文件列表
                file_list = zf.namelist()

                # 按名称排序
                file_list.sort(key=lambda x: x.lower())

                # 查找第一张图片
                for filename in file_list:
                    file_path = pathlib.Path(filename)
                    if self.is_image_file(file_path) and not filename.endswith('/'):
                        # 提取图片数据
                        with zf.open(filename) as f:
                            return f.read()

        except Exception as e:
            if self.verbose:
                print(f"✗ 读取ZIP文件失败 {zip_path.name}: {e}")

        return None

    def extract_first_image_from_rar(self, rar_path: pathlib.Path) -> Optional[bytes]:
        """从RAR文件中提取第一张图片"""
        try:
            with rarfile.RarFile(rar_path, 'r') as rf:
                # 获取文件列表
                file_list = rf.namelist()

                # 按名称排序
                file_list.sort(key=lambda x: x.lower())

                # 查找第一张图片
                for filename in file_list:
                    file_path = pathlib.Path(filename)
                    if self.is_image_file(file_path):
                        # 提取图片数据
                        with rf.open(filename) as f:
                            return f.read()

        except Exception as e:
            if self.verbose:
                print(f"✗ 读取RAR文件失败 {rar_path.name}: {e}")

        return None

    def extract_first_image_from_7z(self, archive_path: pathlib.Path) -> Optional[bytes]:
        """从7Z文件中提取第一张图片"""
        try:
            with py7zr.SevenZipFile(archive_path, 'r') as szf:
                # 获取文件列表
                file_list = szf.getnames()

                # 按名称排序
                file_list.sort(key=lambda x: x.lower())

                # 查找第一张图片
                for filename in file_list:
                    file_path = pathlib.Path(filename)
                    if self.is_image_file(file_path):
                        # 提取图片数据到临时文件
                        with tempfile.NamedTemporaryFile(delete=False) as tmp:
                            szf.extract(targets=[filename], path=pathlib.Path(tmp.name).parent)
                            extracted_path = pathlib.Path(tmp.name).parent / filename

                            try:
                                with open(extracted_path, 'rb') as f:
                                    data = f.read()
                                return data
                            finally:
                                # 清理临时文件
                                if extracted_path.exists():
                                    extracted_path.unlink(missing_ok=True)

        except Exception as e:
            if self.verbose:
                print(f"✗ 读取7Z文件失败 {archive_path.name}: {e}")

        return None

    def process_archive_file(self, archive_path: pathlib.Path) -> Optional[str]:
        """处理压缩包文件"""
        try:
            # 检查数据库缓存
            path_str = str(archive_path)
            cached_data = self.get_thumbnail(path_str)
            if cached_data:
                if self.verbose:
                    print(f"✓ 缓存有效: {archive_path.name}")
                self.stats['skipped'] += 1
                return cached_data

            # 根据文件类型提取第一张图片
            image_data = None
            suffix = archive_path.suffix.lower()

            if suffix in ['.zip', '.cbz']:
                image_data = self.extract_first_image_from_zip(archive_path)
            elif suffix in ['.rar', '.cbr']:
                image_data = self.extract_first_image_from_rar(archive_path)
            elif suffix in ['.7z', '.cb7']:
                image_data = self.extract_first_image_from_7z(archive_path)

            if image_data:
                # 从图片数据生成缩略图
                thumbnail_data = self.generate_thumbnail_from_bytes(image_data)
                if thumbnail_data:
                    # 存储到数据库
                    self.store_thumbnail(path_str, thumbnail_data)
                    
                    if self.verbose:
                        print(f"✓ 生成缩略图: {archive_path.name}")
                    return thumbnail_data

            else:
                if self.verbose:
                    print(f"跳过 (无图片): {archive_path.name}")
                self.stats['skipped'] += 1

        except Exception as e:
            if self.verbose:
                print(f"✗ 处理压缩包失败 {archive_path.name}: {e}")
            self.stats['errors'] += 1

        return None

    def process_folder(self, folder_path: pathlib.Path) -> Optional[str]:
        """处理文件夹"""
        try:
            # 检查数据库缓存
            path_str = str(folder_path)
            cached_data = self.get_thumbnail(path_str)
            if cached_data:
                if self.verbose:
                    print(f"✓ 缓存有效: {folder_path.name}/")
                self.stats['skipped'] += 1
                return cached_data

            # 查找第一张图片文件
            image_files = []
            archive_files = []

            for item in sorted(folder_path.iterdir()):
                if item.is_file():
                    if self.is_image_file(item):
                        image_files.append(item)
                    elif self.is_archive_file(item):
                        archive_files.append(item)

            # 优先处理图片文件
            if image_files:
                thumbnail_data = self.generate_thumbnail_from_file(image_files[0])
                if thumbnail_data:
                    self.store_thumbnail(path_str, thumbnail_data)
                    if self.verbose:
                        print(f"✓ 生成缩略图: {folder_path.name}/")
                    return thumbnail_data

            # 如果没有图片，尝试处理压缩包
            if archive_files:
                result = self.process_archive_file(archive_files[0])
                if result:
                    # 复制压缩包的缩略图到文件夹缓存
                    self.store_thumbnail(path_str, result)
                    return result

            # 没有找到可用的图片
            if self.verbose:
                print(f"跳过 (无图片): {folder_path.name}/")
            self.stats['skipped'] += 1

        except Exception as e:
            if self.verbose:
                print(f"✗ 处理文件夹失败 {folder_path.name}: {e}")
            self.stats['errors'] += 1

        return None

    def process_directory(self, root_path: pathlib.Path, recursive: bool = False) -> None:
        """处理目录"""
        if self.verbose:
            print(f"开始处理目录: {root_path}")
            print(f"缩略图尺寸: {self.max_size}x{self.max_size}")
            print(f"递归处理: {recursive}")
            print("-" * 50)

        # 遍历目录
        if recursive:
            items = list(root_path.rglob('*'))
        else:
            items = list(root_path.iterdir())

        # 过滤出文件夹和压缩包
        targets = []
        for item in items:
            if item.is_dir():
                targets.append(item)
            elif item.is_file() and self.is_archive_file(item):
                targets.append(item)

        # 按名称排序
        targets.sort(key=lambda x: str(x).lower())

        for item in targets:
            if self.verbose:
                print(f"处理: {item.name}{'/' if item.is_dir() else ''} ... ", end='', flush=True)

            if item.is_dir():
                result = self.process_folder(item)
                if result:
                    self.stats['processed'] += 1
            else:  # 压缩包
                result = self.process_archive_file(item)
                if result:
                    self.stats['processed'] += 1

        # 显示统计信息
        print("\n处理完成!")
        print(f"成功处理: {self.stats['processed']}")
        print(f"跳过: {self.stats['skipped']}")
        print(f"错误: {self.stats['errors']}")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='NeoView 缩略图预处理器 (Python版本)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python thumbnail_preprocessor.py "D:\\Images" --recursive --verbose
  python thumbnail_preprocessor.py "/home/user/Images" --size 128
  python thumbnail_preprocessor.py "D:\\Comics" --cache-dir "C:\\MyCache\\thumbnails"
        """
    )

    parser.add_argument('path', help='要处理的目录路径')
    parser.add_argument(
        '--size', type=int, default=256,
        help='缩略图最大尺寸 (默认: 256)'
    )
    parser.add_argument(
        '--recursive', action='store_true',
        help='递归处理子目录'
    )
    parser.add_argument(
        '--verbose', action='store_true',
        help='显示详细进度'
    )
    parser.add_argument(
        '--cache-dir',
        default=r'D:\scoop\apps\neoview\thumb',
        help='缓存目录路径 (默认: D:\\scoop\\apps\\neoview\\thumb)'
    )

    args = parser.parse_args()

    # 确定缓存目录
    cache_dir = args.cache_dir

    # 创建预处理器
    processor = ThumbnailPreprocessor(
        cache_dir=str(cache_dir),
        max_size=args.size,
        verbose=args.verbose
    )

    # 处理目录
    root_path = pathlib.Path(args.path)
    if not root_path.exists():
        print(f"错误: 路径不存在: {args.path}")
        sys.exit(1)

    if not root_path.is_dir():
        print(f"错误: 路径不是目录: {args.path}")
        sys.exit(1)

    processor.process_directory(root_path, args.recursive)


if __name__ == '__main__':
    main()