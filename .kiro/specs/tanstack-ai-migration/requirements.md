 # Requirements Document

## Introduction

本文档定义了将现有 AI API 调用方案迁移到 TanStack AI 库的需求。当前项目使用 OpenAI SDK 和 Google GenAI SDK 直接调用 AI 服务，存在以下问题：
- 缺乏统一的流式响应处理
- 没有内置的请求状态管理
- 缺少标准化的错误处理和重试机制
- 与 Svelte 5 响应式系统集成不够优雅

TanStack AI 提供了框架无关的 AI 交互抽象层，支持流式响应、状态管理和多种 AI 提供商。

## Glossary

- **TanStack AI**: 一个框架无关的 AI 交互库，提供统一的 API 来处理 AI 聊天、文本生成等功能
- **AI Provider**: AI 服务提供商，如 OpenAI、Google Gemini、DeepSeek 等
- **Streaming Response**: 流式响应，AI 逐步返回生成内容而非一次性返回
- **aiApiConfigStore**: 当前项目中管理 AI 提供商配置的 Svelte store
- **translationService**: 当前项目中的翻译服务模块

## Requirements

### Requirement 1

**User Story:** As a developer, I want to use TanStack AI for unified AI API calls, so that I can have consistent state management and streaming support across different AI providers.

#### Acceptance Criteria

1. WHEN the system initializes an AI chat session THEN the system SHALL use TanStack AI's `useChat` hook to manage conversation state
2. WHEN a user sends a message to the AI THEN the system SHALL stream the response using TanStack AI's streaming capabilities
3. WHEN an AI request fails THEN the system SHALL provide standardized error information through TanStack AI's error handling
4. WHEN switching between AI providers THEN the system SHALL maintain the same interface through TanStack AI's provider abstraction

### Requirement 2

**User Story:** As a user, I want the AI translation feature to work with streaming responses, so that I can see translation progress in real-time.

#### Acceptance Criteria

1. WHEN translating text using AI THEN the system SHALL display partial results as they stream in
2. WHEN a translation is in progress THEN the system SHALL show a loading indicator with streamed content
3. WHEN the translation completes THEN the system SHALL cache the final result using existing caching mechanisms
4. IF a streaming translation is interrupted THEN the system SHALL handle the partial result gracefully

### Requirement 3

**User Story:** As a developer, I want to maintain backward compatibility with existing AI configurations, so that users don't need to reconfigure their AI providers.

#### Acceptance Criteria

1. WHEN loading existing AI provider configurations THEN the system SHALL convert them to TanStack AI compatible format
2. WHEN saving AI provider configurations THEN the system SHALL maintain the current JSON format for EMM compatibility
3. WHEN testing AI connections THEN the system SHALL use TanStack AI's built-in validation mechanisms
4. WHEN a provider uses OpenAI-compatible API THEN the system SHALL configure TanStack AI with the correct base URL

### Requirement 4

**User Story:** As a developer, I want to integrate TanStack AI with Svelte 5's reactivity system, so that AI state changes automatically update the UI.

#### Acceptance Criteria

1. WHEN AI response state changes THEN the system SHALL trigger Svelte 5 reactive updates automatically
2. WHEN using AI features in components THEN the system SHALL provide Svelte-compatible reactive stores
3. WHEN multiple components subscribe to AI state THEN the system SHALL share state efficiently without redundant subscriptions
4. WHEN a component unmounts THEN the system SHALL clean up AI subscriptions properly

### Requirement 5

**User Story:** As a user, I want the AI tag inference feature to use the new TanStack AI integration, so that I get consistent behavior across all AI features.

#### Acceptance Criteria

1. WHEN inferring tags from images THEN the system SHALL use TanStack AI for the API call
2. WHEN the tag inference request is processing THEN the system SHALL show streaming progress if supported
3. WHEN tag inference completes THEN the system SHALL parse and display the results in the existing format
4. IF the AI provider doesn't support JSON mode THEN the system SHALL fall back to text parsing

### Requirement 6

**User Story:** As a developer, I want to serialize and deserialize AI chat messages, so that conversation history can be persisted and restored.

#### Acceptance Criteria

1. WHEN saving a chat session THEN the system SHALL serialize messages to JSON format
2. WHEN loading a saved chat session THEN the system SHALL deserialize JSON back to TanStack AI message format
3. WHEN the serialization format changes THEN the system SHALL handle version migration gracefully

