"""
书籍管理器
管理书籍（文件夹/压缩包/EPUB）的打开、导航、排序
"""
from pathlib import Path
from typing import Optional
from natsort import natsorted, ns
from PIL import Image
import io

from models.schemas import BookInfo, PageInfo
from core.fs_manager import is_image_file, get_images_in_directory
from core.archive_manager import list_archive_contents, extract_file, detect_archive_type
from core.epub_manager import list_epub_images


class BookManager:
    """书籍管理器"""
    
    def __init__(self):
        self._current_book: Optional[BookInfo] = None
        self._sort_mode: str = "name"  # "name" | "date" | "size"
    
    def open_book(self, path: str) -> BookInfo:
        """打开书籍"""
        p = Path(path)
        
        if not p.exists():
            raise FileNotFoundError(f"路径不存在: {path}")
        
        # 判断书籍类型
        if p.is_dir():
            book_type = "folder"
            pages = self._load_folder_pages(path)
        elif p.suffix.lower() == ".epub":
            book_type = "epub"
            pages = self._load_epub_pages(path)
        elif detect_archive_type(path):
            book_type = "archive"
            pages = self._load_archive_pages(path)
        else:
            raise ValueError(f"不支持的书籍类型: {path}")
        
        # 排序
        pages = self._sort_pages(pages)
        
        # 更新索引
        for idx, page in enumerate(pages):
            page.index = idx
        
        self._current_book = BookInfo(
            path=str(p.absolute()),
            name=p.name,
            book_type=book_type,
            pages=pages,
            current_page=0,
            total_pages=len(pages),
        )
        
        return self._current_book
    
    def close_book(self):
        """关闭当前书籍"""
        self._current_book = None
    
    def get_current_book(self) -> Optional[BookInfo]:
        """获取当前书籍"""
        return self._current_book
    
    def navigate_to_page(self, page_index: int) -> int:
        """跳转到指定页"""
        if not self._current_book:
            raise ValueError("没有打开的书籍")
        
        if page_index < 0:
            page_index = 0
        elif page_index >= self._current_book.total_pages:
            page_index = self._current_book.total_pages - 1
        
        self._current_book.current_page = page_index
        return page_index
    
    def next_page(self) -> int:
        """下一页"""
        if not self._current_book:
            raise ValueError("没有打开的书籍")
        
        return self.navigate_to_page(self._current_book.current_page + 1)
    
    def previous_page(self) -> int:
        """上一页"""
        if not self._current_book:
            raise ValueError("没有打开的书籍")
        
        return self.navigate_to_page(self._current_book.current_page - 1)
    
    def set_sort_mode(self, sort_mode: str) -> BookInfo:
        """设置排序模式"""
        if sort_mode not in {"name", "date", "size"}:
            raise ValueError(f"不支持的排序模式: {sort_mode}")
        
        self._sort_mode = sort_mode
        
        if self._current_book:
            # 重新排序
            self._current_book.pages = self._sort_pages(self._current_book.pages)
            # 更新索引
            for idx, page in enumerate(self._current_book.pages):
                page.index = idx
        
        return self._current_book
    
    def _load_folder_pages(self, path: str) -> list[PageInfo]:
        """加载文件夹页面"""
        images = get_images_in_directory(path)
        pages = []
        
        for img_path in images:
            p = Path(img_path)
            pages.append(PageInfo(
                path=img_path,
                name=p.name,
                index=0,
            ))
        
        return pages
    
    def _load_archive_pages(self, path: str) -> list[PageInfo]:
        """加载压缩包页面"""
        entries = list_archive_contents(path)
        pages = []
        
        for entry in entries:
            if entry.is_image:
                pages.append(PageInfo(
                    path=entry.path,
                    name=entry.name,
                    index=0,
                ))
        
        return pages
    
    def _load_epub_pages(self, path: str) -> list[PageInfo]:
        """加载 EPUB 页面"""
        images = list_epub_images(path)
        pages = []
        
        for img in images:
            pages.append(PageInfo(
                path=img.path,
                name=img.name,
                index=img.order,
            ))
        
        return pages
    
    def _sort_pages(self, pages: list[PageInfo]) -> list[PageInfo]:
        """排序页面"""
        if self._sort_mode == "name":
            return natsorted(pages, key=lambda x: x.name.lower(), alg=ns.IGNORECASE)
        elif self._sort_mode == "date":
            # 对于压缩包和 EPUB，保持原顺序
            return pages
        elif self._sort_mode == "size":
            # 对于压缩包和 EPUB，保持原顺序
            return pages
        return pages
    
    def get_page_dimensions(self, page_index: int) -> tuple[int, int]:
        """获取页面尺寸"""
        if not self._current_book:
            raise ValueError("没有打开的书籍")
        
        if page_index < 0 or page_index >= self._current_book.total_pages:
            raise ValueError(f"页面索引越界: {page_index}")
        
        page = self._current_book.pages[page_index]
        
        try:
            if self._current_book.book_type == "folder":
                with Image.open(page.path) as img:
                    return img.width, img.height
            elif self._current_book.book_type == "archive":
                data = extract_file(self._current_book.path, page.path)
                with Image.open(io.BytesIO(data)) as img:
                    return img.width, img.height
            elif self._current_book.book_type == "epub":
                from core.epub_manager import get_epub_image
                data = get_epub_image(self._current_book.path, page.path)
                with Image.open(io.BytesIO(data)) as img:
                    return img.width, img.height
        except Exception:
            pass
        
        return 0, 0


# 全局实例
_book_manager: Optional[BookManager] = None


def get_book_manager() -> BookManager:
    """获取全局书籍管理器"""
    global _book_manager
    if _book_manager is None:
        _book_manager = BookManager()
    return _book_manager
