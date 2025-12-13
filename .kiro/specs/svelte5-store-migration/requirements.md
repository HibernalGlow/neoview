# Requirements Document

## Introduction

本文档定义了将 NeoView 项目中的状态管理从 Svelte 4 的 `writable` store 迁移到 Svelte 5 Runes (`$state`) 的需求，并创建通用的异步操作 store 工具函数。目标是统一代码风格、提升类型安全性和开发体验。

## Glossary

- **Svelte 5 Runes**: Svelte 5 引入的响应式原语，包括 `$state`、`$derived`、`$effect` 等
- **writable**: Svelte 4 的可写 store 类型，来自 `svelte/store`
- **UI Store**: `src/lib/stores/ui.svelte.ts` 文件，管理 UI 相关状态
- **AsyncStore**: 用于管理异步操作状态的通用 store 模式
- **localStorage 持久化**: 将状态保存到浏览器本地存储以实现跨会话持久化

## Requirements

### Requirement 1

**User Story:** As a developer, I want to use Svelte 5 Runes consistently across all stores, so that the codebase has a unified state management pattern.

#### Acceptance Criteria

1. WHEN the UI store is loaded THEN the system SHALL use `$state` instead of `writable` for all reactive state
2. WHEN a state value changes THEN the system SHALL automatically persist it to localStorage if configured
3. WHEN the application starts THEN the system SHALL restore persisted state from localStorage
4. WHEN components import from UI store THEN the system SHALL provide the same API surface as before migration

### Requirement 2

**User Story:** As a developer, I want a reusable pattern for creating persisted state, so that I can easily add new UI states with localStorage persistence.

#### Acceptance Criteria

1. WHEN creating a persisted state THEN the system SHALL provide a `createPersistedState` utility function
2. WHEN the utility function is called with a key and default value THEN the system SHALL return a reactive state object with getter and setter
3. WHEN the state value changes THEN the system SHALL automatically save to localStorage with the configured key prefix
4. WHEN localStorage read fails THEN the system SHALL gracefully fall back to the default value

### Requirement 3

**User Story:** As a developer, I want a generic async store pattern, so that I can manage loading, error, and data states consistently across the application.

#### Acceptance Criteria

1. WHEN creating an async store THEN the system SHALL provide a `createAsyncStore` utility function
2. WHEN an async operation starts THEN the system SHALL set `isLoading` to true and clear previous errors
3. WHEN an async operation succeeds THEN the system SHALL set `data` to the result and `isLoading` to false
4. WHEN an async operation fails THEN the system SHALL set `error` to the error message and `isLoading` to false
5. WHEN the async store is created THEN the system SHALL provide `execute`, `reset`, and `retry` methods

### Requirement 4

**User Story:** As a developer, I want the migrated stores to maintain backward compatibility, so that existing components continue to work without changes.

#### Acceptance Criteria

1. WHEN components use `$` prefix to subscribe to stores THEN the system SHALL continue to work with the new implementation
2. WHEN components use `.set()` or `.update()` methods THEN the system SHALL provide equivalent functionality
3. WHEN components use `get()` function from svelte/store THEN the system SHALL provide an alternative accessor
4. WHEN the migration is complete THEN the system SHALL pass all existing type checks

### Requirement 5

**User Story:** As a developer, I want the async store to support cancellation and deduplication, so that I can prevent race conditions and unnecessary requests.

#### Acceptance Criteria

1. WHEN a new async operation starts while one is pending THEN the system SHALL cancel the previous operation by default
2. WHEN the `dedupe` option is enabled THEN the system SHALL skip duplicate requests with the same parameters
3. WHEN an operation is cancelled THEN the system SHALL not update the store state with the cancelled result
