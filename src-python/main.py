"""
NeoView Python Backend - FastAPI 入口
提供图片查看、压缩包处理、缩略图生成等服务
"""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import files, directory, archive, thumbnail, metadata, book, video, stream, upscale, epub, system, emm

# 创建 FastAPI 应用
app = FastAPI(
    title="NeoView Backend",
    description="Python backend for NeoView image viewer",
    version="1.0.0",
)

# 配置 CORS - 允许 Tauri 和浏览器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tauri 使用 tauri://localhost
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(files.router, prefix="/v1", tags=["files"])
app.include_router(directory.router, prefix="/v1", tags=["directory"])
app.include_router(archive.router, prefix="/v1", tags=["archive"])
app.include_router(thumbnail.router, prefix="/v1", tags=["thumbnail"])
app.include_router(metadata.router, prefix="/v1", tags=["metadata"])
app.include_router(book.router, prefix="/v1", tags=["book"])
app.include_router(video.router, prefix="/v1", tags=["video"])
app.include_router(stream.router, prefix="/v1", tags=["stream"])
app.include_router(upscale.router, prefix="/v1", tags=["upscale"])
app.include_router(epub.router, prefix="/v1", tags=["epub"])
app.include_router(system.router, prefix="/v1", tags=["system"])
app.include_router(emm.router, prefix="/v1", tags=["emm"])


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok", "service": "neoview-backend"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info",
    )
