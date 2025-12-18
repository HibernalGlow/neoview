"""
EMM (Eagle Media Manager) API
提供 EMM 数据库和元数据管理功能
"""
import os
import json
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()


class EMMDatabase(BaseModel):
    """EMM 数据库信息"""
    path: str
    name: str
    size: int = 0


class EMMRatingData(BaseModel):
    """评分数据"""
    path: str
    rating: int


class EMMManualTags(BaseModel):
    """手动标签"""
    path: str
    tags: list[str]


class AITranslation(BaseModel):
    """AI 翻译数据"""
    path: str
    translation: str
    source_lang: str = "auto"
    target_lang: str = "zh"


@router.get("/emm/databases")
async def find_emm_databases() -> list[EMMDatabase]:
    """查找 EMM 数据库"""
    # 搜索常见位置
    databases = []
    
    # 检查用户目录下的 .eagle 文件夹
    home = Path.home()
    eagle_paths = [
        home / ".eagle",
        home / "Documents" / "Eagle",
        home / "Pictures" / "Eagle",
    ]
    
    for base_path in eagle_paths:
        if base_path.exists():
            # 查找 .library 文件夹
            for item in base_path.iterdir():
                if item.is_dir() and item.suffix == ".library":
                    databases.append(EMMDatabase(
                        path=str(item),
                        name=item.stem,
                        size=0
                    ))
    
    return databases


@router.get("/emm/setting-file")
async def find_emm_setting_file() -> Optional[str]:
    """查找 EMM 设置文件"""
    # 检查常见位置
    home = Path.home()
    possible_paths = [
        home / ".neoview" / "emm-settings.json",
        home / ".config" / "neoview" / "emm-settings.json",
        Path.cwd() / "emm-settings.json",
    ]
    
    for path in possible_paths:
        if path.exists():
            return str(path)
    
    return None


@router.get("/emm/json")
async def get_emm_json(path: str = Query(..., description="文件路径")) -> dict:
    """获取 EMM JSON 数据"""
    file_path = Path(path)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    # 查找对应的 .emm.json 文件
    emm_path = file_path.with_suffix(file_path.suffix + ".emm.json")
    if not emm_path.exists():
        # 尝试其他命名方式
        emm_path = file_path.parent / f"{file_path.stem}.emm.json"
    
    if not emm_path.exists():
        return {}
    
    try:
        with open(emm_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取 EMM 数据失败: {e}")


@router.get("/emm/metadata")
async def load_emm_metadata(path: str = Query(..., description="文件路径")) -> dict:
    """加载 EMM 元数据"""
    return await get_emm_json(path)


@router.post("/emm/save")
async def save_emm_json(data: dict) -> dict:
    """保存 EMM JSON 数据"""
    path = data.get("path")
    if not path:
        raise HTTPException(status_code=400, detail="缺少 path 参数")
    
    file_path = Path(path)
    emm_path = file_path.with_suffix(file_path.suffix + ".emm.json")
    
    try:
        # 移除 path 字段，只保存数据
        save_data = {k: v for k, v in data.items() if k != "path"}
        
        with open(emm_path, "w", encoding="utf-8") as f:
            json.dump(save_data, f, ensure_ascii=False, indent=2)
        
        return {"success": True, "path": str(emm_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存 EMM 数据失败: {e}")


@router.post("/emm/rating")
async def update_rating_data(data: EMMRatingData) -> dict:
    """更新评分数据"""
    file_path = Path(data.path)
    emm_path = file_path.with_suffix(file_path.suffix + ".emm.json")
    
    # 读取现有数据
    existing = {}
    if emm_path.exists():
        try:
            with open(emm_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            pass
    
    # 更新评分
    existing["rating"] = data.rating
    
    # 保存
    try:
        with open(emm_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存评分失败: {e}")


@router.post("/emm/manual-tags")
async def update_manual_tags(data: EMMManualTags) -> dict:
    """更新手动标签"""
    file_path = Path(data.path)
    emm_path = file_path.with_suffix(file_path.suffix + ".emm.json")
    
    # 读取现有数据
    existing = {}
    if emm_path.exists():
        try:
            with open(emm_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            pass
    
    # 更新标签
    existing["manualTags"] = data.tags
    
    # 保存
    try:
        with open(emm_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存标签失败: {e}")


@router.post("/emm/ai-translation")
async def save_ai_translation(data: AITranslation) -> dict:
    """保存 AI 翻译"""
    file_path = Path(data.path)
    emm_path = file_path.with_suffix(file_path.suffix + ".emm.json")
    
    # 读取现有数据
    existing = {}
    if emm_path.exists():
        try:
            with open(emm_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            pass
    
    # 更新翻译
    existing["aiTranslation"] = {
        "text": data.translation,
        "sourceLang": data.source_lang,
        "targetLang": data.target_lang,
    }
    
    # 保存
    try:
        with open(emm_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存翻译失败: {e}")


# ===== Rating Data API（从缩略图数据库读取）=====

@router.get("/emm/rating-data")
async def get_rating_data(path: str = Query(..., description="文件路径")) -> Optional[str]:
    """获取单个文件的 rating_data"""
    # 尝试从 .emm.json 文件读取
    file_path = Path(path)
    emm_path = file_path.with_suffix(file_path.suffix + ".emm.json")
    
    if emm_path.exists():
        try:
            with open(emm_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                # 返回整个 rating 相关数据的 JSON 字符串
                rating_data = {
                    "rating": data.get("rating"),
                    "ratingDate": data.get("ratingDate"),
                }
                return json.dumps(rating_data)
        except Exception:
            pass
    
    return None


class BatchRatingRequest(BaseModel):
    """批量获取评分请求"""
    paths: list[str]


@router.post("/emm/rating-data/batch")
async def batch_get_rating_data(request: BatchRatingRequest) -> dict[str, Optional[str]]:
    """批量获取 rating_data"""
    result = {}
    
    for path in request.paths:
        file_path = Path(path)
        emm_path = file_path.with_suffix(file_path.suffix + ".emm.json")
        
        if emm_path.exists():
            try:
                with open(emm_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    rating_data = {
                        "rating": data.get("rating"),
                        "ratingDate": data.get("ratingDate"),
                    }
                    result[path] = json.dumps(rating_data)
            except Exception:
                result[path] = None
        else:
            result[path] = None
    
    return result


@router.get("/emm/rating-data/prefix")
async def get_rating_data_by_prefix(
    prefix: str = Query(..., description="目录前缀")
) -> list[tuple[str, Optional[str]]]:
    """获取指定目录下所有条目的 rating_data"""
    result = []
    prefix_path = Path(prefix)
    
    if not prefix_path.exists() or not prefix_path.is_dir():
        return result
    
    # 遍历目录下的所有 .emm.json 文件
    for emm_file in prefix_path.glob("*.emm.json"):
        try:
            # 还原原始文件路径
            original_name = emm_file.stem  # 去掉 .emm.json
            # 查找对应的原始文件
            for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".zip", ".rar", ".7z", ".cbz", ".cbr"]:
                original_path = prefix_path / (original_name.replace(".emm", "") + ext)
                if original_path.exists():
                    break
            else:
                original_path = prefix_path / original_name
            
            with open(emm_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                rating_data = {
                    "rating": data.get("rating"),
                    "ratingDate": data.get("ratingDate"),
                }
                result.append((str(original_path), json.dumps(rating_data)))
        except Exception:
            continue
    
    return result
