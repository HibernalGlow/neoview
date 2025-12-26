# Requirements Document

## Introduction

本规范定义了对 NeoView 项目中超过 800 行的 Rust 源文件进行模块化重构的需求。目标是将 7 个大文件拆分成更小、更易维护的模块，同时保持功能完整性和 API 兼容性。

## Glossary

- **Refactor_System**: 负责执行文件拆分和模块化重构的系统
- **Module**: 单一职责的 Rust 模块文件，不超过 800 行
- **Public_API**: 对外暴露的函数、结构体和类型定义
- **Internal_API**: 模块内部使用的私有函数和类型

## Target Files

需要重构的文件及其当前行数：

| 文件 | 行数 | 功能描述 |
|------|------|----------|
| fs_commands.rs | 2096 | 文件系统命令 |
| thumbnail_db.rs | 1976 | 缩略图数据库 |
| benchmark_commands.rs | 1610 | 基准测试命令 |
| archive.rs | 1457 | 归档文件处理 |
| thumbnail_commands.rs | 1295 | 缩略图命令 |
| thumbnail_service_v3.rs | 1353 | 缩略图服务 V3 |
| upscale_service.rs | 1249 | 图像放大服务 |

## Requirements

### Requirement 1: 文件行数限制

**User Story:** As a developer, I want all source files to be under 800 lines, so that the codebase is easier to read and maintain.

#### Acceptance Criteria

1. WHEN the Refactor_System completes refactoring, THE resulting Module files SHALL each contain no more than 800 lines of code
2. WHEN a file exceeds 800 lines, THE Refactor_System SHALL split it into multiple logical modules
3. THE Refactor_System SHALL preserve all existing functionality during the split

### Requirement 2: 模块化结构

**User Story:** As a developer, I want code organized into logical modules, so that related functionality is grouped together.

#### Acceptance Criteria

1. WHEN splitting a large file, THE Refactor_System SHALL create a directory with the same name as the original file (without extension)
2. THE Refactor_System SHALL create a mod.rs file that re-exports all public items
3. WHEN organizing modules, THE Refactor_System SHALL group related functions and types together
4. THE Refactor_System SHALL use descriptive module names that reflect their purpose

### Requirement 3: API 兼容性

**User Story:** As a developer, I want the refactoring to maintain backward compatibility, so that existing code continues to work.

#### Acceptance Criteria

1. THE Refactor_System SHALL preserve all public function signatures unchanged
2. THE Refactor_System SHALL preserve all public struct and enum definitions unchanged
3. WHEN re-exporting items, THE Refactor_System SHALL use `pub use` to maintain the same import paths
4. IF a breaking change is unavoidable, THEN THE Refactor_System SHALL document the change clearly

### Requirement 4: fs_commands.rs 重构

**User Story:** As a developer, I want fs_commands.rs split into logical modules, so that file system operations are organized by category.

#### Acceptance Criteria

1. THE Refactor_System SHALL create a `fs_commands/` directory
2. THE Refactor_System SHALL split into modules:
   - `mod.rs` - 模块入口和状态定义
   - `read_ops.rs` - 读取操作 (read_directory, get_file_info 等)
   - `write_ops.rs` - 写入操作 (create, delete, rename 等)
   - `cache_ops.rs` - 缓存操作 (directory cache, cache index)
   - `archive_ops.rs` - 压缩包相关操作
   - `types.rs` - 共享类型定义 (FileInfo, FsState 等)
3. WHEN complete, THE resulting modules SHALL each be under 800 lines

### Requirement 5: thumbnail_db.rs 重构

**User Story:** As a developer, I want thumbnail_db.rs split into logical modules, so that database operations are organized by function.

#### Acceptance Criteria

1. THE Refactor_System SHALL create a `thumbnail_db/` directory
2. THE Refactor_System SHALL split into modules:
   - `mod.rs` - 模块入口和 ThumbnailDb 主结构
   - `compression.rs` - LZ4 压缩/解压功能
   - `queries.rs` - 数据库查询操作
   - `maintenance.rs` - 数据库维护操作 (清理、统计等)
   - `types.rs` - 类型定义 (ThumbnailDbStats, ThumbnailDbRecord 等)
3. WHEN complete, THE resulting modules SHALL each be under 800 lines

### Requirement 6: benchmark_commands.rs 重构

**User Story:** As a developer, I want benchmark_commands.rs split into logical modules, so that different benchmark types are separated.

#### Acceptance Criteria

1. THE Refactor_System SHALL create a `benchmark_commands/` directory
2. THE Refactor_System SHALL split into modules:
   - `mod.rs` - 模块入口和通用类型
   - `image_benchmark.rs` - 图像解码基准测试
   - `thumbnail_benchmark.rs` - 缩略图生成基准测试
   - `archive_benchmark.rs` - 压缩包处理基准测试
   - `types.rs` - 共享类型 (BenchmarkResult, BenchmarkReport 等)
3. WHEN complete, THE resulting modules SHALL each be under 800 lines

### Requirement 7: archive.rs 重构

**User Story:** As a developer, I want archive.rs split into logical modules, so that different archive format handlers are separated.

#### Acceptance Criteria

1. THE Refactor_System SHALL create an `archive/` directory
2. THE Refactor_System SHALL split into modules:
   - `mod.rs` - 模块入口和 ArchiveManager 主结构
   - `format.rs` - 格式检测和 ArchiveFormat 枚举
   - `zip_handler.rs` - ZIP/CBZ 格式处理
   - `rar_handler.rs` - RAR/CBR 格式处理
   - `sevenz_handler.rs` - 7Z/CB7 格式处理
   - `types.rs` - 共享类型 (ArchiveEntry, ArchiveMetadata 等)
3. WHEN complete, THE resulting modules SHALL each be under 800 lines

### Requirement 8: thumbnail_commands.rs 重构

**User Story:** As a developer, I want thumbnail_commands.rs split into logical modules, so that thumbnail operations are organized by type.

#### Acceptance Criteria

1. THE Refactor_System SHALL create a `thumbnail_commands/` directory
2. THE Refactor_System SHALL split into modules:
   - `mod.rs` - 模块入口和状态定义
   - `generation.rs` - 缩略图生成命令
   - `retrieval.rs` - 缩略图获取命令
   - `batch_ops.rs` - 批量操作命令
   - `types.rs` - 共享类型定义
3. WHEN complete, THE resulting modules SHALL each be under 800 lines

### Requirement 9: thumbnail_service_v3.rs 重构

**User Story:** As a developer, I want thumbnail_service_v3.rs split into logical modules, so that service components are separated.

#### Acceptance Criteria

1. THE Refactor_System SHALL create a `thumbnail_service_v3/` directory
2. THE Refactor_System SHALL split into modules:
   - `mod.rs` - 模块入口和 ThumbnailService 主结构
   - `config.rs` - 配置相关 (ThumbnailServiceConfig)
   - `worker.rs` - 工作线程池管理
   - `queue.rs` - 任务队列管理
   - `cache.rs` - LRU 内存缓存
   - `types.rs` - 类型定义 (ThumbnailFileType, 任务类型等)
3. WHEN complete, THE resulting modules SHALL each be under 800 lines

### Requirement 10: upscale_service.rs 重构

**User Story:** As a developer, I want upscale_service.rs split into logical modules, so that upscale service components are separated.

#### Acceptance Criteria

1. THE Refactor_System SHALL create an `upscale_service/` directory
2. THE Refactor_System SHALL split into modules:
   - `mod.rs` - 模块入口和 UpscaleService 主结构
   - `config.rs` - 配置相关 (UpscaleServiceConfig)
   - `worker.rs` - 工作线程管理
   - `queue.rs` - 任务队列和优先级管理
   - `events.rs` - 事件 Payload 定义
   - `types.rs` - 类型定义 (UpscaleStatus 等)
3. WHEN complete, THE resulting modules SHALL each be under 800 lines

### Requirement 11: 代码质量

**User Story:** As a developer, I want the refactored code to maintain high quality, so that the codebase remains clean and consistent.

#### Acceptance Criteria

1. THE Refactor_System SHALL preserve all existing comments and documentation
2. THE Refactor_System SHALL add module-level documentation to each new module
3. WHEN splitting code, THE Refactor_System SHALL maintain consistent formatting
4. THE Refactor_System SHALL ensure all imports are correctly updated

### Requirement 12: 编译验证

**User Story:** As a developer, I want the refactored code to compile successfully, so that the project remains functional.

#### Acceptance Criteria

1. WHEN refactoring is complete, THE project SHALL compile without errors using `cargo check`
2. WHEN refactoring is complete, THE project SHALL pass `yarn check` validation
3. IF compilation errors occur, THEN THE Refactor_System SHALL fix them before proceeding
