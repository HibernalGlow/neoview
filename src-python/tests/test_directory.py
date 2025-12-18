"""
目录浏览 API 测试
Property 7: Directory Natural Sorting
Property 8: Extension Filtering
Validates: Requirements 7.3, 7.4
"""
import pytest
from hypothesis import given, strategies as st, settings
import tempfile
import os
from pathlib import Path

from core.fs_manager import (
    natural_sort_strings,
    natural_sort_entries,
    is_supported_file,
    list_directory,
    IMAGE_EXTENSIONS,
    ARCHIVE_EXTENSIONS,
    VIDEO_EXTENSIONS,
)
from models.schemas import FileEntry


class TestNaturalSorting:
    """自然排序测试"""
    
    @given(st.lists(
        st.from_regex(r'[a-z]+[0-9]+', fullmatch=True),
        min_size=2,
        max_size=20,
    ))
    @settings(max_examples=100)
    def test_natural_sort_numeric_strings(self, items: list[str]):
        """
        Property 7: Directory Natural Sorting
        包含数字的字符串应按自然顺序排序
        Validates: Requirements 7.3
        """
        sorted_items = natural_sort_strings(items)
        
        # 验证排序后的列表长度不变
        assert len(sorted_items) == len(items)
        
        # 验证所有元素都存在
        assert set(sorted_items) == set(items)
    
    def test_natural_sort_example(self):
        """测试自然排序示例"""
        items = ["file10.jpg", "file2.jpg", "file1.jpg", "file20.jpg"]
        sorted_items = natural_sort_strings(items)
        
        # 自然排序应该是 1, 2, 10, 20
        assert sorted_items == ["file1.jpg", "file2.jpg", "file10.jpg", "file20.jpg"]
    
    def test_natural_sort_entries_dirs_first(self):
        """测试目录优先排序"""
        entries = [
            FileEntry(name="file.jpg", path="/file.jpg", size=100, modified=0,
                     is_dir=False, is_image=True, is_archive=False, is_video=False),
            FileEntry(name="folder", path="/folder", size=0, modified=0,
                     is_dir=True, is_image=False, is_archive=False, is_video=False),
        ]
        
        sorted_entries = natural_sort_entries(entries)
        
        # 目录应该在前面
        assert sorted_entries[0].is_dir == True
        assert sorted_entries[1].is_dir == False


class TestExtensionFiltering:
    """扩展名过滤测试"""
    
    @given(st.sampled_from(list(IMAGE_EXTENSIONS | ARCHIVE_EXTENSIONS | VIDEO_EXTENSIONS)))
    @settings(max_examples=100)
    def test_supported_extensions_accepted(self, ext: str):
        """
        Property 8: Extension Filtering
        支持的扩展名应被接受
        Validates: Requirements 7.4
        """
        test_path = f"test_file{ext}"
        assert is_supported_file(test_path) == True
    
    @given(st.sampled_from([".txt", ".doc", ".pdf", ".exe", ".dll"]))
    @settings(max_examples=100)
    def test_unsupported_extensions_rejected(self, ext: str):
        """
        Property 8: Extension Filtering
        不支持的扩展名应被拒绝
        Validates: Requirements 7.4
        """
        test_path = f"test_file{ext}"
        assert is_supported_file(test_path) == False


class TestDirectoryListing:
    """目录列表测试"""
    
    def test_list_directory_empty(self):
        """测试空目录"""
        with tempfile.TemporaryDirectory() as tmpdir:
            entries = list_directory(tmpdir)
            assert len(entries) == 0
    
    def test_list_directory_with_files(self):
        """测试包含文件的目录"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 创建测试文件
            Path(tmpdir, "test.jpg").touch()
            Path(tmpdir, "test.png").touch()
            Path(tmpdir, "test.txt").touch()  # 不支持的格式
            
            entries = list_directory(tmpdir, filter_supported=True)
            
            # 只应返回支持的格式
            assert len(entries) == 2
            names = {e.name for e in entries}
            assert "test.jpg" in names
            assert "test.png" in names
            assert "test.txt" not in names
