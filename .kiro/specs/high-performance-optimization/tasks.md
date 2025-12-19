# 高性能优化实施计划

## Phase 1: Custom Protocol + Memmap (P0 - 最高优先级)

- [x] 1. 添加依赖到 Cargo.toml
  - [x] 1.1 添加 `memmap2 = "0.9"` (已存在，确认版本)
  - [x] 1.2 添加 `mime_guess = "2.0"` 用于 MIME 类型检测
  - [x] 1.3 添加 `urlencoding = "2.1"` 用于 URL 编解码
  - _Requirements: US-1_

- [x] 2. 实现内存映射压缩包模块
  - [x] 2.1 创建 `src-tauri/src/core/mmap_archive.rs`
    - 实现 `MmapArchive` 结构体
    - 实现 `MmapCache` LRU 缓存管理
    - 实现 `SmartFileReader` 智能文件读取
  - [x] 2.2 编写单元测试 (3 个测试通过)
  - _Requirements: US-1, AC-1.1_

- [x] 3. 实现 Custom Protocol
  - [x] 3.1 创建 `src-tauri/src/core/custom_protocol.rs`
    - 实现 `neoview://image/{book_path_hash}/{entry_index}` 协议
    - 实现 `neoview://file/{path_hash}` 协议
    - 实现 `neoview://thumb/{key}` 协议
    - 实现 `PathRegistry` 路径注册表
  - [x] 3.2 在 `lib.rs` 中注册协议
  - [x] 3.3 编写单元测试 (3 个测试通过)
  - _Requirements: US-1, AC-1.3, US-5, AC-5.1_

- [x] 4. 前端集成 Custom Protocol
  - [x] 4.1 创建 `src/lib/api/imageProtocol.ts`
    - 实现 `registerBookPath()` 函数
    - 实现 `getArchiveImageUrl()` 函数
    - 实现 `getFileImageUrl()` 函数
    - 实现 `getThumbUrl()` 函数
    - 实现 `preloadImages()` 预加载函数
  - [x] 4.2 创建 `src-tauri/src/commands/protocol_commands.rs`
    - 实现 `register_book_path` 命令
    - 实现 `batch_register_paths` 命令
    - 实现 `get_mmap_cache_stats` 命令
    - 实现 `clear_mmap_cache` 命令
  - [ ] 4.3 修改图片组件使用 Custom Protocol (待集成)
  - _Requirements: US-5, AC-5.2, AC-5.3_

- [x] 5. Checkpoint - Phase 1 基础测试
  - [x] Rust 编译通过
  - [x] TypeScript 编译通过
  - [x] 6 个单元测试通过
  - [ ] 性能基准测试对比 (待完成)

## Phase 2: Rkyv + Stretto 缓存优化 (P1)

- [ ] 6. 添加依赖
  - [ ] 6.1 添加 `rkyv = { version = "0.8", features = ["validation"] }`
  - [ ] 6.2 添加 `stretto = "0.8"`
  - _Requirements: US-2, US-3_

- [ ] 7. 实现 Rkyv 零拷贝索引
  - [ ] 7.1 创建 `src-tauri/src/core/rkyv_index.rs`
    - 定义 `RkyvArchiveIndex` 和 `RkyvIndexEntry`
    - 实现序列化/零拷贝访问
  - [ ] 7.2 修改 `archive_index_cache.rs` 使用 Rkyv
  - [ ] 7.3 编写属性测试：零拷贝访问正确性
  - _Requirements: US-2, AC-2.1, AC-2.2_

- [ ] 8. 实现 Stretto TinyLFU 缓存
  - [ ] 8.1 创建 `src-tauri/src/core/stretto_cache.rs`
    - 实现 `ImageCache` 结构体
    - 实现 `IndexCache` 结构体
  - [ ] 8.2 替换现有 LRU 缓存
  - [ ] 8.3 编写属性测试：缓存命中率
  - _Requirements: US-3, AC-3.1, AC-3.2_

- [ ] 9. Checkpoint - Phase 2 测试
  - 确保所有测试通过
  - 缓存命中率对比测试

## Phase 3: Mimalloc + Bstr + Puffin (P2)

- [ ] 10. 集成 Mimalloc 分配器
  - [ ] 10.1 添加 `mimalloc = { version = "0.1", default-features = false }`
  - [ ] 10.2 在 `main.rs` 中设置全局分配器
  - [ ] 10.3 内存使用基准测试
  - _Requirements: US-3, AC-3.3_

- [ ] 11. 使用 Bstr 优化路径处理
  - [ ] 11.1 添加 `bstr = "1.10"`
  - [ ] 11.2 修改路径处理代码使用 `BStr`
  - [ ] 11.3 性能对比测试
  - _Requirements: US-4, AC-4.1, AC-4.2_

- [ ] 12. 集成 Puffin 性能分析
  - [ ] 12.1 添加 `puffin = "0.19"` (仅 dev 依赖)
  - [ ] 12.2 在关键路径添加性能标记
  - [ ] 12.3 创建性能分析报告命令
  - _Requirements: US-6, AC-6.1, AC-6.2_

- [ ] 13. Checkpoint - Phase 3 测试
  - 确保所有测试通过
  - 完整性能基准测试

## Phase 4: SharedArrayBuffer (P3 - 实验性)

- [ ] 14. 配置 COOP/COEP 头
  - [ ] 14.1 修改 Tauri 配置添加安全头
  - [ ] 14.2 测试 SharedArrayBuffer 可用性
  - _Requirements: US-5_

- [ ] 15. 实现 SharedArrayBuffer 传输
  - [ ] 15.1 创建 `src/lib/utils/sharedBuffer.ts`
    - 实现 SharedArrayBuffer 池
    - 实现与 Custom Protocol 的集成
  - [ ] 15.2 修改图片加载使用 SharedArrayBuffer
  - [ ] 15.3 添加回退机制（不支持时使用普通方式）
  - _Requirements: US-5, AC-5.2_

- [ ] 16. Final Checkpoint
  - 完整功能测试
  - 性能基准测试报告
  - 文档更新
