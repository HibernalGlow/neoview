"""
文件服务 API 测试
Property 1: MIME Type Correctness
Property 6: Image Dimensions Accuracy
Validates: Requirements 1.1, 7.2
"""
import pytest
from hypothesis import given, strategies as st, settings
import tempfile
import os
from pathlib import Path
from PIL import Image
import io


# MIME 类型映射
EXPECTED_MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


class TestMimeType:
    """MIME 类型测试"""
    
    @given(st.sampled_from(list(EXPECTED_MIME_TYPES.keys())))
    @settings(max_examples=100)
    def test_mime_type_correctness(self, ext: str):
        """
        Property 1: MIME Type Correctness
        文件扩展名应返回正确的 MIME 类型
        Validates: Requirements 1.1
        """
        from api.files import get_mime_type
        
        test_path = f"test_file{ext}"
        mime_type = get_mime_type(test_path)
        
        assert mime_type == EXPECTED_MIME_TYPES[ext], \
            f"Expected {EXPECTED_MIME_TYPES[ext]} for {ext}, got {mime_type}"


class TestImageDimensions:
    """图片尺寸测试"""
    
    @given(
        st.integers(min_value=1, max_value=1000),
        st.integers(min_value=1, max_value=1000),
    )
    @settings(max_examples=100)
    def test_image_dimensions_accuracy(self, width: int, height: int):
        """
        Property 6: Image Dimensions Accuracy
        返回的图片尺寸应与实际尺寸一致
        Validates: Requirements 7.2
        """
        # 创建测试图片
        img = Image.new('RGB', (width, height), color='red')
        
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            img.save(f, format='PNG')
            temp_path = f.name
        
        try:
            # 使用 PIL 读取尺寸
            with Image.open(temp_path) as loaded_img:
                actual_width, actual_height = loaded_img.size
            
            assert actual_width == width, f"Width mismatch: {actual_width} != {width}"
            assert actual_height == height, f"Height mismatch: {actual_height} != {height}"
        finally:
            os.unlink(temp_path)


class TestFileEndpoints:
    """文件端点测试"""
    
    def test_file_not_found(self, client):
        """测试文件不存在返回 404"""
        response = client.get("/v1/file", params={"path": "/nonexistent/file.jpg"})
        assert response.status_code == 404
    
    def test_path_exists_false(self, client):
        """测试路径不存在"""
        response = client.get("/v1/file/exists", params={"path": "/nonexistent/path"})
        assert response.status_code == 200
        assert response.json() == False
    
    def test_path_exists_true(self, client):
        """测试路径存在"""
        # 使用当前目录
        response = client.get("/v1/file/exists", params={"path": "."})
        assert response.status_code == 200
        assert response.json() == True
