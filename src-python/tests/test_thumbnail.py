"""
缩略图系统测试
Property 4: Thumbnail Size Constraint
Property 10: Thumbnail Cache Consistency
Validates: Requirements 3.1, 3.4, 3.5
"""
import pytest
from hypothesis import given, strategies as st, settings
import tempfile
import os
from pathlib import Path
from PIL import Image
import io

from core.thumbnail_generator import (
    generate_image_thumbnail,
    generate_file_thumbnail,
    DEFAULT_MAX_SIZE,
)
from db.thumbnail_db import ThumbnailDB


class TestThumbnailSize:
    """缩略图尺寸测试"""
    
    @given(
        st.integers(min_value=100, max_value=2000),
        st.integers(min_value=100, max_value=2000),
        st.integers(min_value=64, max_value=512),
    )
    @settings(max_examples=100)
    def test_thumbnail_size_constraint(self, width: int, height: int, max_size: int):
        """
        Property 4: Thumbnail Size Constraint
        生成的缩略图尺寸应不超过指定的最大值
        Validates: Requirements 3.1
        """
        # 创建测试图片
        img = Image.new('RGB', (width, height), color='blue')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        image_data = buffer.getvalue()
        
        # 生成缩略图
        thumbnail_data = generate_image_thumbnail(image_data, max_size)
        
        # 验证尺寸
        thumb_img = Image.open(io.BytesIO(thumbnail_data))
        thumb_width, thumb_height = thumb_img.size
        
        assert thumb_width <= max_size, \
            f"Thumbnail width {thumb_width} exceeds max_size {max_size}"
        assert thumb_height <= max_size, \
            f"Thumbnail height {thumb_height} exceeds max_size {max_size}"
    
    def test_thumbnail_default_size(self):
        """测试默认缩略图尺寸"""
        # 创建大图片
        img = Image.new('RGB', (1000, 1000), color='green')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        image_data = buffer.getvalue()
        
        # 使用默认尺寸
        thumbnail_data = generate_image_thumbnail(image_data)
        
        thumb_img = Image.open(io.BytesIO(thumbnail_data))
        assert thumb_img.width <= DEFAULT_MAX_SIZE
        assert thumb_img.height <= DEFAULT_MAX_SIZE


class TestThumbnailCache:
    """缩略图缓存测试"""
    
    @given(st.binary(min_size=100, max_size=1000))
    @settings(max_examples=50)
    def test_thumbnail_cache_consistency(self, thumbnail_data: bytes):
        """
        Property 10: Thumbnail Cache Consistency
        缓存的缩略图应与原始数据一致
        Validates: Requirements 3.4, 3.5
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test_thumbnails.db")
            db = ThumbnailDB(db_path)
            
            path_key = "/test/image.jpg"
            file_size = 12345
            file_mtime = 1234567890
            
            # 保存
            db.save_thumbnail(path_key, thumbnail_data, file_size, file_mtime)
            
            # 读取
            cached = db.get_thumbnail_if_valid(path_key, file_size, file_mtime)
            
            assert cached == thumbnail_data, "Cached data does not match original"
    
    def test_cache_invalidation_on_mtime_change(self):
        """测试修改时间变化时缓存失效"""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test_thumbnails.db")
            db = ThumbnailDB(db_path)
            
            path_key = "/test/image.jpg"
            thumbnail_data = b"test thumbnail data"
            file_size = 12345
            old_mtime = 1234567890
            new_mtime = 1234567999
            
            # 保存
            db.save_thumbnail(path_key, thumbnail_data, file_size, old_mtime)
            
            # 使用新的 mtime 读取应返回 None
            cached = db.get_thumbnail_if_valid(path_key, file_size, new_mtime)
            
            assert cached is None, "Cache should be invalidated when mtime changes"


class TestThumbnailGeneration:
    """缩略图生成测试"""
    
    def test_generate_file_thumbnail(self):
        """测试文件缩略图生成"""
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            # 创建测试图片
            img = Image.new('RGB', (500, 500), color='red')
            img.save(f, format='PNG')
            temp_path = f.name
        
        try:
            thumbnail = generate_file_thumbnail(temp_path)
            
            assert thumbnail is not None
            
            # 验证是 WebP 格式
            thumb_img = Image.open(io.BytesIO(thumbnail))
            assert thumb_img.format == 'WEBP'
        finally:
            os.unlink(temp_path)
