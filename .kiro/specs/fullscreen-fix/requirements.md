# Requirements Document

## Introduction

本文档定义了修复 NeoView 应用全屏功能的需求。当前存在以下问题：
1. 首次打开应用时，绑定的快捷键（如 F11）无法触发全屏，必须先点击标题栏上的全屏按钮一次后才能使用快捷键
2. 点击标题栏全屏按钮后再次触发全屏时，底部任务栏区域不会被覆盖，会变成黑边
3. 需要实现真正的独占全屏模式，且全屏时周围不应有颜色描边

## Glossary

- **System（系统）**: NeoView 图片查看器应用程序
- **Fullscreen State（全屏状态）**: 应用程序的全屏/窗口模式状态，包括 UI 状态（isFullscreen store）和原生窗口状态
- **Native Window（原生窗口）**: Tauri 框架管理的操作系统级窗口
- **UI State（UI 状态）**: Svelte store 中维护的前端全屏状态
- **Exclusive Fullscreen（独占全屏）**: 窗口完全覆盖屏幕，包括任务栏，无边框无描边
- **Window Manager（窗口管理器）**: 负责管理原生窗口操作的模块（windowManager.ts）

## Requirements

### Requirement 1

**User Story:** As a user, I want to use keyboard shortcuts (like F11) to toggle fullscreen immediately after launching the app, so that I can quickly enter fullscreen mode without clicking any UI elements first.

#### Acceptance Criteria

1. WHEN the application starts THEN the System SHALL synchronize the UI fullscreen state with the native window fullscreen state
2. WHEN a user presses the fullscreen shortcut key (e.g., F11) THEN the System SHALL toggle the fullscreen state regardless of whether the titlebar fullscreen button has been clicked before
3. WHEN the fullscreen state changes via keyboard shortcut THEN the System SHALL update both the UI state and the native window state atomically

### Requirement 2

**User Story:** As a user, I want the fullscreen mode to completely cover the entire screen including the taskbar, so that I have an immersive viewing experience without any distractions.

#### Acceptance Criteria

1. WHEN the System enters fullscreen mode THEN the System SHALL cover the entire screen including the operating system taskbar
2. WHEN the System is in fullscreen mode THEN the System SHALL display no black borders or gaps around the window edges
3. WHEN the System exits fullscreen mode THEN the System SHALL restore the window to its previous size and position

### Requirement 3

**User Story:** As a user, I want the fullscreen window to have no visible borders or outlines, so that the viewing experience is clean and distraction-free.

#### Acceptance Criteria

1. WHEN the System is in fullscreen mode THEN the System SHALL display no colored borders or outlines around the window
2. WHEN the System enters fullscreen mode THEN the System SHALL remove any window decorations that could cause visual artifacts
3. WHEN the System is in fullscreen mode THEN the System SHALL ensure the content area fills the entire screen without any padding or margins

### Requirement 4

**User Story:** As a user, I want the fullscreen state to remain consistent between the UI and the actual window state, so that the fullscreen button and shortcuts always reflect the true state.

#### Acceptance Criteria

1. WHEN the native window fullscreen state changes externally (e.g., via OS controls) THEN the System SHALL update the UI fullscreen state to match
2. WHEN the UI fullscreen state is toggled THEN the System SHALL update the native window fullscreen state to match
3. WHEN the application window gains focus THEN the System SHALL verify and synchronize the fullscreen state if there is a mismatch
