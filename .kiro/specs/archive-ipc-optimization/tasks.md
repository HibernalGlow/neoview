# Implementation Plan

- [x] 1. 创建压缩包索引缓存模块


  - [x] 1.1 创建 `archive_index.rs` 模块，定义 `ArchiveIndexEntry` 和 `ArchiveIndex` 数据结构


    - 定义索引条目结构（name, entry_index, size, compressed_size, modified, is_dir, is_image）
    - 定义索引结构（archive_path, archive_mtime, archive_size, entries HashMap, ordered_entries）
    - _Requirements: 1.1, 8.1_
  - [x] 1.2 实现 `ArchiveIndexCache` 缓存管理器

    - 实现 LRU 缓存淘汰策略
    - 实现缓存有效性检查（基于 mtime 和 size）
    - 实现缓存统计功能
    - _Requirements: 1.3, 1.4, 5.1_
  - [x] 1.3 编写属性测试：LRU 淘汰正确性


    - **Property 4: LRU eviction correctness**
    - **Validates: Requirements 1.3, 5.1**

- [x] 2. 实现 RAR 索引构建器


  - [x] 2.1 创建 `RarIndexBuilder` 结构体


    - 实现 `build` 方法，遍历 RAR 条目构建索引
    - 支持进度回调
    - _Requirements: 1.1, 2.1_
  - [x] 2.2 实现 RAR 索引随机访问


    - 修改 `extract_file_from_rar` 使用索引定位
    - 实现 `extract_rar_by_index` 方法，根据索引位置提取文件
    - _Requirements: 1.2, 7.2_
  - [x] 2.3 编写属性测试：RAR 索引查找一致性


    - **Property 1: Index lookup consistency (RAR)**
    - **Validates: Requirements 1.1, 1.2**

- [x] 3. 实现 7z 索引构建器

  - [x] 3.1 创建 `SevenZIndexBuilder` 结构体

    - 实现 `build` 方法，遍历 7z 条目构建索引
    - 支持进度回调
    - _Requirements: 1.1, 2.1_
  - [x] 3.2 实现 7z 索引随机访问

    - 修改 `extract_file_from_7z` 使用索引定位
    - 实现基于索引的快速提取
    - _Requirements: 1.2, 7.3_
  - [x] 3.3 编写属性测试：7z 索引查找一致性

    - **Property 1: Index lookup consistency (7z)**
    - **Validates: Requirements 1.1, 1.2**

- [x] 4. Checkpoint - 确保索引功能测试通过


  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 实现索引缓存失效机制


  - [x] 5.1 实现文件修改检测

    - 获取文件 mtime 和 size
    - 比较缓存的 mtime/size 与当前值
    - _Requirements: 1.4, 1.5_
  - [x] 5.2 实现自动重建逻辑

    - 检测到修改时自动触发重建
    - 重建期间返回旧索引或等待
    - _Requirements: 1.5_
  - [x] 5.3 编写属性测试：索引缓存有效性和失效


    - **Property 2: Index cache validity**
    - **Property 3: Index invalidation on modification**
    - **Validates: Requirements 1.4, 1.5**

- [x] 6. 实现流式传输管理器

  - [x] 6.1 创建 `stream_transfer.rs` 模块


    - 定义 `TransferChunk` 和 `TransferProgress` 结构
    - 定义 `TransferState` 状态结构
    - _Requirements: 3.1, 3.2_
  - [x] 6.2 实现 `StreamTransferManager`

    - 实现分块传输逻辑（默认 256KB 块大小）
    - 实现进度计算和报告
    - 实现并发传输限制
    - _Requirements: 3.1, 3.2, 5.2_
  - [x] 6.3 实现传输取消功能

    - 支持取消正在进行的传输
    - 释放相关资源
    - _Requirements: 3.5_
  - [x] 6.4 编写属性测试：流式传输数据完整性

    - **Property 5: Streaming transfer data integrity (round-trip)**
    - **Validates: Requirements 3.3**

  - [x] 6.5 编写属性测试：进度报告单调性
    - **Property 6: Progress reporting monotonicity**
    - **Validates: Requirements 2.1, 3.2**

  - [x] 6.6 编写属性测试：并发传输限制
    - **Property 7: Concurrent transfer limiting**
    - **Validates: Requirements 5.2**

- [x] 7. Checkpoint - 确保流式传输测试通过

  - Ensure all tests pass, ask the user if questions arise.



- [x] 8. 集成到 ArchiveManager






  - [x] 8.1 添加索引缓存到 ArchiveManager

    - 在 ArchiveManager 中添加 `index_cache` 字段
    - 修改构造函数初始化索引缓存
    - _Requirements: 7.1_

  - [x] 8.2 修改 `extract_file_from_rar` 使用索引

    - 自动检测索引可用性
    - 有索引时使用索引访问，无索引时回退到顺序访问
    - _Requirements: 7.2, 7.4_
  - [x] 8.3 修改 `extract_file_from_7z` 使用索引



    - 自动检测索引可用性
    - 有索引时使用索引访问，无索引时回退到顺序访问
    - _Requirements: 7.3, 7.4_

  - [x] 8.4 编写属性测试：API 向后兼容性

    - **Property 8: API backward compatibility**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [ ] 9. 实现前端流式接收
  - [ ] 9.1 创建 `streamImageFromArchive` API
    - 使用 Tauri Channel 接收分块数据
    - 组装 chunks 为完整 Blob
    - _Requirements: 3.1, 3.3_
  - [ ] 9.2 实现进度回调
    - 接收后端进度事件
    - 更新 UI 进度显示
    - _Requirements: 3.2_
  - [ ] 9.3 实现取消功能
    - 用户导航时取消传输
    - 清理未完成的 chunks
    - _Requirements: 3.5_

- [ ] 10. 添加 Tauri 命令
  - [ ] 10.1 添加索引相关命令
    - `build_archive_index` - 手动构建索引
    - `get_index_cache_stats` - 获取缓存统计
    - `clear_index_cache` - 清除索引缓存
    - _Requirements: 2.3_
  - [ ] 10.2 添加流式传输命令
    - `stream_image_from_archive` - 流式传输图片
    - `cancel_stream_transfer` - 取消传输
    - `get_transfer_progress` - 获取传输进度
    - _Requirements: 3.1, 3.2, 3.5_

- [ ] 11. 实现元数据缓存
  - [ ] 11.1 修改 `list_contents` 使用索引
    - 有索引时直接返回索引中的元数据
    - 无索引时构建索引后返回
    - _Requirements: 8.2_
  - [ ] 11.2 编写属性测试：元数据完整性
    - **Property 9: Metadata completeness**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [ ] 12. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

