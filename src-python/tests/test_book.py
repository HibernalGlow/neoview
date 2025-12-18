"""
书籍管理 API 测试
Property 9: Book Page Consistency
Validates: Requirements (Book Management)
"""
import pytest
from hypothesis import given, strategies as st, settings
import tempfile
import zipfile
import os
from pathlib import Path
from PIL import Image

from core.book_manager import BookManager


class TestBookPageConsistency:
    """书籍页面一致性测试"""
    
    @given(st.integers(min_value=1, max_value=20))
    @settings(max_examples=50)
    def test_book_page_indices_contiguous(self, num_pages: int):
        """
        Property 9: Book Page Consistency
        页面索引应从 0 到 total_pages-1 连续
        Validates: Requirements (Book Management)
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            # 创建测试图片
            for i in range(num_pages):
                img = Image.new('RGB', (100, 100), color='red')
                img.save(os.path.join(tmpdir, f"page_{i:03d}.jpg"))
            
            # 打开书籍
            manager = BookManager()
            book = manager.open_book(tmpdir)
            
            # 验证页面索引连续
            indices = [page.index for page in book.pages]
            expected = list(range(num_pages))
            
            assert indices == expected, \
                f"Page indices not contiguous: {indices} != {expected}"
            
            # 验证 total_pages
            assert book.total_pages == num_pages
    
    def test_book_navigation(self):
        """测试书籍导航"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 创建测试图片
            for i in range(5):
                img = Image.new('RGB', (100, 100), color='blue')
                img.save(os.path.join(tmpdir, f"page_{i}.jpg"))
            
            manager = BookManager()
            book = manager.open_book(tmpdir)
            
            # 测试导航
            assert manager.navigate_to_page(2) == 2
            assert manager.get_current_book().current_page == 2
            
            # 测试下一页
            assert manager.next_page() == 3
            
            # 测试上一页
            assert manager.previous_page() == 2
            
            # 测试边界
            assert manager.navigate_to_page(-1) == 0
            assert manager.navigate_to_page(100) == 4
    
    def test_book_from_archive(self):
        """测试从压缩包打开书籍"""
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "book.zip")
            
            # 创建包含图片的 ZIP
            with zipfile.ZipFile(zip_path, 'w') as zf:
                for i in range(3):
                    img = Image.new('RGB', (100, 100), color='green')
                    buffer = io.BytesIO()
                    img.save(buffer, format='JPEG')
                    zf.writestr(f"page_{i}.jpg", buffer.getvalue())
            
            manager = BookManager()
            book = manager.open_book(zip_path)
            
            assert book.book_type == "archive"
            assert book.total_pages == 3


import io
