# 需求文档

## 简介

本文档定义了前端代码重构的需求，目标是将超过800行的大文件拆分为更小、更可维护的模块。项目中有15个前端文件超过800行限制，需要进行模块化重构以提高代码可维护性、可测试性和可复用性。

## 术语表

- **Store**: Svelte 状态管理文件，使用 `.svelte.ts` 后缀
- **Component**: Svelte UI 组件，使用 `.svelte` 后缀
- **Module**: 独立的功能模块，可被其他文件导入使用
- **Barrel_Export**: 通过 `index.ts` 文件统一导出多个模块的模式

## 需求

### 需求 1：状态管理层重构

**用户故事：** 作为开发者，我希望状态管理文件被拆分为更小的模块，以便于理解、维护和测试。

#### 验收标准

1. WHEN folderTabStore.svelte.ts 被重构 THEN Refactoring_System SHALL 将其拆分为不超过5个模块，每个模块不超过400行
2. WHEN book.svelte.ts 被重构 THEN Refactoring_System SHALL 将其拆分为不超过4个模块，每个模块不超过400行
3. WHEN keybindings.svelte.ts 被重构 THEN Refactoring_System SHALL 将其拆分为不超过4个模块，每个模块不超过400行
4. WHEN folderPanelStore.svelte.ts 被重构 THEN Refactoring_System SHALL 将其拆分为不超过3个模块，每个模块不超过400行
5. WHEN settingsManager.svelte.ts 被重构 THEN Refactoring_System SHALL 将其拆分为不超过3个模块，每个模块不超过400行
6. WHEN 任何模块被拆分 THEN Refactoring_System SHALL 保持原有的公共 API 不变
7. WHEN 模块拆分完成 THEN Refactoring_System SHALL 通过 Barrel_Export 模式统一导出

### 需求 2：UI 组件层重构

**用户故事：** 作为开发者，我希望大型 UI 组件被拆分为更小的子组件，以便于复用和独立测试。

#### 验收标准

1. WHEN EmmPanelSection.svelte 被重构 THEN Refactoring_System SHALL 将其拆分为不超过5个子组件，每个不超过400行
2. WHEN TopToolbar.svelte 被重构 THEN Refactoring_System SHALL 将其拆分为不超过5个子组件，每个不超过400行
3. WHEN FolderToolbar.svelte 被重构 THEN Refactoring_System SHALL 将其拆分为不超过5个子组件，每个不超过400行
4. WHEN FolderStack.svelte 被重构 THEN Refactoring_System SHALL 将其拆分为不超过4个子组件，每个不超过400行
5. WHEN VideoPlayer.svelte 被重构 THEN Refactoring_System SHALL 将其拆分为不超过4个子组件，每个不超过400行
6. WHEN BottomThumbnailBar.svelte 被重构 THEN Refactoring_System SHALL 将其拆分为不超过3个子组件，每个不超过400行
7. WHEN StackView.svelte 被重构 THEN Refactoring_System SHALL 将其拆分为不超过3个子组件，每个不超过400行
8. WHEN App.svelte 被重构 THEN Refactoring_System SHALL 将其拆分为不超过4个子组件，每个不超过400行
9. WHEN AiServiceConfigCard.svelte 被重构 THEN Refactoring_System SHALL 将其拆分为不超过3个子组件，每个不超过400行

### 需求 3：API 层重构

**用户故事：** 作为开发者，我希望 API 文件被拆分为更小的模块，以便于按功能组织和维护。

#### 验收标准

1. WHEN filesystem.ts 被重构 THEN Refactoring_System SHALL 将其拆分为不超过4个模块，每个不超过300行
2. WHEN API 模块拆分完成 THEN Refactoring_System SHALL 通过 Barrel_Export 模式统一导出
3. WHEN API 模块被拆分 THEN Refactoring_System SHALL 保持原有的函数签名不变

### 需求 4：通用组件库创建

**用户故事：** 作为开发者，我希望创建通用组件库，以便于在多个地方复用相同的 UI 模式。

#### 验收标准

1. WHEN 通用组件库被创建 THEN Refactoring_System SHALL 在 `src/lib/components/common/` 目录下创建组件
2. WHEN 工具栏组件被提取 THEN Refactoring_System SHALL 创建 ToolbarBase.svelte 作为基础组件
3. WHEN 面板组件被提取 THEN Refactoring_System SHALL 创建 PanelBase.svelte 作为基础组件
4. WHEN 按钮组组件被提取 THEN Refactoring_System SHALL 创建 ButtonGroup.svelte 作为通用组件
5. WHEN 下拉面板组件被提取 THEN Refactoring_System SHALL 创建 DropdownPanel.svelte 作为通用组件

### 需求 5：代码质量保证

**用户故事：** 作为开发者，我希望重构后的代码通过所有质量检查，以确保功能完整性。

#### 验收标准

1. WHEN 任何文件被重构 THEN Refactoring_System SHALL 确保该文件不超过800行
2. WHEN 重构完成 THEN Refactoring_System SHALL 通过 `yarn check` 验证
3. WHEN 重构完成 THEN Refactoring_System SHALL 通过 ESLint 检查
4. WHEN 重构完成 THEN Refactoring_System SHALL 保持所有现有功能正常工作
5. WHEN 新模块被创建 THEN Refactoring_System SHALL 使用中文注释说明功能
