#!/usr/bin/env python3
"""
Python + pyvips 缩略图系统测试脚本
"""

import asyncio
import os
import sys
import time
import pathlib
from typing import List

# 添加当前目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from thumbnail_service import ThumbnailManager, EnsureReq

def create_test_images() -> List[str]:
    """创建测试图片"""
    test_dir = pathlib.Path("test_images")
    test_dir.mkdir(exist_ok=True)
    
    # 使用 pyvips 创建测试图片
    import pyvips
    
    test_images = []
    
    # 创建不同尺寸的测试图片
    sizes = [
        (100, 100, "small"),
        (500, 500, "medium"),
        (2000, 2000, "large"),
        (4000, 3000, "wide")
    ]
    
    for width, height, name in sizes:
        image_path = test_dir / f"test_{name}.png"
        if not image_path.exists():
            # 创建渐变图片
            image = pyvips.Image.black(width, height).draw_rect([255], 0, 0, width, height)
            image.write_to_file(str(image_path))
        test_images.append(str(image_path))
    
    # 创建测试压缩包
    import zipfile
    archive_path = test_dir / "test_archive.zip"
    if not archive_path.exists():
        with zipfile.ZipFile(archive_path, 'w') as zf:
            for img_path in test_images[:2]:  # 只添加前两张
                zf.write(img_path, pathlib.Path(img_path).name)
    test_images.append(str(archive_path))
    
    return test_images

async def test_thumbnail_generation():
    """测试缩略图生成"""
    print("🧪 开始测试 Python + pyvips 缩略图系统")
    
    # 创建测试图片
    test_images = create_test_images()
    print(f"✅ 创建了 {len(test_images)} 个测试文件")
    
    # 初始化缩略图管理器
    db_path = "test_thumbnails.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    
    manager = ThumbnailManager(db_path, max_workers=4)
    print("✅ 缩略图管理器初始化完成")
    
    # 测试单个图片生成
    print("\n📸 测试单个图片缩略图生成...")
    start_time = time.time()
    
    for i, img_path in enumerate(test_images):
        is_archive = img_path.endswith('.zip')
        req = EnsureReq(
            bookpath=f"test_{i}",
            source_path=img_path,
            is_folder=False,
            is_archive=is_archive,
            source_mtime=int(os.path.getmtime(img_path))
        )
        
        try:
            webp_bytes = await manager.ensure_thumbnail(req)
            print(f"  ✅ {pathlib.Path(img_path).name} -> {len(webp_bytes)} bytes")
        except Exception as e:
            print(f"  ❌ {pathlib.Path(img_path).name} -> {e}")
    
    elapsed = time.time() - start_time
    print(f"⏱️ 单个生成耗时: {elapsed:.2f} 秒")
    
    # 测试缓存命中
    print("\n🎯 测试缓存命中...")
    start_time = time.time()
    
    for i, img_path in enumerate(test_images):
        is_archive = img_path.endswith('.zip')
        req = EnsureReq(
            bookpath=f"test_{i}",
            source_path=img_path,
            is_folder=False,
            is_archive=is_archive,
            source_mtime=int(os.path.getmtime(img_path))
        )
        
        try:
            webp_bytes = await manager.ensure_thumbnail(req)
            print(f"  ✅ {pathlib.Path(img_path).name} -> {len(webp_bytes)} bytes (缓存)")
        except Exception as e:
            print(f"  ❌ {pathlib.Path(img_path).name} -> {e}")
    
    elapsed = time.time() - start_time
    print(f"⏱️ 缓存命中耗时: {elapsed:.2f} 秒")
    
    # 测试压缩包首图扫描
    print("\n📦 测试压缩包首图早停扫描...")
    archive_path = next(p for p in test_images if p.endswith('.zip'))
    
    # 检查压缩包内容
    import zipfile
    with zipfile.ZipFile(archive_path) as zf:
        all_files = zf.namelist()
        print(f"  📋 压缩包内容: {all_files}")
    
    req = EnsureReq(
        bookpath="test_archive",
        source_path=archive_path,
        is_folder=False,
        is_archive=True,
        source_mtime=int(os.path.getmtime(archive_path))
    )
    
    start_time = time.time()
    try:
        webp_bytes = await manager.ensure_thumbnail(req)
        elapsed = time.time() - start_time
        print(f"  ✅ 压缩包首图 -> {len(webp_bytes)} bytes (耗时 {elapsed:.2f}s)")
    except Exception as e:
        print(f"  ❌ 压缩包首图 -> {e}")
    
    # 清理测试文件
    print("\n🧹 清理测试文件...")
    import shutil
    if os.path.exists("test_images"):
        shutil.rmtree("test_images")
    if os.path.exists(db_path):
        os.remove(db_path)
    
    print("✅ 测试完成！")

if __name__ == "__main__":
    # 检查依赖
    try:
        import pyvips
        print("✅ pyvips 已安装")
    except ImportError:
        print("❌ 请先安装 pyvips: pip install pyvips")
        sys.exit(1)
    
    # 运行测试
    asyncio.run(test_thumbnail_generation())