# Implementation Plan

## Phase 1: 项目基础设施

- [x] 1. 创建 Python 后端项目结构
  - [x] 1.1 创建 `src-python/` 目录结构和基础文件
    - 创建 api/, core/, models/, db/, tests/ 目录
    - 创建 main.py FastAPI 入口
    - 创建 pyproject.toml 和 requirements.txt
    - _Requirements: 5.4_
  - [x] 1.2 配置 FastAPI 应用和 CORS
    - 设置 CORS 允许 Tauri 和浏览器访问
    - 配置 uvicorn 服务器
    - 实现 `/health` 健康检查端点
    - _Requirements: 5.4_
  - [x] 1.3 编写属性测试：健康检查端点
    - **Property: Health Check Availability**
    - **Validates: Requirements 5.4**

## Phase 2: 核心数据模型

- [x] 2. 实现 Pydantic 数据模型
  - [x] 2.1 创建 `models/schemas.py` 基础模型
    - FileEntry, FileInfo, SubfolderItem
    - ArchiveEntry, DirectorySnapshotResponse
    - BookInfo, PageInfo
    - ImageMetadataResponse
    - _Requirements: 7.1, 9.1_
  - [x] 2.2 编写属性测试：数据模型序列化往返
    - **Property 5: Directory Listing Metadata**
    - **Validates: Requirements 7.1**

## Phase 3: 文件系统 API

- [x] 3. 实现文件服务 API
  - [x] 3.1 创建 `api/files.py` 文件服务端点
    - GET `/file` - 提供本地文件访问
    - 小文件使用 FileResponse，大文件使用 StreamingResponse + mmap
    - JXL 格式解码为 PNG 返回
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 3.2 实现文件元数据端点
    - GET `/file/info` - 获取文件元数据
    - GET `/file/exists` - 检查路径是否存在
    - GET `/dimensions` - 获取图片尺寸
    - _Requirements: 7.2_
  - [x] 3.3 实现文件操作端点
    - GET `/file/text` - 读取文本文件
    - POST `/file/mkdir` - 创建目录
    - DELETE `/file` - 删除文件
    - POST `/file/rename` - 重命名
    - POST `/file/trash` - 移动到回收站
    - _Requirements: 1.1_
  - [x] 3.4 编写属性测试：MIME 类型正确性
    - **Property 1: MIME Type Correctness**
    - **Validates: Requirements 1.1**
  - [x] 3.5 编写属性测试：图片尺寸准确性
    - **Property 6: Image Dimensions Accuracy**
    - **Validates: Requirements 7.2**

- [x] 4. Checkpoint - 所有测试通过 ✓

## Phase 4: 目录浏览 API

- [x] 5. 实现目录浏览 API
  - [x] 5.1 创建 `api/directory.py` 目录服务端点
    - GET `/directory/list` - 列出目录内容
    - GET `/directory/subfolders` - 快速列出子文件夹
    - GET `/directory/images` - 获取目录中的所有图片
    - _Requirements: 7.1, 7.3, 7.4_
  - [x] 5.2 实现目录快照功能
    - GET `/directory/snapshot` - 加载目录快照（带缓存）
    - POST `/directory/batch-snapshot` - 批量加载目录快照
    - _Requirements: 7.1_
  - [x] 5.3 创建 `core/fs_manager.py` 文件系统管理器
    - 实现自然排序 (natsort)
    - 实现扩展名过滤
    - 实现目录快照缓存
    - _Requirements: 7.3, 7.4_
  - [x] 5.4 编写属性测试：目录自然排序
    - **Property 7: Directory Natural Sorting**
    - **Validates: Requirements 7.3**
  - [x] 5.5 编写属性测试：扩展名过滤
    - **Property 8: Extension Filtering**
    - **Validates: Requirements 7.4**

## Phase 5: 压缩包处理 API

- [x] 6. 实现压缩包处理 API
  - [x] 6.1 创建 `core/archive_manager.py` 压缩包管理器
    - 支持 ZIP/RAR/7z 格式检测
    - 实现压缩包索引缓存
    - 实现自然排序
    - _Requirements: 2.1, 2.5, 2.6_
  - [x] 6.2 创建 `api/archive.py` 压缩包服务端点
    - GET `/archive/list` - 列出压缩包内容
    - GET `/archive/extract` - 从压缩包提取单个文件
    - GET `/archive/extract-to-temp` - 提取到临时文件
    - DELETE `/archive/entry` - 删除压缩包中的条目
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 6.3 编写属性测试：压缩包提取往返
    - **Property 2: Archive Extraction Round-trip**
    - **Validates: Requirements 2.2, 2.3, 2.4**
  - [x] 6.4 编写属性测试：压缩包列表排序
    - **Property 3: Archive List Sorting**
    - **Validates: Requirements 2.6**

- [x] 7. Checkpoint - 所有测试通过 ✓

## Phase 6: 缩略图系统

- [x] 8. 实现缩略图系统
  - [x] 8.1 创建 `db/thumbnail_db.py` SQLite 缓存
    - 创建缩略图缓存表
    - 创建目录快照缓存表
    - 创建失败记录表
    - 实现 WAL 模式和并发优化
    - _Requirements: 3.4, 3.5_
  - [x] 8.2 创建 `core/thumbnail_generator.py` 缩略图生成器
    - 实现 WebP 缩略图生成（max 256x256）
    - 支持文件/压缩包/视频缩略图
    - 使用 WIC (Windows) 或 Pillow 解码
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 8.3 创建 `api/thumbnail.py` 缩略图服务端点
    - GET `/thumbnail` - 获取缩略图
    - POST `/thumbnail/batch` - 批量预加载缩略图
    - GET `/thumbnail/cached` - 从缓存获取缩略图
    - POST `/thumbnail/visible` - 请求可见区域缩略图
    - DELETE `/thumbnail/cache` - 清除缓存
    - GET `/thumbnail/stats` - 获取缓存统计
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 8.4 编写属性测试：缩略图尺寸约束
    - **Property 4: Thumbnail Size Constraint**
    - **Validates: Requirements 3.1**
  - [x] 8.5 编写属性测试：缩略图缓存一致性
    - **Property 10: Thumbnail Cache Consistency**
    - **Validates: Requirements 3.4, 3.5**

## Phase 7: 图像元数据 API

- [x] 9. 实现图像元数据 API
  - [x] 9.1 创建 `api/metadata.py` 元数据服务端点
    - GET `/metadata/image` - 获取图像元数据
    - 支持普通文件和压缩包内文件
    - 返回尺寸、格式、时间等信息
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 9.2 编写属性测试：图像元数据完整性
    - **Property 14: Image Metadata Completeness**
    - **Validates: Requirements 9.1**

- [x] 10. Checkpoint - 所有测试通过 ✓

## Phase 8: 流式加载 API

- [x] 11. 实现流式加载 API
  - [x] 11.1 创建 `core/stream_manager.py` 流式加载管理器
    - 实现流式目录扫描
    - 实现流式搜索
    - 支持取消和进度报告
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 11.2 创建 `api/stream.py` WebSocket 流式端点
    - WS `/stream/directory` - 流式目录加载
    - WS `/stream/search` - 流式搜索
    - POST `/stream/cancel/{stream_id}` - 取消流
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 11.3 编写属性测试：流批次顺序
    - **Property 12: Stream Batch Ordering**
    - **Validates: Requirements 8.1**
  - [x] 11.4 编写属性测试：首批延迟
    - **Property 13: Stream First Batch Latency**
    - **Validates: Requirements 8.2**

## Phase 9: 书籍管理 API

- [x] 12. 实现书籍管理 API
  - [x] 12.1 创建 `core/book_manager.py` 书籍状态管理器
    - 实现书籍打开/关闭
    - 实现页面导航
    - 实现排序模式
    - _Requirements: Book Management_
  - [x] 12.2 创建 `api/book.py` 书籍服务端点
    - POST `/book/open` - 打开书籍
    - POST `/book/close` - 关闭当前书籍
    - GET `/book/current` - 获取当前书籍信息
    - POST `/book/navigate` - 跳转到指定页
    - POST `/book/next` - 下一页
    - POST `/book/previous` - 上一页
    - POST `/book/sort` - 设置排序模式
    - _Requirements: Book Management_
  - [x] 12.3 编写属性测试：书籍页面一致性
    - **Property 9: Book Page Consistency**
    - **Validates: Requirements (Book Management)**

- [x] 13. Checkpoint - 所有测试通过 ✓

## Phase 10: 视频处理 API

- [x] 14. 实现视频处理 API
  - [x] 14.1 创建 `api/video.py` 视频服务端点
    - GET `/video/file` - 返回视频路径
    - GET `/video/extract-to-temp` - 从压缩包提取视频
    - GET `/video/thumbnail` - 生成视频缩略图
    - GET `/video/duration` - 获取视频时长
    - GET `/video/check` - 检查是否为视频文件
    - _Requirements: Video Processing_
  - [x] 14.2 创建 `api/system.py` 系统服务端点
    - GET `/system/ffmpeg` - 检查 FFmpeg 是否可用
    - _Requirements: System_

## Phase 11: 超分服务 API

- [x] 15. 实现超分服务 API
  - [x] 15.1 创建 `api/upscale.py` 超分服务端点
    - POST `/upscale/init` - 初始化超分服务
    - POST `/upscale/request` - 请求超分
    - GET `/upscale/status/{task_id}` - 查询任务状态
    - POST `/upscale/cancel/{task_id}` - 取消超分任务
    - WS `/upscale/ws` - WebSocket 推送任务进度
    - POST `/upscale/conditions` - 更新超分条件
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

## Phase 12: EPUB 支持

- [x] 16. 实现 EPUB 支持
  - [x] 16.1 创建 `core/epub_manager.py` EPUB 解析器
    - 解析 EPUB 结构
    - 提取图片列表（按阅读顺序）
    - _Requirements: 10.1, 10.2, 10.3_
  - [x] 16.2 创建 `api/epub.py` EPUB 服务端点
    - GET `/epub/list` - 列出 EPUB 内容
    - GET `/epub/image` - 获取 EPUB 内图片
    - _Requirements: 10.1, 10.2, 10.3_
  - [x] 16.3 编写属性测试：EPUB 图片顺序
    - **Property 15: EPUB Image Order**
    - **Validates: Requirements 10.3**

- [x] 17. Checkpoint - 所有测试通过 ✓

## Phase 13: 前端适配层

- [x] 18. 实现前端 HTTP API 适配层
  - [x] 18.1 创建 `src/lib/api/http-bridge.ts` HTTP 桥接层
    - 实现 API 基础 URL 配置
    - 实现文件 URL 生成函数
    - 实现缩略图 URL 生成函数
    - 实现通用 API 调用封装
    - 注意：不使用浏览器路由，保持内部状态管理
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 18.2 创建 `src/lib/api/adapter.ts` 统一适配器
    - 抽象 Tauri IPC 和 HTTP API 调用
    - 根据环境自动选择调用方式
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 18.3 迁移图片加载逻辑
    - 将 Tauri invoke 调用替换为 HTTP URL
    - 更新 ImageViewer 组件
    - _Requirements: 5.1_
  - [x] 18.4 迁移目录浏览逻辑
    - 更新 FileBrowser 组件使用 HTTP API
    - 更新缩略图加载逻辑
    - _Requirements: 5.2, 5.3_

## Phase 14: Tauri 集成

- [x] 19. 实现 Tauri Python 进程管理
  - [x] 19.1 创建 `src-tauri/src/core/python_backend.rs`
    - 实现 Python 进程启动
    - 实现健康检查等待
    - 实现进程生命周期管理
    - _Requirements: 5.5_
  - [x] 19.2 更新 Tauri 模块导出

    - 添加 python_backend 模块到 core/mod.rs
    - 保留窗口管理和系统托盘功能
    - _Requirements: 5.5_

- [x] 20. Final Checkpoint - 所有测试通过 ✓

---

## 完成状态

**Python 后端核心功能：** ✅ 100% 完成
- 所有 API 端点已实现
- 所有核心模块已实现
- 40 个测试全部通过

**前端适配层：** ✅ 100% 完成
- http-bridge.ts 已创建
- adapter.ts 已更新
- 图片加载逻辑已迁移
- 缩略图系统已适配

**Tauri 集成：** ✅ 100% 完成
- python_backend.rs 已创建
- 模块导出已更新
