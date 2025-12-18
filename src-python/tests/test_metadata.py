"""
图像元数据 API 测试
Property 14: Image Metadata Completeness
Validates: Requirements 9.1
"""
import pytest
from hypothesis import given, strategies as st, settings
import tempfile
import os
from PIL import Image
import io

from api.metadata import get_image_metadata_from_data


class TestImageMetadata:
    """图像元数据测试"""
    
    @given(
        st.integers(min_value=1, max_value=1000),
        st.integers(min_value=1, max_value=1000),
        st.sampled_from(['RGB', 'RGBA', 'L']),
    )
    @settings(max_examples=100)
    def test_image_metadata_completeness(self, width: int, height: int, mode: str):
        """
        Property 14: Image Metadata Completeness
        图像元数据应包含必需字段
        Validates: Requirements 9.1
        """
        # 创建测试图片
        img = Image.new(mode, (width, height), color='red' if mode != 'L' else 128)
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        image_data = buffer.getvalue()
        
        # 获取元数据
        metadata = get_image_metadata_from_data(image_data, "/test/image.png")
        
        # 验证必需字段
        assert metadata.path == "/test/image.png"
        assert metadata.name == "image.png"
        assert metadata.size == len(image_data)
        assert metadata.width == width
        assert metadata.height == height
        assert metadata.format is not None
    
    def test_metadata_for_jpeg(self):
        """测试 JPEG 元数据"""
        img = Image.new('RGB', (100, 100), color='blue')
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')
        image_data = buffer.getvalue()
        
        metadata = get_image_metadata_from_data(image_data, "/test/image.jpg")
        
        assert metadata.width == 100
        assert metadata.height == 100
        assert metadata.format == "jpeg"
    
    def test_metadata_for_webp(self):
        """测试 WebP 元数据"""
        img = Image.new('RGB', (200, 150), color='green')
        buffer = io.BytesIO()
        img.save(buffer, format='WEBP')
        image_data = buffer.getvalue()
        
        metadata = get_image_metadata_from_data(image_data, "/test/image.webp")
        
        assert metadata.width == 200
        assert metadata.height == 150
        assert metadata.format == "webp"
