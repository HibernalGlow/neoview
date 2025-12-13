# Implementation Plan

- [x] 1. 创建启动初始化模块




  - [ ] 1.1 创建 startup_init.rs 模块
    - 实现 ensure_app_directories 函数
    - 实现 StartupError 枚举
    - 实现目录创建失败时的临时目录回退逻辑
    - _Requirements: 1.1, 1.2_
  - [x]* 1.2 编写属性测试：目录创建幂等性




    - **Property 1: 目录创建幂等性**
    - **Validates: Requirements 1.1**


- [ ] 2. 增强数据库初始化逻辑
  - [ ] 2.1 修改 cache_index_db.rs
    - 添加 new_with_recovery 方法
    - 实现数据库损坏检测和自动重建
    - 添加数据库备份逻辑
    - _Requirements: 1.3, 1.4, 3.2_
  - [ ] 2.2 增强 open 方法的错误处理
    - 添加重试逻辑（最多3次）
    - 确保 busy_timeout 设置为 5000ms




    - _Requirements: 3.1, 3.3_
  - [ ]* 2.3 编写属性测试：数据库恢复
    - **Property 2: 数据库初始化恢复**
    - **Validates: Requirements 1.4, 3.2**
  - [ ]* 2.4 编写属性测试：数据库超时配置
    - **Property 4: 数据库超时配置**




    - **Validates: Requirements 3.1**

- [ ] 3. 安全托盘初始化
  - [x] 3.1 修改 tray.rs



    - 添加 init_tray_safe 函数

    - 捕获所有托盘初始化错误

    - 失败时记录日志并返回 Ok
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]* 3.2 编写属性测试：托盘初始化不阻塞
    - **Property 3: 托盘初始化不阻塞**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [ ] 4. 集成到主启动流程
  - [ ] 4.1 修改 lib.rs
    - 在 setup 闭包开始时调用 ensure_app_directories
    - 使用 new_with_recovery 替换 CacheIndexDb::new
    - 使用 init_tray_safe 替换 init_tray
    - 添加启动日志记录
    - _Requirements: 1.1, 1.3, 2.1, 2.3_

- [ ] 5. 添加启动错误对话框
  - [ ] 5.1 实现关键错误的原生对话框显示
    - 使用 tauri_plugin_dialog 显示错误
    - 仅在无法恢复的错误时显示
    - _Requirements: 2.2_

- [ ] 6. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. 手动验证
  - [ ] 7.1 删除 AppData 目录后测试 Release 版本启动
    - 验证目录自动创建
    - 验证数据库正常初始化
    - 验证托盘正常显示
    - _Requirements: 1.1, 1.3, 4.1_
