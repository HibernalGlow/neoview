# Requirements Document

## Introduction

修复 NeoView 应用程序 Release 版本无法启动的问题。当前现象是：Release 版本直接运行时无法启动（窗口不显示），但如果先运行 Dev 版本后，Release 版本就能正常启动。这表明存在某种共享状态（如数据库文件、配置文件、缓存目录等）在首次运行时未能正确初始化。

## Glossary

- **Release 版本**: 使用 `cargo tauri build` 构建的生产版本，隐藏控制台窗口
- **Dev 版本**: 使用 `cargo tauri dev` 运行的开发版本，显示控制台窗口
- **AppData 目录**: 应用程序数据存储目录，通过 `app.path().app_data_dir()` 获取
- **SQLite 数据库**: 用于缓存目录索引和缩略图的本地数据库文件
- **WAL 模式**: SQLite 的 Write-Ahead Logging 模式，可能导致数据库锁定问题

## Requirements

### Requirement 1

**User Story:** As a user, I want the Release version to start successfully on first launch, so that I can use the application without needing to run the Dev version first.

#### Acceptance Criteria

1. WHEN the Release version starts for the first time THEN the NeoView application SHALL create all required directories (AppData, thumbnails, cache) if they do not exist
2. WHEN the AppData directory creation fails THEN the NeoView application SHALL log the error and fall back to a temporary directory
3. WHEN the Release version starts THEN the NeoView application SHALL initialize SQLite databases with proper error handling and retry logic
4. IF a SQLite database file is locked or corrupted THEN the NeoView application SHALL attempt to recover by deleting and recreating the database

### Requirement 2

**User Story:** As a developer, I want to see startup errors in Release mode, so that I can diagnose issues when the application fails to start.

#### Acceptance Criteria

1. WHEN the Release version encounters a startup error THEN the NeoView application SHALL write error details to a log file in the AppData directory
2. WHEN a critical initialization error occurs THEN the NeoView application SHALL display a native error dialog before exiting
3. WHEN the application starts successfully THEN the NeoView application SHALL log the startup sequence with timestamps

### Requirement 3

**User Story:** As a user, I want the application to handle database initialization gracefully, so that corrupted or locked databases don't prevent startup.

#### Acceptance Criteria

1. WHEN opening a SQLite database THEN the NeoView application SHALL set a busy timeout of at least 5000ms to handle concurrent access
2. WHEN the database schema migration fails THEN the NeoView application SHALL backup the old database and create a fresh one
3. WHEN the WAL checkpoint fails THEN the NeoView application SHALL continue with normal operation and retry later

### Requirement 4

**User Story:** As a user, I want the system tray to initialize reliably, so that the application doesn't crash during startup.

#### Acceptance Criteria

1. WHEN the system tray icon fails to load THEN the NeoView application SHALL use a fallback icon or continue without tray functionality
2. WHEN the tray menu creation fails THEN the NeoView application SHALL log the error and continue with basic window functionality
3. IF the tray initialization throws an exception THEN the NeoView application SHALL catch the error and proceed with window-only mode
