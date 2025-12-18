"""
EPUB 管理器
解析 EPUB 结构，提取图片列表
"""
import zipfile
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree as ET

from models.schemas import EpubEntry

# EPUB 命名空间
NAMESPACES = {
    'opf': 'http://www.idpf.org/2007/opf',
    'dc': 'http://purl.org/dc/elements/1.1/',
    'container': 'urn:oasis:names:tc:opendocument:xmlns:container',
}

# 图片 MIME 类型
IMAGE_MEDIA_TYPES = {
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
}


def get_rootfile_path(epub_path: str) -> Optional[str]:
    """获取 EPUB 根文件路径"""
    try:
        with zipfile.ZipFile(epub_path, 'r') as zf:
            container_xml = zf.read('META-INF/container.xml')
            root = ET.fromstring(container_xml)
            
            rootfile = root.find('.//container:rootfile', NAMESPACES)
            if rootfile is not None:
                return rootfile.get('full-path')
    except Exception:
        pass
    return None


def list_epub_images(epub_path: str) -> list[EpubEntry]:
    """
    列出 EPUB 中的图片
    按阅读顺序返回
    """
    images = []
    
    try:
        rootfile_path = get_rootfile_path(epub_path)
        if not rootfile_path:
            return images
        
        with zipfile.ZipFile(epub_path, 'r') as zf:
            # 读取 OPF 文件
            opf_content = zf.read(rootfile_path)
            root = ET.fromstring(opf_content)
            
            # 获取 OPF 文件所在目录
            opf_dir = str(Path(rootfile_path).parent)
            if opf_dir == '.':
                opf_dir = ''
            
            # 解析 manifest
            manifest = {}
            for item in root.findall('.//opf:manifest/opf:item', NAMESPACES):
                item_id = item.get('id')
                href = item.get('href')
                media_type = item.get('media-type')
                
                if item_id and href:
                    # 构建完整路径
                    if opf_dir:
                        full_path = f"{opf_dir}/{href}"
                    else:
                        full_path = href
                    
                    manifest[item_id] = {
                        'href': full_path,
                        'media_type': media_type,
                    }
            
            # 解析 spine 获取阅读顺序
            spine_items = []
            for itemref in root.findall('.//opf:spine/opf:itemref', NAMESPACES):
                idref = itemref.get('idref')
                if idref and idref in manifest:
                    spine_items.append(idref)
            
            # 收集图片
            order = 0
            seen_images = set()
            
            # 首先按 spine 顺序处理
            for item_id in spine_items:
                item = manifest[item_id]
                if item['media_type'] in IMAGE_MEDIA_TYPES:
                    if item['href'] not in seen_images:
                        seen_images.add(item['href'])
                        images.append(EpubEntry(
                            path=item['href'],
                            name=Path(item['href']).name,
                            media_type=item['media_type'],
                            order=order,
                        ))
                        order += 1
            
            # 然后添加 manifest 中的其他图片
            for item_id, item in manifest.items():
                if item['media_type'] in IMAGE_MEDIA_TYPES:
                    if item['href'] not in seen_images:
                        seen_images.add(item['href'])
                        images.append(EpubEntry(
                            path=item['href'],
                            name=Path(item['href']).name,
                            media_type=item['media_type'],
                            order=order,
                        ))
                        order += 1
    
    except Exception:
        pass
    
    return images


def get_epub_image(epub_path: str, inner_path: str) -> bytes:
    """获取 EPUB 中的图片"""
    with zipfile.ZipFile(epub_path, 'r') as zf:
        return zf.read(inner_path)
