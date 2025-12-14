# Requirements Document

## Introduction

本功能为文件面板的标签栏（FolderTabBar）添加完整的右键菜单功能，类似于浏览器标签页的右键菜单。菜单包含关闭、关闭其他、关闭左侧/右侧、复制、固定、聚焦当前侧边文件等常用操作。同时支持在侧边文件树（FolderTree）中定位当前标签页对应的文件夹。

## Glossary

- **FolderTabBar**: 文件面板顶部的标签栏组件，用于管理多个文件夹页签
- **FolderTree**: 侧边栏的文件夹树组件，显示文件系统的目录结构
- **Tab**: 单个页签，代表一个打开的文件夹路径
- **Pinned Tab**: 固定的页签，不会被批量关闭操作影响
- **Context Menu**: 右键菜单，提供针对特定元素的操作选项

## Requirements

### Requirement 1

**User Story:** As a user, I want to close multiple tabs at once, so that I can quickly clean up my workspace.

#### Acceptance Criteria

1. WHEN a user right-clicks on a tab and selects "关闭" THEN the FolderTabBar SHALL close that specific tab
2. WHEN a user right-clicks on a tab and selects "关闭其他" THEN the FolderTabBar SHALL close all tabs except the right-clicked tab and pinned tabs
3. WHEN a user right-clicks on a tab and selects "关闭左侧" THEN the FolderTabBar SHALL close all tabs to the left of the right-clicked tab except pinned tabs
4. WHEN a user right-clicks on a tab and selects "关闭右侧" THEN the FolderTabBar SHALL close all tabs to the right of the right-clicked tab except pinned tabs
5. WHEN only one non-pinned tab remains THEN the FolderTabBar SHALL disable the "关闭" option for that tab

### Requirement 2

**User Story:** As a user, I want to pin important tabs, so that they are protected from accidental closure.

#### Acceptance Criteria

1. WHEN a user right-clicks on an unpinned tab and selects "固定" THEN the FolderTabBar SHALL mark the tab as pinned and display a pin indicator
2. WHEN a user right-clicks on a pinned tab and selects "取消固定" THEN the FolderTabBar SHALL remove the pinned status from the tab
3. WHILE a tab is pinned THEN the FolderTabBar SHALL display the tab with a visual pin indicator
4. WHILE a tab is pinned THEN the FolderTabBar SHALL exclude the tab from "关闭其他"、"关闭左侧"、"关闭右侧" batch close operations
5. WHEN the application restarts THEN the FolderTabBar SHALL restore the pinned status of previously pinned tabs

### Requirement 3

**User Story:** As a user, I want to duplicate tabs, so that I can work with the same folder in multiple views.

#### Acceptance Criteria

1. WHEN a user right-clicks on a tab and selects "复制页签" THEN the FolderTabBar SHALL create a new tab with the same path and settings as the original tab
2. WHEN a tab is duplicated THEN the FolderTabBar SHALL insert the new tab immediately after the original tab
3. WHEN a tab is duplicated THEN the FolderTabBar SHALL activate the new tab

### Requirement 4

**User Story:** As a user, I want to scroll to and highlight the currently focused item in the file list, so that I can quickly find my position in a large folder.

#### Acceptance Criteria

1. WHEN a user right-clicks on a tab and selects "定位当前文件" THEN the FolderPanel SHALL scroll the virtual list to the currently focused item and highlight it
2. WHEN no item is currently focused THEN the FolderTabBar SHALL disable the "定位当前文件" option
3. WHEN the focused item is scrolled into view THEN the FolderPanel SHALL apply a brief highlight animation to make it visually distinct

### Requirement 7

**User Story:** As a user, I want to quickly change the tab bar position from the context menu, so that I can adjust my workspace layout efficiently.

#### Acceptance Criteria

1. WHEN a user right-clicks on a tab and hovers over "标签栏位置" submenu THEN the FolderTabBar SHALL display position options: 上、下、左、右
2. WHEN a user selects a position option THEN the FolderTabBar SHALL move to the selected position (top, bottom, left, right)
3. WHILE the tab bar is displayed THEN the context menu SHALL show a checkmark next to the current position option
4. WHEN the tab bar position changes THEN the FolderPanel SHALL re-layout to accommodate the new tab bar position

### Requirement 5

**User Story:** As a user, I want to copy the tab's path, so that I can use it in other applications.

#### Acceptance Criteria

1. WHEN a user right-clicks on a tab and selects "复制路径" THEN the FolderTabBar SHALL copy the tab's current path to the system clipboard
2. WHEN the path is copied successfully THEN the FolderTabBar SHALL display a brief toast notification confirming the action

### Requirement 6

**User Story:** As a user, I want to reopen recently closed tabs, so that I can recover accidentally closed work.

#### Acceptance Criteria

1. WHEN a tab is closed THEN the FolderTabBar SHALL store the tab's path in a recently closed list (maximum 10 entries)
2. WHEN a user right-clicks on the tab bar area and selects "重新打开关闭的页签" THEN the FolderTabBar SHALL restore the most recently closed tab
3. WHEN no recently closed tabs exist THEN the FolderTabBar SHALL disable the "重新打开关闭的页签" option
