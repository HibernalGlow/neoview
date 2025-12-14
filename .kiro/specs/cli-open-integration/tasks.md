# Implementation Plan

- [x] 1. 创建路径处理工具模块


  - [x] 1.1 创建 `src/lib/utils/pathUtils.ts` 文件



    - 实现 `normalizePath` 函数：处理相对路径转绝对路径
    - 实现 `validatePath` 函数：验证路径是否存在
    - 实现 `getPathType` 函数：判断路径类型（文件/文件夹/压缩包/无效）
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 1.2 编写属性测试：路径规范化
    - **Property 5: Path with spaces handled correctly**
    - **Property 6: Path with special characters handled correctly**
    - **Property 7: Relative path resolution**
    - **Validates: Requirements 4.1, 4.2, 4.3**


- [x] 2. 增强 CLI 启动参数处理

  - [x] 2.1 修改 `src/App.svelte` 中的 CLI 处理逻辑


    - 使用新的 pathUtils 进行路径规范化
    - 添加错误处理和用户反馈
    - 确保所有路径类型正确处理
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 2.2 编写属性测试：CLI 文件路径打开
    - **Property 1: CLI file path opens in viewer**
    - **Validates: Requirements 1.1, 2.1**
  - [ ]* 2.3 编写属性测试：CLI 文件夹路径打开
    - **Property 2: CLI folder path opens as book**
    - **Validates: Requirements 1.2, 2.2, 2.3**
  - [ ]* 2.4 编写属性测试：CLI 压缩包路径打开
    - **Property 3: CLI archive path opens as book**
    - **Validates: Requirements 1.3**

- [x] 3. 增强 navigationUtils 的错误处理



  - [x] 3.1 修改 `src/lib/utils/navigationUtils.ts`

    - 添加详细的错误处理
    - 添加用户友好的错误提示
    - 确保 forceInApp 模式下不调用系统默认程序
    - _Requirements: 1.1, 1.4_

- [x] 4. Checkpoint - 确保所有测试通过

  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 验证右键菜单功能


  - [x] 5.1 验证现有右键菜单注册功能


    - 测试 `get_explorer_context_menu_enabled` 命令
    - 测试 `set_explorer_context_menu_enabled` 命令
    - 测试 `generate_explorer_context_menu_reg` 命令
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ]* 5.2 编写属性测试：右键菜单注册状态
    - **Property 4: Context menu registration round-trip**
    - **Validates: Requirements 3.3**

- [x] 6. 添加前端设置界面集成


  - [x] 6.1 确保设置界面中有右键菜单开关


    - 检查现有设置界面是否已有此功能
    - 如果没有，添加右键菜单启用/禁用开关
    - 添加错误提示（权限不足等）
    - _Requirements: 3.1, 3.2, 3.4_

- [x] 7. Final Checkpoint - 确保所有测试通过


  - Ensure all tests pass, ask the user if questions arise.
