# Implementation Plan

- [x] 1. 设置项目依赖和基础架构




  - [ ] 1.1 安装 TanStack AI 相关依赖
    - 安装 `ai`, `@ai-sdk/openai`, `@ai-sdk/google` 包
    - 安装 `fast-check` 用于属性测试
    - 运行 `yarn check` 验证类型


    - _Requirements: 1.1, 1.4_

  - [ ] 1.2 创建 TanStack AI 适配器模块
    - 创建 `src/lib/ai/tanstackAdapter.ts`
    - 实现 `createTanStackProvider` 函数，将 AiProvider 转换为 TanStack AI 配置
    - 支持 OpenAI、Gemini 和 Ollama（OpenAI 兼容模式）
    - _Requirements: 1.4, 3.4_





  - [ ]* 1.3 编写属性测试：提供商接口一致性
    - **Property 3: Provider interface consistency**
    - **Validates: Requirements 1.4**

- [ ] 2. 实现配置转换和验证
  - [x] 2.1 创建配置转换器模块



    - 创建 `src/lib/ai/configConverter.ts`

    - 实现 `validateConfig` 函数验证配置有效性
    - 实现 `convertToTanStack` 和 `convertFromTanStack` 函数
    - _Requirements: 3.1, 3.2_



  - [ ]* 2.2 编写属性测试：配置格式转换 round-trip
    - **Property 5: Configuration format conversion round-trip**
    - **Validates: Requirements 3.1, 3.2, 3.4**

- [ ] 3. 实现流式翻译服务
  - [x] 3.1 创建流式翻译模块


    - 创建 `src/lib/ai/streamingTranslation.ts`




    - 实现 `translateWithStreaming` 函数
    - 支持 `onChunk`, `onComplete`, `onError` 回调
    - _Requirements: 2.1, 2.2_

  - [ ] 3.2 集成翻译缓存
    - 修改 `src/lib/services/translationService.ts`
    - 在流式翻译完成后调用现有缓存机制




    - 保持与 `aiTranslationStore` 的兼容
    - _Requirements: 2.3_

  - [ ]* 3.3 编写属性测试：翻译缓存 round-trip
    - **Property 4: Translation caching round-trip**
    - **Validates: Requirements 2.3**





- [ ] 4. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. 实现 Svelte AI Store
  - [ ] 5.1 创建 TanStack AI Store
    - 创建 `src/lib/stores/ai/tanstackStore.svelte.ts`
    - 实现 `createAIStore` 函数

    - 提供 `setLoading`, `appendStreamChunk`, `addMessage`, `setError` 方法
    - _Requirements: 4.1, 4.2_





  - [ ]* 5.2 编写属性测试：聊天会话初始化状态
    - **Property 1: Chat session initialization returns valid state structure**
    - **Validates: Requirements 1.1**



- [ ] 6. 实现错误处理
  - [x] 6.1 创建统一错误处理模块




    - 创建 `src/lib/ai/errorHandler.ts`
    - 实现 `normalizeError` 函数，将不同提供商错误转换为标准格式
    - 实现 `withRetry` 重试逻辑
    - _Requirements: 1.3_

  - [ ]* 6.2 编写属性测试：错误处理格式标准化
    - **Property 2: Error handling provides standardized error format**




    - **Validates: Requirements 1.3**

- [ ] 7. 实现消息序列化
  - [x] 7.1 创建消息序列化模块

    - 创建 `src/lib/ai/messageSerializer.ts`

    - 实现 `serializeMessages` 和 `deserializeMessages` 函数



    - 处理 Date 对象的 ISO 8601 格式转换
    - _Requirements: 6.1, 6.2_

  - [ ]* 7.2 编写属性测试：消息序列化 round-trip
    - **Property 7: Message serialization round-trip**
    - **Validates: Requirements 6.1, 6.2**

- [ ] 8. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. 迁移现有 AI 功能
  - [ ] 9.1 更新 aiApiConfigStore
    - 修改 `src/lib/stores/aiApiConfig.svelte.ts`
    - 将 `chat` 方法改为使用 TanStack AI
    - 保持现有接口不变
    - _Requirements: 1.1, 1.2, 3.3_

  - [ ] 9.2 更新翻译服务
    - 修改 `src/lib/services/translationService.ts`
    - 添加流式翻译选项
    - 保持非流式模式向后兼容
    - _Requirements: 2.1, 2.2, 2.4_

- [ ] 10. 实现标签推断迁移
  - [ ] 10.1 更新标签推断功能
    - 查找并修改标签推断相关代码
    - 使用 TanStack AI 进行 API 调用
    - 支持 JSON 模式和文本解析降级
    - _Requirements: 5.1, 5.3, 5.4_

  - [ ]* 10.2 编写属性测试：标签推断结果解析
    - **Property 6: Tag inference result parsing**
    - **Validates: Requirements 5.3**

- [ ] 11. 清理和优化
  - [ ] 11.1 移除旧依赖
    - 从 package.json 移除 `openai` 和 `@google/genai`
    - 运行 `yarn install` 更新依赖
    - 运行 `yarn check` 确保无类型错误
    - _Requirements: 1.4_

  - [ ] 11.2 更新导入和类型
    - 更新所有使用旧 SDK 的文件
    - 确保类型定义正确
    - _Requirements: 3.1, 3.2_

- [ ] 12. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.
