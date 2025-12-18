"""
书籍管理 API
提供书籍打开、导航、排序等功能
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.schemas import BookInfo
from core.book_manager import get_book_manager

router = APIRouter()


class NavigateRequest(BaseModel):
    """导航请求"""
    page_index: int


class SortRequest(BaseModel):
    """排序请求"""
    sort_mode: str


@router.post("/book/open")
async def open_book(path: str = Query(..., description="书籍路径")) -> BookInfo:
    """打开书籍（文件夹/压缩包/EPUB）"""
    try:
        manager = get_book_manager()
        return manager.open_book(path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打开书籍失败: {e}")


@router.post("/book/close")
async def close_book():
    """关闭当前书籍"""
    manager = get_book_manager()
    manager.close_book()
    return {"success": True}


@router.get("/book/current")
async def get_current_book() -> Optional[BookInfo]:
    """获取当前书籍信息"""
    manager = get_book_manager()
    return manager.get_current_book()


@router.post("/book/navigate")
async def navigate_to_page(request: NavigateRequest) -> int:
    """跳转到指定页"""
    try:
        manager = get_book_manager()
        return manager.navigate_to_page(request.page_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/book/next")
async def next_page() -> int:
    """下一页"""
    try:
        manager = get_book_manager()
        return manager.next_page()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/book/previous")
async def previous_page() -> int:
    """上一页"""
    try:
        manager = get_book_manager()
        return manager.previous_page()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/book/sort")
async def set_sort_mode(request: SortRequest) -> BookInfo:
    """设置排序模式"""
    try:
        manager = get_book_manager()
        book = manager.set_sort_mode(request.sort_mode)
        if not book:
            raise HTTPException(status_code=400, detail="没有打开的书籍")
        return book
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
