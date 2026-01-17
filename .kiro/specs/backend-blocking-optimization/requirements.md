# 需求文档：后端阻塞优化

## 简介

本规范旨在识别并优化 NeoView 后端中可能阻塞前端的操作，特别是全局互斥锁、串行处理和同步 I/O 操作。目标是提升应用响应性和用户体验。

## 术语表

- **Backend**: Tauri Rust 后端，处理文件 I/O、图像解码、压缩包解压等操作
- **Frontend**: Svelte 前端，负责 UI 渲染和用户交互
- **IPC**: 进程间通信，前端通过 Tauri 命令调用后端
- **Mutex**: 互斥锁，用于保护共享资源的并发访问
- **RwLock**: 读写锁，允许多个读者或单个写者
- **Blocking_Operation**: 阻塞操作，会暂停当前线程直到完成
- **Async_Runtime**: 异步运行时，Tokio 提供的异步任务调度器
- **Job_Engine**: 任务引擎，用于管理后台任务队列
- **Page_Manager**: 页面管理器，负责页面加载和缓存
- **Archive_Manager**: 压缩包管理器，负责解压和读取压缩包
- **Thumbnail_Service**: 缩略图服务，负责生成和缓存缩略图
- **Upscale_Service**: 放大服务，负责图像放大处理

## 需求

### 需求 1: 识别全局互斥锁瓶颈

**用户故事:** 作为开发者，我想要识别所有可能导致前端阻塞的全局互斥锁，以便优化并发性能。

#### 验收标准

1. WHEN 分析后端代码 THEN THE System SHALL 列出所有使用 `Arc<Mutex<T>>` 的全局状态
2. WHEN 检查命令处理函数 THEN THE System SHALL 识别持有锁时间过长的操作
3. WHEN 评估锁粒度 THEN THE System SHALL 标记可以细化的粗粒度锁
4. WHEN 检查锁顺序 THEN THE System SHALL 识别潜在的死锁风险

### 需求 2: 优化 BookManager 和 ImageLoader 的锁竞争

**用户故事:** 作为用户，我想要在浏览图片时获得流畅的体验，不希望因为后端锁竞争而卡顿。

#### 验收标准

1. WHEN 多个命令同时访问 BookManager THEN THE System SHALL 避免串行化所有请求
2. WHEN 读取书籍信息 THEN THE System SHALL 使用读写锁或无锁数据结构
3. WHEN 加载图片 THEN THE System SHALL 最小化持锁时间
4. WHEN 切换页面 THEN THE System SHALL 不阻塞其他读取操作

### 需求 3: 异步化同步 I/O 操作

**用户故事:** 作为用户，我想要在加载大文件时前端仍然保持响应，不希望 UI 冻结。

#### 验收标准

1. WHEN 读取文件系统 THEN THE System SHALL 使用 `tokio::fs` 或 `spawn_blocking`
2. WHEN 解压压缩包 THEN THE System SHALL 在后台线程执行
3. WHEN 解码图片 THEN THE System SHALL 使用异步任务
4. WHEN 生成缩略图 THEN THE System SHALL 不阻塞主线程

### 需求 4: 优化 PageManager 的锁策略

**用户故事:** 作为用户，我想要快速翻页，不希望因为缓存锁而等待。

#### 验收标准

1. WHEN 检查缓存 THEN THE System SHALL 使用 `try_lock` 避免阻塞
2. WHEN 更新缓存 THEN THE System SHALL 最小化临界区
3. WHEN 预加载页面 THEN THE System SHALL 不阻塞当前页面加载
4. WHEN 多个页面同时加载 THEN THE System SHALL 支持并发访问

### 需求 5: 优化 ArchiveManager 的并发性

**用户故事:** 作为用户，我想要在查看压缩包内的图片时获得快速响应，不希望因为串行解压而等待。

#### 验收标准

1. WHEN 从压缩包读取多个文件 THEN THE System SHALL 支持并发解压
2. WHEN 解压大文件 THEN THE System SHALL 使用流式处理
3. WHEN 缓存解压结果 THEN THE System SHALL 使用细粒度锁
4. WHEN 切换书籍 THEN THE System SHALL 快速释放旧资源

### 需求 6: 优化 ThumbnailService 的任务调度

**用户故事:** 作为用户，我想要快速看到缩略图，不希望因为串行生成而等待。

#### 验收标准

1. WHEN 生成多个缩略图 THEN THE System SHALL 使用并行处理
2. WHEN 缩略图队列满 THEN THE System SHALL 优先处理可见区域
3. WHEN 切换文件夹 THEN THE System SHALL 取消旧任务
4. WHEN 缩略图生成失败 THEN THE System SHALL 不阻塞其他任务

### 需求 7: 优化 UpscaleService 的资源管理

**用户故事:** 作为用户，我想要在使用放大功能时不影响正常浏览，不希望放大任务占用所有资源。

#### 验收标准

1. WHEN 放大任务运行 THEN THE System SHALL 限制并发数量
2. WHEN 切换页面 THEN THE System SHALL 取消不需要的放大任务
3. WHEN 放大队列满 THEN THE System SHALL 使用优先级调度
4. WHEN 放大失败 THEN THE System SHALL 快速释放资源

### 需求 8: 优化数据库操作

**用户故事:** 作为用户，我想要在访问缩略图数据库时获得快速响应，不希望因为数据库锁而等待。

#### 验收标准

1. WHEN 查询数据库 THEN THE System SHALL 使用连接池
2. WHEN 批量操作 THEN THE System SHALL 使用事务
3. WHEN 读取数据 THEN THE System SHALL 不阻塞写入
4. WHEN 数据库繁忙 THEN THE System SHALL 使用超时机制

### 需求 9: 实现请求去重

**用户故事:** 作为用户，我想要避免重复加载相同的资源，不希望浪费带宽和 CPU。

#### 验收标准

1. WHEN 多个请求加载同一页面 THEN THE System SHALL 合并请求
2. WHEN 请求正在处理 THEN THE System SHALL 返回相同的 Future
3. WHEN 请求完成 THEN THE System SHALL 通知所有等待者
4. WHEN 请求失败 THEN THE System SHALL 允许重试

### 需求 10: 监控和诊断

**用户故事:** 作为开发者，我想要监控后端性能，以便识别瓶颈。

#### 验收标准

1. WHEN 执行命令 THEN THE System SHALL 记录执行时间
2. WHEN 持有锁 THEN THE System SHALL 记录持锁时间
3. WHEN 任务排队 THEN THE System SHALL 记录队列长度
4. WHEN 性能下降 THEN THE System SHALL 提供诊断信息
