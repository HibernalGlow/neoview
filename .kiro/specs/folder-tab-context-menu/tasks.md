# Implementation Plan

- [x] 1. 扩展 FolderTabStore 数据模型和 Actions
  - [x] 1.1 在 FolderTabState 中添加 pinned 字段
    - 修改 `folderTabStore.svelte.ts` 中的 FolderTabState 接口
    - 在 createDefaultTabState 中初始化 pinned 为 false
    - 更新 saveTabsState 和 loadTabsState 以持久化 pinned 状态
    - _Requirements: 2.1, 2.2, 2.5_

  - [ ]* 1.2 编写 pinned 状态持久化属性测试
    - **Property 6: Pinned state persistence round trip**
    - **Validates: Requirements 2.5**

  - [x] 1.3 添加 RecentlyClosedTab 数据结构和 store
    - 创建 RecentlyClosedTab 接口
    - 添加 recentlyClosedTabs writable store
    - 定义 MAX_RECENTLY_CLOSED = 10 常量
    - _Requirements: 6.1_

  - [x] 1.4 添加共享标签栏位置设置
    - 创建 SharedTabBarSettings 接口（包含 tabBarLayout）
    - 添加 loadSharedTabBarSettings 和 saveSharedTabBarSettings 函数
    - _Requirements: 7.2_

- [x] 2. 实现标签页关闭相关 Actions
  - [x] 2.1 实现 closeOthers action
    - 关闭除目标标签页和固定标签页外的所有标签页
    - 确保至少保留一个标签页
    - _Requirements: 1.2, 2.4_

  - [ ]* 2.2 编写 closeOthers 属性测试
    - **Property 2: Close others preserves target and pinned tabs**
    - **Validates: Requirements 1.2, 2.4**

  - [x] 2.3 实现 closeLeft action
    - 关闭目标标签页左侧的所有非固定标签页
    - _Requirements: 1.3, 2.4_

  - [ ]* 2.4 编写 closeLeft 属性测试
    - **Property 3: Close left preserves target, right tabs, and pinned tabs**
    - **Validates: Requirements 1.3, 2.4**

  - [x] 2.5 实现 closeRight action
    - 关闭目标标签页右侧的所有非固定标签页
    - _Requirements: 1.4, 2.4_

  - [ ]* 2.6 编写 closeRight 属性测试
    - **Property 4: Close right preserves target, left tabs, and pinned tabs**
    - **Validates: Requirements 1.4, 2.4**

  - [x] 2.7 修改 closeTab action 以支持最近关闭列表
    - 关闭标签页时将路径添加到 recentlyClosedTabs
    - 限制列表长度不超过 MAX_RECENTLY_CLOSED
    - _Requirements: 6.1_

  - [ ]* 2.8 编写最近关闭列表属性测试
    - **Property 8: Recently closed list bounded size**
    - **Validates: Requirements 6.1**

- [ ] 3. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 实现固定和重新打开 Actions
  - [x] 4.1 实现 togglePinned 和 setPinned actions
    - 切换或设置标签页的 pinned 状态
    - 更新 UI 以显示固定指示器
    - _Requirements: 2.1, 2.2_

  - [ ]* 4.2 编写 pin/unpin round-trip 属性测试
    - **Property 5: Pin/unpin round trip**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 4.3 实现 reopenClosedTab action
    - 从 recentlyClosedTabs 中取出最近关闭的标签页
    - 创建新标签页并导航到该路径
    - _Requirements: 6.2_

  - [ ]* 4.4 编写 reopenClosedTab 属性测试
    - **Property 9: Reopen restores most recent**
    - **Validates: Requirements 6.2**

  - [x] 4.5 实现 setTabBarLayout action
    - 设置标签栏位置（top/left/right/bottom）
    - 保存到共享设置
    - _Requirements: 7.2_

  - [ ]* 4.6 编写 tabBarLayout 属性测试
    - **Property 10: Tab bar layout update**
    - **Validates: Requirements 7.2**

- [ ] 5. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. 更新 FolderTabBar 组件 UI
  - [x] 6.1 扩展右键菜单结构
    - 添加关闭操作组：关闭、关闭其他、关闭左侧、关闭右侧
    - 添加固定/取消固定选项
    - 添加复制路径选项
    - 添加定位当前文件选项
    - 添加标签栏位置子菜单
    - 添加重新打开关闭的页签选项
    - _Requirements: 1.1-1.5, 2.1-2.3, 3.1, 4.1-4.2, 5.1, 6.2-6.3, 7.1-7.3_

  - [x] 6.2 实现菜单项禁用逻辑
    - 只有一个非固定标签页时禁用"关闭"
    - 无焦点项时禁用"定位当前文件"
    - 无最近关闭标签页时禁用"重新打开"
    - 虚拟路径时禁用部分选项
    - _Requirements: 1.5, 4.2, 6.3_

  - [x] 6.3 添加固定标签页视觉指示器
    - 在固定的标签页上显示图钉图标
    - _Requirements: 2.3_

  - [x] 6.4 实现复制路径功能
    - 使用 navigator.clipboard.writeText 复制路径
    - 显示 toast 通知确认
    - _Requirements: 5.1, 5.2_

  - [x] 6.5 实现定位当前文件功能
    - 触发滚动到焦点项的事件
    - 应用高亮动画
    - _Requirements: 4.1, 4.3_

- [x] 7. 实现标签栏位置布局
  - [x] 7.1 更新 FolderPanel 组件以支持标签栏位置
    - 根据 tabBarLayout 调整标签栏和内容区域的布局
    - 支持 top/bottom 水平布局和 left/right 垂直布局
    - _Requirements: 7.2, 7.4_

  - [x] 7.2 调整标签栏样式以适应不同位置
    - 水平位置时使用横向标签
    - 垂直位置时使用纵向标签
    - _Requirements: 7.2_

- [ ] 8. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. 集成测试和收尾
  - [ ]* 9.1 编写复制标签页属性测试
    - **Property 7: Duplicate tab creates identical copy**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 9.2 编写关闭单个标签页属性测试
    - **Property 1: Close tab removes exactly one tab**
    - **Validates: Requirements 1.1**

  - [x] 9.3 运行 yarn check 验证代码
    - 确保无类型错误和 lint 问题
    - _Requirements: All_

- [x] 10. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.
