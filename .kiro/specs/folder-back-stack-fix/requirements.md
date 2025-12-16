# Requirements Document

## Introduction

本功能修复文件夹面板在同标签页后退时丢失层叠栈（stack）的问题。当前实现中，folder 前进后退支持标签页切换后，同标签页内的后退操作也会触发重载，导致层叠栈被清空。

问题根源：当用户在同一个标签页内后退时，如果目标路径不在当前的 `layers` 数组中，系统会调用 `initRootWithoutHistory` 重建整个 stack，丢失了之前的浏览历史。

## Glossary

- **FolderStack**: 文件夹面板的层叠栈组件，管理文件夹浏览的层级结构
- **Layer**: 层叠栈中的单个层，包含路径、文件列表、选中索引等状态
- **historyStack**: 标签页内的导航历史栈，记录用户访问过的路径
- **historyIndex**: 当前在历史栈中的位置索引
- **tabNavHistory**: 跨标签页的导航历史，记录用户切换过的标签页
- **navigationCommand**: 导航命令对象，用于触发 FolderStack 的导航操作

## Requirements

### Requirement 1

**User Story:** 作为用户，我希望在同一个标签页内后退时，能够保留层叠栈的状态，以便我可以继续在之前浏览过的文件夹层级中导航。

#### Acceptance Criteria

1. WHEN 用户在同一标签页内执行后退操作 THEN FolderStack SHALL 优先在现有 layers 中查找目标路径并切换到该层
2. WHEN 目标路径不在现有 layers 中但在 historyStack 中存在 THEN FolderStack SHALL 重建到目标路径但保留可能的父级层
3. WHEN 用户连续后退多次 THEN FolderStack SHALL 正确维护 historyIndex 而不重置 layers
4. WHEN 用户后退后又前进 THEN FolderStack SHALL 能够正确恢复到之前的路径

### Requirement 2

**User Story:** 作为用户，我希望跨标签页后退和同标签页后退能够正确区分，以便两种操作不会互相干扰。

#### Acceptance Criteria

1. WHEN 用户执行后退操作且当前标签页 historyIndex > 0 THEN 系统 SHALL 执行同标签页后退
2. WHEN 用户执行后退操作且当前标签页 historyIndex <= 0 且 tabNavHistoryIndex > 0 THEN 系统 SHALL 执行跨标签页后退
3. WHEN 执行跨标签页后退 THEN 系统 SHALL 切换到目标标签页并保留该标签页的 layers 状态
4. WHEN 执行同标签页后退 THEN 系统 SHALL 不触发标签页切换

### Requirement 3

**User Story:** 作为用户，我希望后退操作的性能良好，不会因为重建 stack 而产生明显的延迟。

#### Acceptance Criteria

1. WHEN 目标路径在现有 layers 中 THEN FolderStack SHALL 直接切换层而不重新加载数据
2. WHEN 需要重建 layers THEN FolderStack SHALL 仅加载必要的目录数据
3. WHEN 后退操作完成 THEN 系统 SHALL 在 300ms 内完成 UI 更新
