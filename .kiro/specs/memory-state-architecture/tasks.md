# Implementation Plan

## 1. 添加依赖和基础设施

- [x] 1.1 添加必要的 Cargo 依赖
  - 在 `src-tauri/Cargo.toml` 中添加 `lru = "0.12"`, `memmap2 = "0.9"`, `lz4_flex = "0.11"`, `sysinfo = "0.31"`
  - 确保 `proptest = "1.4"` 在 dev-dependencies 中
  - _Requirements: 1.1, 2.1, 3.1_

## 2. 实现 LruImageCache

- [x] 2.1 创建 LruImageCache 核心结构
  - 创建 `src-tauri/src/core/lru_image_cache.rs`
  - 实现 `LruImageCache` 结构体，使用 `lru::LruCache` 和 `Arc<RwLock<>>`
  - 实现 `new()`, `get()`, `set()`, `stats()` 方法
  - _Requirements: 1.1, 1.3, 1.4_

- [ ]* 2.2 编写属性测试：LRU 淘汰顺序
  - **Property 1: LRU Eviction Order**
  - **Validates: Requirements 1.1, 1.3, 1.4**

- [x] 2.3 实现内存压力感知功能
  - 使用 `sysinfo` 获取系统可用内存
  - 实现 `check_memory_pressure()` 和 `evict()` 方法
  - 添加可配置的内存压力阈值
  - _Requirements: 1.2, 1.5_

- [ ]* 2.4 编写属性测试：内存压力淘汰
  - **Property 2: Memory Pressure Eviction**
  - **Validates: Requirements 1.2**

- [x] 2.5 实现 CacheEntry 序列化
  - 为 `CacheEntry` 实现 `Serialize` 和 `Deserialize`
  - _Requirements: 1.6_

- [ ]* 2.6 编写属性测试：缓存条目 Round-Trip
  - **Property 3: Cache Entry Round-Trip**
  - **Validates: Requirements 1.6**

- [x]* 2.7 编写 LruImageCache 单元测试
  - 测试基本 get/set 操作
  - 测试 LRU 淘汰顺序
  - 测试内存压力响应
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

## 3. Checkpoint - 确保所有测试通过
- [x] 3. Ensure all tests pass, ask the user if questions arise.

## 4. 实现 memmap2 大图加载

- [x] 4.1 增强 ImageLoader 支持 memmap2
  - 修改 `src-tauri/src/core/image_loader.rs`
  - 添加 `large_file_threshold` 配置
  - 实现 `load_with_mmap()` 方法
  - 实现自动选择加载方式的逻辑
  - _Requirements: 2.1, 2.2, 2.5_

- [ ]* 4.2 编写属性测试：大文件阈值加载
  - **Property 4: Large File Threshold Loading**
  - **Validates: Requirements 2.1**

- [x] 4.3 实现 mmap 回退逻辑
  - 当 mmap 失败时回退到传统加载
  - 添加日志记录
  - _Requirements: 2.3_

- [ ]* 4.4 编写属性测试：Mmap 尺寸一致性
  - **Property 5: Mmap Dimension Consistency**
  - **Validates: Requirements 2.4**

- [x]* 4.5 编写 ImageLoader 单元测试
  - 测试阈值判断逻辑
  - 测试 mmap 回退逻辑
  - _Requirements: 2.1, 2.3, 2.4_

## 5. Checkpoint - 确保所有测试通过
- [x] 5. Ensure all tests pass, ask the user if questions arise.

## 6. 实现 LZ4 压缩缩略图存储

- [x] 6.1 增强 ThumbnailDb 支持 LZ4 压缩
  - 修改 `src-tauri/src/core/thumbnail_db.rs`
  - 实现 `compress_blob()` 和 `decompress_blob()` 辅助函数
  - 修改 `save_thumbnail` 系列方法添加压缩
  - 修改 `load_thumbnail` 系列方法添加解压
  - _Requirements: 3.1, 3.2_

- [ ]* 6.2 编写属性测试：缩略图压缩 Round-Trip
  - **Property 6: Thumbnail Compression Round-Trip**
  - **Validates: Requirements 3.1, 3.2, 3.5**

- [x] 6.3 实现压缩错误处理
  - 压缩失败时存储未压缩数据
  - 解压失败时返回错误
  - 添加日志记录
  - _Requirements: 3.3, 3.4_

- [x] 6.4 实现压缩统计功能
  - 添加 `CompressionStats` 结构体
  - 实现 `get_compression_stats()` 方法
  - 修改数据库表结构添加 `compressed_size` 列
  - _Requirements: 3.6_

- [ ]* 6.5 编写 ThumbnailDb 单元测试
  - 测试压缩/解压功能
  - 测试统计信息准确性
  - 测试错误处理路径
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

## 7. Checkpoint - 确保所有测试通过
- [x] 7. Ensure all tests pass, ask the user if questions arise.

## 8. 实现 AppContext 统一状态管理

- [x] 8.1 创建 AppContext 核心结构
  - 创建 `src-tauri/src/core/app_context.rs`
  - 定义 `AppContext` 结构体，包含所有核心状态的 `Arc<RwLock<>>` 引用
  - 定义 `AppConfig` 配置结构体
  - 实现 `new()` 构造函数
  - _Requirements: 4.1, 4.2_

- [x] 8.2 实现 AppContext 状态管理方法
  - 实现 `list_managed_states()` 方法
  - 实现配置序列化/反序列化方法
  - _Requirements: 4.5, 4.6_

- [ ]* 8.3 编写属性测试：AppContext 配置 Round-Trip
  - **Property 9: AppContext Config Round-Trip**
  - **Validates: Requirements 4.5**

- [x]* 8.4 编写 AppContext 单元测试
  - 测试初始化完整性
  - 测试状态列表
  - 测试配置序列化
  - _Requirements: 4.1, 4.5, 4.6_

## 9. 实现读写锁优化

- [x] 9.1 重构 ImageCache 使用 RwLock
  - 将 `Mutex<HashMap>` 替换为 `RwLock<LruCache>`
  - 确保读操作使用 `read()` 锁
  - 确保写操作使用 `write()` 锁
  - _Requirements: 5.1, 5.2, 5.4, 5.5_

- [ ]* 9.2 编写属性测试：并发读访问
  - **Property 7: Concurrent Read Access**
  - **Validates: Requirements 4.3, 5.1**

- [ ]* 9.3 编写属性测试：写排他性
  - **Property 8: Write Exclusivity**
  - **Validates: Requirements 4.4, 5.2, 5.4, 5.5**

- [ ]* 9.4 编写并发访问单元测试
  - 测试多线程读取不阻塞
  - 测试写操作排他性
  - _Requirements: 5.1, 5.2, 5.4, 5.5_

## 10. Checkpoint - 确保所有测试通过
- [x] 10. Ensure all tests pass, ask the user if questions arise.

## 11. 集成到 Tauri 应用

- [ ] 11.1 重构 lib.rs 使用 AppContext
  - 修改 `src-tauri/src/lib.rs`
  - 将分散的 State 初始化迁移到 AppContext
  - 使用 `app.manage(AppContext)` 替代多个独立的 `app.manage()`
  - _Requirements: 4.1, 4.2_
  - **注意**: 此任务需要大量重构现有代码，建议渐进式迁移

- [ ] 11.2 更新 Commands 使用 AppContext
  - 修改相关 commands 从 AppContext 获取状态
  - 确保向后兼容性
  - _Requirements: 4.2_
  - **注意**: 此任务依赖 11.1，需要逐步迁移

- [x] 11.3 添加 mod.rs 导出
  - 更新 `src-tauri/src/core/mod.rs` 导出新模块
  - _Requirements: 4.1_

## 12. Final Checkpoint - 确保所有测试通过
- [x] 12. Ensure all tests pass, ask the user if questions arise.
