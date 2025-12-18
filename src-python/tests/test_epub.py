"""
EPUB 支持测试
Property 15: EPUB Image Order
Validates: Requirements 10.3
"""
import pytest
from hypothesis import given, strategies as st, settings
import tempfile
import zipfile
import os
from pathlib import Path

from core.epub_manager import list_epub_images, get_epub_image


def create_test_epub(path: str, image_names: list[str]):
    """创建测试 EPUB 文件"""
    with zipfile.ZipFile(path, 'w') as zf:
        # mimetype
        zf.writestr('mimetype', 'application/epub+zip')
        
        # container.xml
        container_xml = '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>'''
        zf.writestr('META-INF/container.xml', container_xml)
        
        # content.opf
        manifest_items = []
        spine_items = []
        for i, name in enumerate(image_names):
            item_id = f"img{i}"
            manifest_items.append(
                f'<item id="{item_id}" href="images/{name}" media-type="image/jpeg"/>'
            )
            spine_items.append(f'<itemref idref="{item_id}"/>')
        
        content_opf = f'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test EPUB</dc:title>
  </metadata>
  <manifest>
    {chr(10).join(manifest_items)}
  </manifest>
  <spine>
    {chr(10).join(spine_items)}
  </spine>
</package>'''
        zf.writestr('OEBPS/content.opf', content_opf)
        
        # 图片文件
        for name in image_names:
            zf.writestr(f'OEBPS/images/{name}', b'fake image data')


class TestEpubImageOrder:
    """EPUB 图片顺序测试"""
    
    def test_epub_image_order_preserved(self):
        """
        Property 15: EPUB Image Order
        EPUB 图片应按阅读顺序返回
        Validates: Requirements 10.3
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            epub_path = os.path.join(tmpdir, "test.epub")
            image_names = ["page1.jpg", "page2.jpg", "page3.jpg"]
            
            create_test_epub(epub_path, image_names)
            
            # 获取图片列表
            images = list_epub_images(epub_path)
            
            # 验证顺序
            result_names = [img.name for img in images]
            assert result_names == image_names, \
                f"Image order not preserved: {result_names} != {image_names}"
    
    @given(st.lists(
        st.from_regex(r'page[0-9]+\.jpg', fullmatch=True),
        min_size=1,
        max_size=10,
        unique=True,
    ))
    @settings(max_examples=20)
    def test_epub_preserves_all_images(self, image_names: list[str]):
        """
        Property 15: EPUB Image Order
        应保留所有图片
        Validates: Requirements 10.3
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            epub_path = os.path.join(tmpdir, "test.epub")
            
            create_test_epub(epub_path, image_names)
            
            images = list_epub_images(epub_path)
            result_names = {img.name for img in images}
            
            assert result_names == set(image_names), \
                f"Missing images: {set(image_names) - result_names}"


class TestEpubExtraction:
    """EPUB 提取测试"""
    
    def test_get_epub_image(self):
        """测试获取 EPUB 图片"""
        with tempfile.TemporaryDirectory() as tmpdir:
            epub_path = os.path.join(tmpdir, "test.epub")
            
            with zipfile.ZipFile(epub_path, 'w') as zf:
                zf.writestr('mimetype', 'application/epub+zip')
                zf.writestr('test_image.jpg', b'test image content')
            
            data = get_epub_image(epub_path, 'test_image.jpg')
            assert data == b'test image content'
