# Requirements Document

## Introduction

本功能旨在复刻 NeeView 的 CLI 参数打开和右键菜单打开功能。当前 NeoView 在通过命令行参数或右键菜单打开文件/文件夹时，会错误地使用系统默认应用打开，而不是在应用内的 folder 卡片中打开。本需求将修复此问题，使 CLI 启动和右键菜单打开能够正确地在应用内打开文件或文件夹。

## Glossary

- **CLI**: Command Line Interface，命令行界面
- **NeoView**: 本项目的图片/漫画查看器应用
- **Folder Card**: 应用内的文件夹卡片视图，用于浏览文件夹内容
- **Book**: 应用内的书籍概念，可以是文件夹或压缩包
- **Context Menu**: Windows 资源管理器的右键菜单
- **Registry**: Windows 注册表，用于配置右键菜单项

## Requirements

### Requirement 1

**User Story:** As a user, I want to open files or folders via CLI arguments, so that I can quickly view content without navigating through the file browser.

#### Acceptance Criteria

1. WHEN NeoView receives a file path as CLI argument THEN NeoView SHALL open the file in the viewer without using system default application
2. WHEN NeoView receives a folder path as CLI argument THEN NeoView SHALL open the folder as a book in the viewer
3. WHEN NeoView receives an archive file path as CLI argument THEN NeoView SHALL open the archive as a book in the viewer
4. WHEN NeoView receives an invalid path as CLI argument THEN NeoView SHALL display an error message and remain in empty state
5. WHEN NeoView is already running and receives a new CLI argument THEN NeoView SHALL focus the existing window and open the new path

### Requirement 2

**User Story:** As a user, I want to open files or folders via Windows context menu, so that I can quickly view content from File Explorer.

#### Acceptance Criteria

1. WHEN user right-clicks a file and selects "Open in NeoView" THEN NeoView SHALL launch and open the file in the viewer
2. WHEN user right-clicks a folder and selects "Open in NeoView" THEN NeoView SHALL launch and open the folder as a book
3. WHEN user right-clicks in folder background and selects "Open in NeoView" THEN NeoView SHALL launch and open the current folder as a book
4. WHEN NeoView is already running and user selects "Open in NeoView" THEN NeoView SHALL focus the existing window and open the selected path

### Requirement 3

**User Story:** As a user, I want to manage context menu registration from within the app, so that I can easily enable or disable the feature.

#### Acceptance Criteria

1. WHEN user enables context menu integration in settings THEN NeoView SHALL register the context menu entries in Windows registry
2. WHEN user disables context menu integration in settings THEN NeoView SHALL remove the context menu entries from Windows registry
3. WHEN NeoView checks context menu status THEN NeoView SHALL accurately report whether context menu entries are registered
4. IF registry modification fails due to permissions THEN NeoView SHALL display an appropriate error message with guidance

### Requirement 4

**User Story:** As a developer, I want the CLI argument handling to be robust, so that various path formats are handled correctly.

#### Acceptance Criteria

1. WHEN NeoView receives a path with spaces THEN NeoView SHALL correctly parse and open the path
2. WHEN NeoView receives a path with special characters THEN NeoView SHALL correctly parse and open the path
3. WHEN NeoView receives a relative path THEN NeoView SHALL resolve it to absolute path and open correctly
4. WHEN NeoView receives a UNC network path THEN NeoView SHALL attempt to open the path correctly
