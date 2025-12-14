# Requirements Document

## Introduction

本功能为 NeoView 应用添加多窗口和多标签页支持，允许用户将任意卡片（Card）作为独立标签页在新窗口中打开。每个窗口支持多个标签页，用户可以自由组织和管理多个卡片视图，提升多任务处理效率。

## Glossary

- **Card（卡片）**: 应用中的功能模块单元，如历史记录、书签、超分控制等，由 CardRenderer 渲染
- **Tab（标签页）**: 窗口内的独立视图容器，每个标签页可承载一个卡片
- **CardWindow（卡片窗口）**: 支持多标签页的独立窗口，可包含多个卡片标签页
- **WindowManager（窗口管理器）**: 负责创建、管理和协调多个窗口的核心服务
- **CardRegistry（卡片注册表）**: 定义所有可用卡片元数据的注册中心
- **TabStore（标签页存储）**: 管理窗口内标签页状态的响应式存储

## Requirements

### Requirement 1

**User Story:** As a user, I want to open any card as a tab in a new window, so that I can view card content independently from the main application.

#### Acceptance Criteria

1. WHEN a user right-clicks on a card header THEN the CardWindow System SHALL display a context menu with "Open in New Window" option
2. WHEN a user selects "Open in New Window" THEN the CardWindow System SHALL create a new window containing the selected card as a tab
3. WHEN a card is opened in a new window THEN the CardWindow System SHALL render the card with full functionality identical to the main window
4. WHEN a new card window is created THEN the CardWindow System SHALL position the window at screen center with default dimensions of 800x600 pixels

### Requirement 2

**User Story:** As a user, I want to manage multiple tabs within a card window, so that I can organize related cards together.

#### Acceptance Criteria

1. WHEN a card window is open THEN the TabStore SHALL display a tab bar showing all open tabs with card titles and icons
2. WHEN a user clicks on a tab THEN the TabStore SHALL switch the active view to the selected tab's card
3. WHEN a user clicks the close button on a tab THEN the TabStore SHALL remove the tab and switch to an adjacent tab
4. WHEN the last tab in a window is closed THEN the CardWindow System SHALL close the entire window
5. WHEN a user drags a tab THEN the TabStore SHALL allow reordering tabs within the same window

### Requirement 3

**User Story:** As a user, I want to add new cards to an existing card window, so that I can group related cards together.

#### Acceptance Criteria

1. WHEN a card window is open THEN the CardWindow System SHALL display an "Add Card" button in the tab bar
2. WHEN a user clicks "Add Card" THEN the CardWindow System SHALL display a dropdown menu listing all available cards from CardRegistry
3. WHEN a user selects a card from the dropdown THEN the TabStore SHALL add a new tab with the selected card and activate it
4. WHEN a card is added to a window THEN the CardWindow System SHALL load the card component lazily

### Requirement 4

**User Story:** As a user, I want to drag tabs between different card windows, so that I can reorganize my workspace flexibly.

#### Acceptance Criteria

1. WHEN a user drags a tab outside its window THEN the CardWindow System SHALL create a new window containing that tab
2. WHEN a user drags a tab onto another card window's tab bar THEN the TabStore SHALL move the tab to the target window
3. WHEN a tab is moved between windows THEN the CardWindow System SHALL preserve the card's state during transfer
4. WHEN the source window has only one tab and it is dragged out THEN the CardWindow System SHALL close the source window

### Requirement 5

**User Story:** As a user, I want my card window layout to persist across sessions, so that I can resume my workspace configuration.

#### Acceptance Criteria

1. WHEN a card window is created or modified THEN the WindowManager SHALL save the window configuration to localStorage
2. WHEN the application starts THEN the WindowManager SHALL restore previously open card windows with their tab configurations
3. WHEN a window is closed THEN the WindowManager SHALL remove its configuration from persistent storage
4. WHEN restoring windows THEN the WindowManager SHALL validate that all referenced cards exist in CardRegistry

### Requirement 6

**User Story:** As a user, I want keyboard shortcuts to manage card windows efficiently, so that I can work faster without using the mouse.

#### Acceptance Criteria

1. WHEN a user presses Ctrl+W in a card window THEN the TabStore SHALL close the active tab
2. WHEN a user presses Ctrl+Tab in a card window THEN the TabStore SHALL switch to the next tab
3. WHEN a user presses Ctrl+Shift+Tab in a card window THEN the TabStore SHALL switch to the previous tab
4. WHEN a user presses Ctrl+T in a card window THEN the CardWindow System SHALL open the "Add Card" dropdown

### Requirement 7

**User Story:** As a user, I want visual feedback when dragging tabs, so that I can understand where the tab will be placed.

#### Acceptance Criteria

1. WHEN a user starts dragging a tab THEN the CardWindow System SHALL display a semi-transparent preview of the tab
2. WHEN a tab is dragged over a valid drop zone THEN the CardWindow System SHALL highlight the drop zone with a visual indicator
3. WHEN a tab is dragged outside all windows THEN the CardWindow System SHALL display a "new window" indicator
4. WHEN a drag operation is cancelled THEN the CardWindow System SHALL return the tab to its original position

### Requirement 8

**User Story:** As a user, I want to duplicate a card tab, so that I can view the same card with different configurations.

#### Acceptance Criteria

1. WHEN a user right-clicks on a tab THEN the TabStore SHALL display a context menu with "Duplicate Tab" option
2. WHEN a user selects "Duplicate Tab" THEN the TabStore SHALL create a new tab with the same card type
3. WHEN a tab is duplicated THEN the CardWindow System SHALL assign a unique identifier to the new tab instance

