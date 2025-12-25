

### 使用 Susie 插件
opencomic缩略图 文件系统

项目中超过800行的文件

  以下是项目中超过800行的源代码文件（按行数降序排列）：

  Rust 后端文件 (src-tauri)
   1. src-tauri\src\commands\fs_commands.rs: 2096 lines - 文件系统命令
   2. src-tauri\src\core\thumbnail_db.rs: 1976 lines - 缩略图数据库
   3. src-tauri\src\commands\benchmark_commands.rs: 1610 lines - 基准测试命令
   4. src-tauri\src\core\archive.rs: 1457 lines - 归档文件处理
   5. src-tauri\src\commands\thumbnail_commands.rs: 1295 lines - 缩略图命令
   6. src-tauri\src\core\thumbnail_service_v3.rs: 1353 lines - 缩略图服务v3
   7. src-tauri\src\core\upscale_service.rs: 1249 lines - 图像放大服务
   8. src-tauri\src\core\page_manager\mod.rs: 859 lines - 页面管理器
   9. src-tauri\src\core\thumbnail_generator.rs: 886 lines - 缩略图生成器
   10. src-tauri\src\core\fs_manager.rs: 808 lines - 文件系统管理器

  前端 Svelte/TypeScript 文件 (src)
   1. src\lib\components\panels\folderPanel\stores\folderTabStore.svelte.ts: 1761 lines - 文件夹标签页状态管理
   2. src\lib\components\panels\emm\EmmPanelSection.svelte: 1720 lines - EMM面板组件
   3. src\lib\components\layout\TopToolbar.svelte: 1415 lines - 顶部工具栏
   4. src\lib\components\panels\folderPanel\components\FolderToolbar.svelte: 1412 lines - 文件夹工具栏
   5. src\App.svelte: 1121 lines - 主应用组件
   6. src\lib\stores\keybindings.svelte.ts: 1089 lines - 键盘绑定状态管理
   7. src\lib\components\panels\folderPanel\components\FolderStack.svelte: 1285 lines - 文件夹堆栈组件
   8. src\lib\stores\book.svelte.ts: 1279 lines - 书籍状态管理
   9. src\lib\components\viewer\VideoPlayer.svelte: 1256 lines - 视频播放器组件
   10. src\lib\api\filesystem.ts: 887 lines - 文件系统API
   11. src\lib\cards\ai\AiServiceConfigCard.svelte: 951 lines - AI服务配置卡片
   12. src\lib\components\panels\folderPanel\stores\folderPanelStore.svelte.ts: 1023 lines - 文件夹面板状态管理
   13. src\lib\components\layout\BottomThumbnailBar.svelte: 930 lines - 底部缩略图栏
   14. src\lib\stackview\StackView.svelte: 881 lines - 堆栈视图组件
   15. src\lib\stores\settingsManager.svelte.ts: 811 lines - 设置管理器

✦ 这些文件可能需要考虑重构以提高代码的可维护性。特别是超过2000行的文件（如fs_commands.rs和thumbnail_db.rs）建议拆分成     
  更小的模块。

持久化更多设置里的内部文件显示数量 单击双击空白处行为 列表底部返回按钮 这些都没有持久化
超分条件总像素量条件
### 页面移动超过尾页时的行为

- 无变化
- 无变化
- 下一本书籍
- 循环（t b）
- 无缝循环
- 在对话框中选择

### 使用触控功能

- 关闭后，将被识别为标准的鼠标操作。
- 开

### 单点触控拖放操作

- 手势

### 长按触控拖放操作

- 触控视图操作

### 允许使用多点触控进行旋转

- 开



- 允许通过双指捏放调整大小
- 开

### 判定为触控拖放的最小移动距离（像素）

- 首次移动这个距离则判定为拖放开始。
- 16

### 触控操作时捏放的最小判定距离（像素）

- 触控操作时，判定为旋转、缩放操作的两指间的最小距离。
- 80

### 触控操作时捏放的最小移动距离（像素）

- 触控操作时，旋转、缩放操作生效的最小距离。
- 30

### 幻灯片

- 循环播放
  - 播放尾页后，返回首页。
  - 关
- 通过移动鼠标重置显示间隔时间
  - 如果关闭，只能通过点击等明确操作进行重置
  - 开
- 幻灯片切换时间（秒）
  - 0.8秒
  - 0
- 显示计时器
  - 开

### 自动隐藏面板

- 自动隐藏面板焦点模式
  - 有焦点时不隐藏。
  - 面板：5
- 截图OCR
  - 自动隐藏面板的按键输入提示
  - 按键输入时延迟隐藏操作。
  - 开
- 自动隐藏面板的显示时间（秒）
  - 0.0
- 自动隐藏面板的隐藏时间（秒）
  - 0.0
- 面板自动显示的宽度（像素）
  - 32
- 面板自动显示的高度（像素）
  - 32
- 自动显示侧边面板上的菜单栏
  - 允许单像素
- 自动显示侧边面板上的滚动条
  - 允许
- Top margin of side panel when menu bar is automatically displayed（像素）
  - 32
- Bottom margin of side panel when slider is automatically displayed（像素）
  - 20
- 自动隐藏模式

### Detail popup

- 开
- 列表项目内容样式
  - 图标大小
    - 图标大小。其宽高比取决于图标形状。如果超过缩略图的分辨率，图像将呈颗粒状。
    - 88 × 88
  - 图标形状
    - 正方形
- Detail popup
  - 开
  - 图标弹窗
    - 光标置于图标上方时，弹窗显示一个大图像。
    - 关
- 保存每个文件夹的排序方式等信息
  - 开

### 删除正在阅读的书籍后打开下一本书

- 开
- 对于名为“.part【数字】.rar”的 RAR 分卷文件，列表中仅显
- 关

### 从显示中排除的文件名样式