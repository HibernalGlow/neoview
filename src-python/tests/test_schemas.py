"""
数据模型测试
Property 5: Directory Listing Metadata
Validates: Requirements 7.1
"""
import pytest
from hypothesis import given, strategies as st, settings
import orjson

from models.schemas import (
    FileEntry,
    FileInfo,
    ArchiveEntry,
    DirectorySnapshotResponse,
    BookInfo,
    PageInfo,
    ImageMetadataResponse,
)


# 策略定义
file_entry_strategy = st.builds(
    FileEntry,
    name=st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),
    path=st.text(min_size=1, max_size=200).filter(lambda x: x.strip()),
    size=st.integers(min_value=0, max_value=10**12),
    modified=st.integers(min_value=0, max_value=2**31),
    created=st.one_of(st.none(), st.integers(min_value=0, max_value=2**31)),
    is_dir=st.booleans(),
    is_image=st.booleans(),
    is_archive=st.booleans(),
    is_video=st.booleans(),
    is_epub=st.booleans(),
)


class TestFileEntrySchema:
    """FileEntry 模型测试"""
    
    @given(file_entry_strategy)
    @settings(max_examples=100)
    def test_file_entry_serialization_roundtrip(self, entry: FileEntry):
        """
        Property 5: Directory Listing Metadata
        FileEntry 序列化往返应保持一致
        Validates: Requirements 7.1
        """
        # 序列化
        json_bytes = orjson.dumps(entry.model_dump())
        
        # 反序列化
        data = orjson.loads(json_bytes)
        restored = FileEntry(**data)
        
        # 验证
        assert restored.name == entry.name
        assert restored.path == entry.path
        assert restored.size == entry.size
        assert restored.modified == entry.modified
        assert restored.is_dir == entry.is_dir
        assert restored.is_image == entry.is_image
        assert restored.is_archive == entry.is_archive
        assert restored.is_video == entry.is_video
    
    @given(file_entry_strategy)
    @settings(max_examples=100)
    def test_file_entry_has_required_fields(self, entry: FileEntry):
        """
        Property 5: Directory Listing Metadata
        FileEntry 应包含所有必需字段
        Validates: Requirements 7.1
        """
        data = entry.model_dump()
        
        # 验证必需字段存在
        assert "name" in data
        assert "path" in data
        assert "size" in data
        assert "modified" in data
        assert "is_dir" in data
        assert "is_image" in data
        assert "is_archive" in data
        assert "is_video" in data


class TestDirectorySnapshotResponse:
    """DirectorySnapshotResponse 模型测试"""
    
    @given(st.lists(file_entry_strategy, min_size=0, max_size=10))
    @settings(max_examples=50)
    def test_snapshot_serialization_roundtrip(self, items: list[FileEntry]):
        """目录快照序列化往返"""
        snapshot = DirectorySnapshotResponse(
            items=items,
            mtime=1234567890,
            cached=False,
        )
        
        json_bytes = orjson.dumps(snapshot.model_dump())
        data = orjson.loads(json_bytes)
        restored = DirectorySnapshotResponse(**data)
        
        assert len(restored.items) == len(items)
        assert restored.mtime == snapshot.mtime
        assert restored.cached == snapshot.cached
