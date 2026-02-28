I now have comprehensive understanding of the NeeView reference codebase. Let me compile the report.

---

# NeeView 架构与功能综合分析报告

## 一、项目概述

NeeView 是一个用 C#/WPF 编写的功能极为丰富的桌面图片/漫画阅读器。其代码库体现了高度模块化的设计，采用 Singleton + 观察者模式 + 命令模式 的整体架构。以下是所有关键系统的深度分析。

---

## 二、核心架构模式

### 2.1 Singleton 服务模式
几乎所有核心管理器都采用线程安全的静态 Singleton：
```csharp
static BookHub() => Current = new BookHub();
public static BookHub Current { get; }
```
涉及：`BookHub`, `SlideShow`, `CommandTable`, `JobEngine`, `SidePanelFrame`, `PageHistory`, `BookHistoryCollection` 等。

### 2.2 命令引擎模式 (Command Engine)
所有 Book 加载/卸载操作通过 `BookHubCommandEngine` 排队执行，避免并发冲突：
- [BookHub.cs](ref/NeeView/BookHub/BookHub.cs#L80) 中的 `_commandEngine` 管理命令队列
- `BookHubCommandLoad` / `BookHubCommandUnload` 是具体命令实现
- 命令完成后通过事件通知

### 2.3 属性变更通知 (INotifyPropertyChanged)
全局使用 `[NotifyPropertyChanged]` 源码生成器 + `BindableBase` 基类实现响应式数据绑定。

### 2.4 可观察订阅模式 (Subscribable)
使用 `[Subscribable]` 注解自动生成类型安全的事件订阅方式，配合 `DisposableCollection` 实现自动清理。

---

## 三、页面导航系统

### 3.1 页面模式 (PageMode)
定义于 [PageMode.cs](ref/NeeView/Book/PageMode.cs)：
- **SinglePage** — 单页显示
- **WidePage** — 双页并排显示（漫画模式）

### 3.2 页面拉伸模式 (PageStretchMode)
定义于 [PageStretchMode.cs](ref/NeeView/Book/PageStretchMode.cs)，共 6 种：
| 模式 | 说明 |
|------|------|
| `None` | 原始尺寸 |
| `Uniform` | 等比缩放适应窗口 |
| `UniformToFill` | 等比填满窗口 |
| `UniformToSize` | 等比缩放到指定尺寸 |
| `UniformToVertical` | 适应垂直方向 |
| `UniformToHorizontal` | 适应水平方向 |

### 3.3 页面排序 (PageSortMode)
定义于 [PageSortMode.cs](ref/NeeView/Book/PageSortMode.cs)，共 9 种：
- FileName / FileNameDescending
- TimeStamp / TimeStampDescending
- Size / SizeDescending
- Entry / EntryDescending
- **Random**（随机排序）

### 3.4 阅读方向 (PageReadOrder)
定义于 [PageReadOrder.cs](ref/NeeView/Book/PageReadOrder.cs)：
- **RightToLeft** — 日式漫画阅读顺序
- **LeftToRight** — 西式阅读顺序

### 3.5 页面终端行为 (PageEndAction)
定义于 [PageEndAction.cs](ref/NeeView/BookHub/PageEndAction.cs)，当翻到最后/第一页时：
| 行为 | 说明 |
|------|------|
| `None` | 不做操作，显示通知 + 播放提示音 |
| `NextBook` | 自动打开下一本/上一本 |
| `Loop` | 循环到头部/尾部 |
| `SeamlessLoop` | 无缝循环 |
| `Dialog` | 弹出对话框让用户选择 |

### 3.6 页面移动控制
[BookPageMoveControl.cs](ref/NeeView/BookOperation/BookPageMoveControl.cs) 提供完整的导航 API：
- `MovePrev/MoveNext` — 按帧移动
- `MovePrevOne/MoveNextOne` — 逐页移动
- `ScrollToPrevFrame/ScrollToNextFrame` — 滚动翻页
- `MoveTo(index)` — 跳页
- `MoveToRandom` — 随机跳页
- `MovePrevSize/MoveNextSize(size)` — 批量跳页
- `MovePrevFolder/MoveNextFolder` — 文件夹级别翻页
- `MoveToFirst/MoveToLast` — 首/末页

### 3.7 页面终端处理器
[BookPageTerminator.cs](ref/NeeView/BookOperation/BookPageTerminator.cs) 处理翻页到达边界的逻辑，非常精细：
- 幻灯片模式下自动循环到首页
- 根据 `PageEndAction` 配置执行不同策略
- 循环时可选通知用户
- NextBook 模式支持配置是否重置页面位置

---

## 四、Book 管理系统

### 4.1 Book 核心类
[Book.cs](ref/NeeView/Book/Book.cs) 是 Book 的核心数据模型：
- 持有 `BookSource`（数据源）、`BookPageCollection`（页面集合）
- 支持 `BookMemento`（书签快照/设置记忆）
- 有 `BookAddress` 概念，支持嵌套归档路径
- 支持 Media（视频）、Playlist、普通图片集
- `BookMemoryService` 管理内存
- `ArchiveHint` 用于重新加载时的归档格式提示

### 4.2 BookHub — 中央调度
[BookHub.cs](ref/NeeView/BookHub/BookHub.cs) 是 Book 操作的唯一入口，约 800 行：
- `RequestLoad()` — 加载 Book，支持大量选项（首页、跳过相同、锁定Book、忽略缓存等）
- `RequestUnload()` — 卸载 Book
- `RequestReLoad()` — 重新加载（保持历史顺序）
- `RequestLoadParent()` — 导航到上级目录
- **Book 锁定** (`IsBookLocked`) — 禁止切换 Book
- 完整的事件系统：`BookChanging`, `BookChanged`, `LoadRequesting`, `LoadRequested`, `FolderListSync`, `HistoryListSync`

### 4.3 BookSetting 配置
[BookConfig.cs](ref/NeeView/Config/BookConfig.cs)，约 300 行，功能极其丰富：
- **横长画像判定比率** `WideRatio`（双页模式中判断宽图的阈值）
- **全景模式** `IsPanorama`（帧之间连续滚动）
- **帧方向** `Orientation`（水平/垂直）
- **内容间隔/帧间隔** `ContentsSpace` / `FrameSpace`
- **Book/页面移动优先级**
- **准备就绪后才翻页** `IsReadyToPageMove`
- **终端音效** `TerminalSound`
- **自动递归** `IsAutoRecursive`
- **虚拟页面插入** `IsInsertDummyPage/FirstPage/LastPage` + 颜色配置
- **分页比率** `DividePageRate`（分割模式的切分位置）
- **静态双页索引** `IsStaticWidePage`
- **双页拉伸/对齐** `WidePageStretch` + `WidePageVerticalAlignment`
- **加载中页面颜色** `LoadingPageColor`

---

## 五、归档系统 (Archiver)

[Archiver/](ref/NeeView/Archiver/) 目录包含 60+ 文件，支持极其广泛的格式：

| 归档器 | 格式 |
|--------|------|
| `ZipArchive` | ZIP |
| `SevenZipArchive` | 7z, RAR 等 |
| `PdfArchive` | PDF（Pdfium/WinRT 双实现） |
| `FolderArchive` | 本地文件夹 |
| `MediaArchive` | 媒体文件 |
| `PlaylistArchive` | 播放列表 |
| `SusieArchive` | Susie 插件 |

关键机制：
- `ArchiveCache` — 归档缓存
- `ArchivePreExtractor` — 预解压（内存/临时文件）
- `ArchiveEntryTree` — 嵌套归档树形结构
- `TempFileCache` — 临时文件缓存
- `PreExtractMemory` — 预提取内存管理

---

## 六、图像效果系统

### 6.1 效果类型
[ImageEffectConfig.cs](ref/NeeView/Config/ImageEffectConfig.cs) 定义 13 种效果：
- **Level** — 色阶调整
- **HSV** — 色相/饱和度/明度
- **ColorSelect** — 颜色选择
- **Blur** — 模糊
- **Bloom** — 泛光
- **Monochrome** — 黑白
- **ColorTone** — 色调
- **Sharpen** — 锐化
- **Embossed** — 浮雕
- **Pixelate** — 像素化
- **Magnify** — 放大
- **Ripple** — 波纹
- **Swirl** — 漩涡

### 6.2 缩放滤波器
[ImageResizeFilterConfig.cs](ref/NeeView/Config/ImageResizeFilterConfig.cs) 基于 PhotoSauce.MagicScaler：
- 10+ 种插值算法：NearestNeighbor, Average, Linear, Quadratic, Hermite, Mitchell, CatmullRom, Cubic, CubicSmoother, **Lanczos**, Spline36
- **UnsharpMask** 锐化蒙版：Amount(25-200), Radius(0.3-3.0), Threshold(0-10)

### 6.3 图像裁剪
[ImageTrimConfig.cs](ref/NeeView/Config/ImageTrimConfig.cs) — 四边裁剪，百分比方式（最大 90%），自动互斥约束

---

## 七、幻灯片系统

[SlideShow.cs](ref/NeeView/SlideShow/SlideShow.cs)，约 270 行：
- 基于 `System.Timers.Timer` 实现定时翻页
- **可配置间隔** `SlideShowInterval`（秒，最小 0.1s）
- **鼠标移动取消** `IsCancelSlideByMouseMove`
- **循环播放** `IsSlideShowByLoop`
- **计时器可视化** `IsTimerVisible`
- **暂停/恢复** `PauseSlideShow()` / `ResumeSlideShow()`
- 页面变化时自动重置计时器
- Book 切换时自动停止

---

## 八、触摸/手势系统

### 8.1 触摸输入状态机
[TouchInput.cs](ref/NeeView/TouchInput/TouchInput.cs) 实现多状态触摸处理（约 320 行）：

| 状态 | 说明 |
|------|------|
| `Normal` | 正常触摸 |
| `MouseDrag` | 模拟鼠标拖拽 |
| `Drag` | 触摸拖拽（平移/缩放/旋转） |
| `Gesture` | 触摸手势（方向识别） |
| `Loupe` | 触摸放大镜 |

### 8.2 触摸配置
[TouchConfig.cs](ref/NeeView/Config/TouchConfig.cs)：
- 独立启用/禁用
- 拖拽动作 / 长按动作 可配置
- 角度/缩放独立启用
- 手势最小距离 / 操作最小半径 / 惯性灵敏度

### 8.3 鼠标输入系统
[MouseInput/](ref/NeeView/MouseInput/) 是一个庞大的子系统（60+ 文件）：
- **拖拽动作 (DragAction)** — 20+ 种动作：
  - Move（平移）, Scale（缩放）, Angle（旋转）, FlipH/V（翻转）
  - BaseScale（基底缩放）, Loupe（放大镜）, Gesture（手势）
  - MarqueeZoom（框选缩放）, Hover（悬停）, WindowMove（窗口拖动）
  - 各种 Slider 变体（滑块式控制）
- **鼠标手势识别** `MouseInputGesture` — 方向序列识别
- **惯性物理** `Speedometer`, `MultiSpeedometer`, `InertiaComponent`
- **自动滚动** `MouseInputAutoScroll`

### 8.4 鼠标配置
[MouseConfig.cs](ref/NeeView/Config/MouseConfig.cs)：
- 手势启用/禁用 + 最小距离
- 拖拽启用/禁用 + 最小距离
- **长按模式** `LongButtonDownMode`（默认为放大镜模式）
- **光标自动隐藏** + 隐藏时间 + 移动释放距离
- **悬停滚动** `IsHoverScroll` + 持续时间
- **鼠标滚轮滚动** + 灵敏度 + 动画时长
- **惯性灵敏度** + **自动滚动灵敏度**

---

## 九、面板管理系统

### 9.1 面板接口
[IPanel.cs](ref/NeeView/SidePanels/IPanel.cs) 定义标准面板契约：
- `TypeCode` — 面板标识
- `Icon` / `IconTips` — 图标和提示
- `View` — 延迟加载的面板视图 (`Lazy<FrameworkElement>`)
- `IsVisibleLock` — 可见锁定
- `DefaultPlace` — 默认位置（左/右）

### 9.2 侧面板框架
[SidePanelFrame.cs](ref/NeeView/SidePanels/SidePanelFrame.cs) 管理所有面板可见性：
- **9 种面板**：FolderList, HistoryList, BookmarkList, PageList, FileInfo, EffectInfo, SuperResolution, Navigator, Playlist
- `IsVisibleLocked` — 全局显示锁
- `VisibleAtOnce()` — 一次性显示请求
- `CustomLayoutPanelManager` — 自定义布局面板管理

### 9.3 可用面板列表：
- **Bookshelf**（书架/文件夹浏览）
- **History**（历史记录）
- **Bookmark**（书签）
- **PageList**（页面列表）
- **FileInfo**（文件信息）
- **ImageEffect**（图像效果）
- **SuperResolution**（超分辨率）
- **Navigator**（导航缩略图）
- **Playlist**（播放列表）

---

## 十、书签系统

[Bookmark.cs](ref/NeeView/Bookamrk/Bookmark.cs)：
- 每个书签保存路径 `Path` 和入口时间 `EntryTime`
- 关联 `BookMementoUnit`（记忆当时的 Book 设置）
- 支持自定义命名
- `BookmarkCollection` 管理，支持文件夹组织 (`BookmarkFolder`)、树形结构 (`IBookmarkEntry`, `ITreeListNode`)
- 可进行验证/清理

---

## 十一、历史系统

### 11.1 Book 历史
[BookHistory.cs](ref/NeeView/BookHistory/BookHistory.cs)：
- 记录路径 + 最后访问时间
- 关联缩略图和 BookMemento

### 11.2 历史集合
[BookHistoryCollection.cs](ref/NeeView/BookHistory/BookHistoryCollection.cs)，约 550 行：
- 内部按日期升序 `ObservableCollection` 维护
- 支持搜索历史（书架、书签、历史、页面列表各独立）
- 限制策略：可配数量限制 + 时间限制
- 自动清理无效链接
- JSON 序列化保存/加载
- 配置选项：归档内历史、UNC路径历史、浏览时更新日期、当前文件夹过滤

### 11.3 页面浏览历史
[PageHistory.cs](ref/NeeView/BookHub/PageHistory.cs)：
- 跨 Book 的页面级别前进/后退（类似浏览器 History）
- 容量限制 100 条
- 记录 `BookAddress + PageName`

---

## 十二、加载/流式架构

### 12.1 JobEngine
[JobEngine.cs](ref/NeeView/JobEngine/JobEngine.cs)：
- **多 Worker 并行加载**，可配置 Worker 数量
- Worker 分为 Primary（优先）和 Limited（受限）
- 使用 `JobScheduler` 调度
- 动态调整并发度

### 12.2 BookPageLoader
[BookPageLoader.cs](ref/NeeView/BookPageLoader/BookPageLoader.cs)，约 420 行：
- 核心加载流程：`ClearPageState → LoadMainAsync → LoadAheadAsync`
- **预加载机制** `PreLoadSize`（可配置预读页数，默认 5）
- 基于 `CancellationToken` 的取消机制
- 使用 `LatestValue<T>` 确保只处理最新请求
- 两个独立的 `PageContentJobClient`：
  - `View` — 当下显示的页面（高优先）
  - `Ahead` — 预读页面（低优先）
- `Pause/Resume` 控制

### 12.3 PageContent 加载状态
[PageContent.cs](ref/NeeView/Page/PageContent.cs)：
- 状态机 `PageContentState`
- `UndefinedSize` — 加载前使用前一页的尺寸（减少闪烁）
- 异步锁 `AsyncLock` 保护加载过程
- `PictureInfo` 只设置一次（不可变设计）

---

## 十三、内存管理

### 13.1 BookMemoryService
[BookMemoryService.cs](ref/NeeView/Book/BookMemoryService.cs)：
- 每个 Book 独立的内存池
- **配置化内存限制** `CacheMemorySize`（MB，默认 200MB）
- `Cleanup(origin, direction)` — 基于**距离优先策略**清理：
  - 距离当前页面越远优先卸载
  - 考虑方向因素（阅读方向的前方保留更多）
  - `IsMemoryLocked` 的内容不被清理

### 13.2 MemoryPool
[MemoryPool.cs](ref/NeeView/Page/MemoryPool.cs)：
- 通用内存池，按 Owner 分组管理
- 每个 Owner 可有多个 MemoryElement
- `Cleanup(limitSize, comparer)` — 基于比较器清理最不需要的
- 线程安全 (`System.Threading.Lock`)

### 13.3 性能配置
[PerformanceConfig.cs](ref/NeeView/Config/PerformanceConfig.cs)：
- **缓存内存大小** `CacheMemorySize`（MB）
- **预加载页数** `PreLoadSize`（默认 5）
- **并行 Worker 数** `JobWorkerSize`（默认 4）
- **最大图像尺寸** `MaximumSize`（默认 4096×4096）
- **预解压大小** `PreExtractSolidSize`（MB）
- **加载中页面显示** `IsLoadingPageVisible`

---

## 十四、动画/变换系统

### 14.1 PageFrame 变换架构
[PageFrameBox.cs](ref/NeeView/PageFrames/PageFrameBox.cs)，约 1586 行，是最核心的视图组件：
- `PageFrameContainerCollection` — 容器集合管理
- `PageFrameScrollViewer` — 滚动视图
- `PageFrameContainerCanvas` — Canvas 布局
- `PageFrameContainerCleaner` — 容器清理
- `PageFrameContainerFiller` — 容器填充
- `ContentSizeCalculator` — 内容尺寸计算
- `PageFrameTransformMap` — 变换映射

### 14.2 视图变换
[ViewConfig.cs](ref/NeeView/Config/ViewConfig.cs)，约 440 行：
- **缩放/旋转/翻转保持策略**（页面切换、Book 切换独立配置）
- **旋转中心/缩放中心/翻转中心** 可选 `DragControlCenter`
- **移动限制** `IsLimitMove`（窗口边界约束）
- **角度吸附** `AngleFrequency`
- **滚动动画时长** `ScrollDuration`（0.0-1.0s）
- **翻页动画时长** `PageMoveDuration`（0.0-1.0s）
- **自动旋转策略** `AutoRotatePolicy`（适应视图区/横向/纵向）
- **基底缩放** `IsBaseScaleEnabled`
- **视图起始对齐** `ViewHorizontalOrigin` / `ViewVerticalOrigin`（7+7 种选项）

### 14.3 惯性/缓动系统
PageFrames 目录下有完整的物理动画系统：
- `DecelerationEase` / `LinerEase` / `MultiEase` — 缓动函数
- `Kinematics` — 运动学计算
- `InertiaEaseFactory` — 惯性缓动生成
- `AnimatableTransform` — 可动画化的变换

---

## 十五、放大镜 (Loupe) 系统

### 15.1 配置
[LoupeConfig.cs](ref/NeeView/Config/LoupeConfig.cs)：
- **默认倍率** `DefaultScale`（默认 2.0×）
- **最小/最大倍率** `MinimumScale`(2.0) / `MaximumScale`(10.0)
- **步进** `ScaleStep`（1.0）
- **中心锁定** `IsLoupeCenter`
- **重置策略** `IsResetByRestart` / `IsResetByPageChanged`
- **滚轮缩放** `IsWheelScalingEnabled`
- **速度** `Speed`（0.0-10.0×）
- **ESC 键退出** `IsEscapeKeyEnabled`
- **信息显示** `IsVisibleLoupeInfo`

### 15.2 实现
- [MouseInputLoupe.cs](ref/NeeView/MouseInput/MouseInputLoupe.cs) — 鼠标放大镜模式
- [LoupeTransformContext.cs](ref/NeeView/PageFrames/LoupeTransformContext.cs) — 放大变换上下文
- [TouchInputLoupe.cs](ref/NeeView/TouchInput/TouchInputLoupe.cs) — 触摸放大镜
- 支持 Content/Canvas 两种变换模式（静态帧/滚动帧）

---

## 十六、自动隐藏面板

### 16.1 配置
[AutoHideConfig.cs](ref/NeeView/Config/AutoHideConfig.cs)：
- **隐藏延时** `AutoHideDelayTime`（默认 1.0s）
- **显示延时** `AutoHideDelayVisibleTime`
- **焦点锁模式** `AutoHideFocusLockMode`
- **键盘输入延时** `IsAutoHideKeyDownDelay`
- **热区边距** `AutoHideHitTestHorizontalMargin`(32px) / `AutoHideHitTestVerticalMargin`(32px)
- **冲突解决** `AutoHideConflictTopMargin` / `AutoHideConflictBottomMargin`

### 16.2 实现
[BasicAutoHideDescription.cs](ref/NeeView/MainWindow/BasicAutoHideDescription.cs)：
- 智能检测上下文菜单、拖放、弹窗、重命名等操作，期间锁定可见
- Menu 和 Status 有独立的自动隐藏描述

---

## 十七、键盘快捷键系统

### 17.1 命令表
[CommandTable.cs](ref/NeeView/Command/CommandTable.cs)，约 810 行：
- `Dictionary<string, CommandElement>` 存储所有命令
- 预设方案：TypeA（标准）、TypeB（滚轮翻页）、TypeC（点击翻页）
- 命令可带参数 `CommandParameters`

### 17.2 快捷键
[ShortcutKey.cs](ref/NeeView/Command/ShortcutKey.cs)：
- 支持多手势绑定（逗号分隔）
- `InputGestureSource` 统一键盘和鼠标手势
- JSON 序列化

### 17.3 命令列表（200+命令）
全部定义在 [Commands/](ref/NeeView/Command/Commands/) 目录，涵盖：
- **导航**：NextPage, PrevPage, FirstPage, LastPage, JumpPage, JumpRandomPage, NextScrollPage, PrevScrollPage, NextFolderPage...
- **Book**：NextBook, PrevBook, LoadAs, RandomBook, MoveToChildBook, MoveToParentBook
- **历史**：NextHistory, PrevHistory, NextBookHistory, PrevBookHistory, ClearHistory
- **显示**：ToggleFullScreen, TogglePageMode, ToggleStretchMode, ViewRotate, ViewScale, ViewFlip, ViewReset...
- **效果**：ToggleEffect, ToggleGrid, ToggleNearestNeighbor, ToggleResizeFilter, ToggleTrim
- **面板**：ToggleVisibleBookshelf/PageList/FileInfo/Navigator/Playlist/EffectInfo/BookmarkList/HistoryList...
- **文件操作**：CopyFile, CopyImage, CutFile, DeleteFile, DeleteBook, ExportImage, Print, Paste
- **外部**：OpenExplorer, OpenExternalApp
- **Loupe**：LoupeOn/Off/ScaleUp/ScaleDown
- **设置**：SetBackground(Auto/Black/White/Check...), SetBookOrder, SetSortMode, SetBookReadOrder
- **脚本**：Script, OpenScriptsFolder, CancelScript
- **播放列表**：NextPlaylist, PrevPlaylist, NextPlaylistItem, PrevPlaylistItem, TogglePlaylistItem

---

## 十八、打印功能

[Print/](ref/NeeView/Print/) — [PrintModel.cs](ref/NeeView/Print/PrintModel.cs)，约 675 行：
- **打印模式**：RawImage（原图）、View（视图）、ViewFill（视图填充）、ViewStretch（视图拉伸）
- 支持横向/纵向
- 支持多列/多行打印
- 对齐方式（水平/垂直）
- 自定义边距
- 背景色 / 点阵缩放选项

---

## 十九、导出功能

[ExportImage/](ref/NeeView/ExportImage/)：
- **两种导出模式**：
  - `Original` — 原始图像（`OriginalImageExporter`）
  - `View` — 当前视图（`ViewImageExporter`，包含效果/变换）
- 背景叠加选项
- 原始尺寸 / 视图尺寸
- 点阵保持（像素完美）
- 质量等级
- 预览功能
- 覆盖确认

---

## 二十、外部应用集成

[External/](ref/NeeView/External/)：
- `ExternalApp` — 可配置的外部应用（命令 + 参数 + 工作目录）
- **参数模板** `$FILE` 变量替换
- **归档策略** `ArchivePolicy`（发送解压文件 / 发送归档路径等）
- **目标文件夹** — `DestinationFolder` 系统（复制/移动到预设文件夹）
- **剪贴板** — `ClipboardUtility` + `ClipboardWatcher`
- 文件管理器集成 `OpenExplorer`

---

## 二十一、脚本系统

[Script/](ref/NeeView/Script/) — 非常强大的JS脚本引擎（Jint）：

### 21.1 JavaScriptEngine
[JavascriptEngine.cs](ref/NeeView/Script/JavascriptEngine.cs)：
- 基于 **Jint** (JavaScript Interpreter for .NET)
- 内置函数：`sleep()`, `log()`, `system()`, `include()`
- 暴露 `nv` 对象（即 `CommandHost`）给脚本访问整个应用
- 支持 SQLite（可选）
- 支持 `.NET CLR` 互操作

### 21.2 ScriptManager
[ScriptManager.cs](ref/NeeView/Script/ScriptManager.cs)：
- 脚本文件夹监视（热重载）
- 脚本命令注册到命令表
- 脚本事件系统

### 21.3 脚本 Accessor 层
60+ 个 Accessor 类暴露应用 API 给脚本，包括：`BookAccessor`, `PageAccessor`, `BookmarkPanelAccessor`, `CommandAccessor`, `EnvironmentAccessor`, `WindowAccessor`, `MediaPlayerAccessor` 等

### 21.4 示例脚本
[SampleScripts/](ref/NeeView/SampleScripts/)：
- HelloWorld, GoHome, MoveBookFile, OpenMsPaint
- BaseScaleUp/Down, SlideshowSpeedUp/Down
- OnBookLoaded, OnPageChanged（事件脚本）
- ToggleAspectRatio, TogglePageEndAction
- Startup（启动脚本）

---

## 二十二、播放列表系统

[Playlist/](ref/NeeView/Playlist/)：
- `PlaylistSource` — 版本化格式 (`NeeView.Playlist v2.0.0`)
- `PlaylistSourceItem` — 播放列表条目
- JSON 序列化
- 面板中有独立的 Playlist 面板

---

## 二十三、对 neoview 的参考价值

### 高优先级可借鉴的特性

| 特性 | NeeView 实现 | neoview 应用建议 |
|------|-------------|-----------------|
| **PageEndAction** | 5 种策略(None/NextBook/Loop/SeamlessLoop/Dialog) | 目前 neoview 可能缺少灵活的终端行为 |
| **先读 (PreLoad)** | 方向感知的预读 + 距离优先内存清理 | 基于阅读方向的智能预加载 |
| **放大镜 (Loupe)** | 鼠标/触摸双模式，长按激活 | 非常适合高分辨率图片查看 |
| **双页模式** | 横长判定、虚拟页插入、分割页 | 漫画阅读体验的核心功能 |
| **自动隐藏** | 延时+热区+冲突解决+焦点锁 | 全屏阅读体验必备 |
| **图像效果** | 13种实时效果+缩放滤波器+裁剪 | 高级阅读辅助 |
| **键盘方案预设** | TypeA/B/C三套方案 | 方便不同用户习惯 |
| **页面排序** | 9种模式含随机 | 灵活的阅读顺序控制 |
| **惯性物理** | Speedometer + 缓动函数 | 流畅的触摸/拖拽体验 |

### 架构模式建议

1. **命令队列模式** — BookHub 的 CommandEngine 值得借鉴，避免 Book 加载竞态
2. **内存池 + 距离优先清理** — 非常适合 Tauri 中的图片缓存策略
3. **JobEngine 多 Worker** — 可映射为 Web Worker 或 Rust 多线程
4. **页面历史 (PageHistory)** — 浏览器式前进/后退，提升阅读体验
5. **BookMemento** — 每本书记忆各自的设置（翻页模式、排序、位置），下次打开恢复
6. **脚本系统** — 对高级用户非常有价值，可考虑 JS 脚本扩展
7. **Destination Folder** — 预设文件夹快速分类/归档图片