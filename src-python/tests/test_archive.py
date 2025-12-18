"""
压缩包处理 API 测试
Property 2: Archive Extraction Round-trip
Property 3: Archive List Sorting
Validates: Requirements 2.2, 2.3, 2.4, 2.6
"""
import pytest
from hypothesis import given, strategies as st, settings
import tempfile
import zipfile
import os
from pathlib import Path

from core.archive_manager import (
    list_archive_contents,
    extract_file,
    detect_archive_type,
)


class TestArchiveExtraction:
    """压缩包提取测试"""
    
    @given(st.binary(min_size=1, max_size=1000))
    @settings(max_examples=100)
    def test_zip_extraction_roundtrip(self, content: bytes):
        """
        Property 2: Archive Extraction Round-trip
        从 ZIP 提取的文件应与原始内容一致
        Validates: Requirements 2.2
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            # 创建 ZIP 文件
            zip_path = os.path.join(tmpdir, "test.zip")
            inner_path = "test_file.bin"
            
            with zipfile.ZipFile(zip_path, 'w') as zf:
                zf.writestr(inner_path, content)
            
            # 提取并验证
            extracted = extract_file(zip_path, inner_path)
            assert extracted == content, "Extracted content does not match original"


class TestArchiveSorting:
    """压缩包排序测试"""
    
    def test_archive_list_natural_sorting(self):
        """
        Property 3: Archive List Sorting
        压缩包内容应按自然顺序排序
        Validates: Requirements 2.6
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "test.zip")
            
            # 创建包含数字文件名的 ZIP
            with zipfile.ZipFile(zip_path, 'w') as zf:
                for name in ["10.jpg", "2.jpg", "1.jpg", "20.jpg"]:
                    zf.writestr(name, b"test")
            
            # 获取列表
            entries = list_archive_contents(zip_path, use_cache=False)
            names = [e.name for e in entries]
            
            # 验证自然排序
            assert names == ["1.jpg", "2.jpg", "10.jpg", "20.jpg"], \
                f"Expected natural sort order, got {names}"
    
    @given(st.lists(
        st.from_regex(r'[a-z]+[0-9]+\.jpg', fullmatch=True),
        min_size=2,
        max_size=10,
        unique=True,
    ))
    @settings(max_examples=50)
    def test_archive_list_preserves_all_entries(self, filenames: list[str]):
        """
        Property 3: Archive List Sorting
        排序后应保留所有条目
        Validates: Requirements 2.6
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "test.zip")
            
            with zipfile.ZipFile(zip_path, 'w') as zf:
                for name in filenames:
                    zf.writestr(name, b"test")
            
            entries = list_archive_contents(zip_path, use_cache=False)
            entry_names = {e.name for e in entries}
            
            assert entry_names == set(filenames), \
                f"Missing entries: {set(filenames) - entry_names}"


class TestArchiveTypeDetection:
    """压缩包类型检测测试"""
    
    @given(st.sampled_from([".zip", ".cbz"]))
    @settings(max_examples=10)
    def test_detect_zip_type(self, ext: str):
        """测试 ZIP 类型检测"""
        assert detect_archive_type(f"test{ext}") == "zip"
    
    @given(st.sampled_from([".rar", ".cbr"]))
    @settings(max_examples=10)
    def test_detect_rar_type(self, ext: str):
        """测试 RAR 类型检测"""
        assert detect_archive_type(f"test{ext}") == "rar"
    
    @given(st.sampled_from([".7z", ".cb7"]))
    @settings(max_examples=10)
    def test_detect_7z_type(self, ext: str):
        """测试 7z 类型检测"""
        assert detect_archive_type(f"test{ext}") == "7z"
