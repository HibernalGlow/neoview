# NeoView 统一 Book-Page 系统设计文档

## 1. 问题分析

### 1.1 当前系统的痛点

1. **历史记录粒度不灵活**
   - 当前以 Book（文件夹/压缩包）为单位记录历史
   - 单击视频/图片打开时，实际打开的是父文件夹作为 Book
   - 用户期望：视频 A.mp4 应该有独立的历史记录

2. **无法表达嵌套结构**
   - 压缩包内的压缩包无法正确处理
   - 文件夹内的压缩包作为独立 Book 打开时，丢失上下文

3. **单文件模式的补丁方案不自洽**
   - `singleFileMode` 是临时补丁，逻辑分散
   - 难以扩展和维护

### 1.2 NeeView 的设计智慧

NeeView 通过以下设计解决类似问题：

```
Archive 层级结构：
a.zip (Root Archive)
├── image1.jpg (ArchiveEntry)
├── b.zip (ArchiveEntry → 也是 Archive)
│   ├── image2.jpg
│   └── c.zip
│       └── image3.jpg
```

关键特性：
- **Archive** 有 `Parent` 指向父 Archive
- **ArchiveEntry** 可以是普通文件，也可以是嵌套 Archive
- **BookMemento** 存储 `Path`（Book 路径）+ `Page`（页面名称）
- 历史记录以 Book 为单位，但通过 Page 名称可恢复到具体位置

---

## 2. 新系统设计：统一 Book-Page 模型

### 2.1 核心理念

> **一切皆可为 Book，Book 亦可为 Page**

```
┌─────────────────────────────────────────────────────────────┐
│                    Unified Content Model                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│   ContentItem (统一内容项)                                    │
│   ├── type: 'leaf' | 'container'                             │
│   ├── path: string                                           │
│   ├── name: string                                           │
│   └── parent?: ContentItem                                   │
│                                                               │
│   Leaf (叶子节点): 图片、视频等最终可显示内容                  │
│   Container (容器): 文件夹、压缩包、播放列表等                 │
│                                                               │
│   关键：Container 可以展开为 ContentItem[]                    │
│         Container 也可以作为单个项目在父容器中显示             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据结构设计

#### 2.2.1 ContentItem（统一内容项）

```typescript
/**
 * 统一内容项 - 可以是叶子节点或容器
 */
interface ContentItem {
  /** 唯一标识符（用于缓存和去重） */
  id: string;
  
  /** 内容类型 */
  type: ContentType;
  
  /** 完整路径（用于历史记录和定位） */
  path: string;
  
  /** 显示名称 */
  name: string;
  
  /** 内部路径（对于压缩包内的文件） */
  innerPath?: string;
  
  /** 父容器引用（用于导航回溯） */
  parentRef?: ContentRef;
  
  /** 如果是容器，子项数量（懒加载前的估计值） */
  childCount?: number;
  
  /** 元数据（尺寸、时长等） */
  metadata?: ContentMetadata;
}

type ContentType = 
  | 'image'      // 静态图片
  | 'video'      // 视频
  | 'animated'   // 动图
  | 'archive'    // 压缩包（容器）
  | 'folder'     // 文件夹（容器）
  | 'playlist'   // 播放列表（容器）
  | 'ebook'      // 电子书（PDF/EPUB）
  | 'unknown';

interface ContentRef {
  path: string;
  innerPath?: string;
}

interface ContentMetadata {
  // 图片/视频共用
  width?: number;
  height?: number;
  size?: number;
  
  // 视频专用
  duration?: number;
  
  // 容器专用
  itemCount?: number;
}
```

#### 2.2.2 ViewContext（视图上下文）

```typescript
/**
 * 视图上下文 - 管理当前浏览状态
 * 支持嵌套：可以"进入"一个容器，也可以"返回"父容器
 */
interface ViewContext {
  /** 上下文栈（支持嵌套进入） */
  stack: ViewFrame[];
  
  /** 当前帧 */
  get currentFrame(): ViewFrame | null;
  
  /** 是否可以返回上级 */
  get canGoBack(): boolean;
}

interface ViewFrame {
  /** 当前容器（Book） */
  container: ContentItem;
  
  /** 展开后的子项列表 */
  items: ContentItem[];
  
  /** 当前选中的索引 */
  currentIndex: number;
  
  /** 排序模式 */
  sortMode: SortMode;
  
  /** 筛选条件 */
  filter?: ContentFilter;
}
```

#### 2.2.3 HistoryEntry（历史记录）

```typescript
/**
 * 统一历史记录 - 支持精确定位
 */
interface UnifiedHistoryEntry {
  /** 唯一 ID */
  id: string;
  
  /** 访问路径栈（支持嵌套路径） */
  pathStack: ContentRef[];
  
  /** 最深层的当前项索引 */
  currentIndex: number;
  
  /** 显示名称 */
  displayName: string;
  
  /** 缩略图 */
  thumbnail?: string;
  
  /** 时间戳 */
  timestamp: number;
  
  /** 视频进度（如果是视频） */
  videoProgress?: VideoProgress;
  
  /** 总项数（用于进度显示） */
  totalItems: number;
}

interface VideoProgress {
  position: number;
  duration: number;
  completed: boolean;
}
```

### 2.3 核心行为设计

#### 2.3.1 打开内容的统一流程

```
用户点击 item
    │
    ▼
┌─────────────────────────┐
│ 判断 item.type          │
└─────────────────────────┘
    │
    ├── type = 'image' | 'video' | 'animated'
    │   │
    │   ▼
    │   ┌─────────────────────────────────────┐
    │   │ 叶子节点处理                         │
    │   │ 1. 获取父容器                        │
    │   │ 2. 展开父容器为 ViewFrame            │
    │   │ 3. 定位到 item 的索引                │
    │   │ 4. 记录历史：                        │
    │   │    - pathStack: [父容器, 当前项]     │
    │   │    - currentIndex: 当前索引          │
    │   └─────────────────────────────────────┘
    │
    ├── type = 'archive' | 'folder'
    │   │
    │   ▼
    │   ┌─────────────────────────────────────┐
    │   │ 容器处理                             │
    │   │ 1. 展开容器为 ViewFrame              │
    │   │ 2. 设为当前帧                        │
    │   │ 3. 记录历史：                        │
    │   │    - pathStack: [容器]               │
    │   │    - currentIndex: 0                 │
    │   └─────────────────────────────────────┘
    │
    └── type = 'ebook'
        │
        ▼
        特殊处理（PDF 渲染等）
```

#### 2.3.2 翻页行为

```typescript
async function navigateToIndex(index: number) {
  const frame = viewContext.currentFrame;
  if (!frame) return;
  
  frame.currentIndex = index;
  const currentItem = frame.items[index];
  
  // 构建历史路径栈
  const pathStack = buildPathStack(viewContext.stack, currentItem);
  
  // 更新历史记录（以最深层的叶子节点为准）
  historyStore.upsert({
    pathStack,
    currentIndex: index,
    displayName: currentItem.name,
    totalItems: frame.items.length,
    timestamp: Date.now(),
  });
}

function buildPathStack(stack: ViewFrame[], currentItem: ContentItem): ContentRef[] {
  const refs: ContentRef[] = [];
  
  // 添加所有父容器
  for (const frame of stack) {
    refs.push({
      path: frame.container.path,
      innerPath: frame.container.innerPath,
    });
  }
  
  // 如果当前项是叶子节点，添加它
  if (!isContainer(currentItem)) {
    refs.push({
      path: currentItem.path,
      innerPath: currentItem.innerPath,
    });
  }
  
  return refs;
}
```

#### 2.3.3 从历史记录恢复

```typescript
async function restoreFromHistory(entry: UnifiedHistoryEntry) {
  // 清空当前上下文
  viewContext.clear();
  
  // 逐层恢复路径栈
  for (let i = 0; i < entry.pathStack.length; i++) {
    const ref = entry.pathStack[i];
    const isLast = i === entry.pathStack.length - 1;
    
    if (isLast && !isContainerPath(ref.path)) {
      // 最后一层是叶子节点，找到其在父容器中的索引
      const frame = viewContext.currentFrame!;
      const index = frame.items.findIndex(item => 
        item.path === ref.path && item.innerPath === ref.innerPath
      );
      if (index >= 0) {
        frame.currentIndex = index;
      }
    } else {
      // 容器层，展开并推入栈
      const container = await loadContentItem(ref);
      const items = await expandContainer(container);
      viewContext.push({ container, items, currentIndex: 0 });
    }
  }
  
  // 恢复最终索引
  if (viewContext.currentFrame) {
    viewContext.currentFrame.currentIndex = entry.currentIndex;
  }
}
```

### 2.4 直接替换策略

**完全替换现有系统，不保留兼容层**

```
删除：
- src/lib/stores/book.svelte.ts (旧 BookStore)
- src/lib/stores/history.svelte.ts (旧 HistoryStore)
- src/lib/api/book.ts (旧 API)

新增：
- src/lib/stores/viewContext.svelte.ts (新 ViewContextStore)
- src/lib/stores/unifiedHistory.svelte.ts (新 HistoryStore)
- src/lib/api/content.ts (新 API)
- src/lib/types/content.ts (新类型)
```

**历史数据迁移**：首次启动时自动转换 localStorage 中的旧格式

---

## 3. 实现计划（直接迁移）

### 3.1 Step 1: 新建类型和 Store

```bash
# 新建文件
src/lib/types/content.ts          # ContentItem, ViewFrame 等类型
src/lib/stores/viewContext.svelte.ts   # ViewContextStore
src/lib/stores/unifiedHistory.svelte.ts # UnifiedHistoryStore
src/lib/api/content.ts            # 新的 Tauri API 封装
```

### 3.2 Step 2: 后端 API 调整

```bash
# 新增/修改 Rust commands
src-tauri/src/commands/content_commands.rs  # 新命令
- load_content_item(path, innerPath?) -> ContentItem
- expand_container(path, innerPath?, sort) -> ContentItem[]
- load_content_data(path, innerPath?) -> PageData

# 复用现有
- page_manager/mod.rs (内存池、缓存逻辑)
- archive.rs (压缩包处理)
```

### 3.3 Step 3: 替换所有引用

```bash
# 全局搜索替换
bookStore -> viewContextStore
historyStore -> unifiedHistoryStore

# 主要文件
src/lib/components/viewer/*.svelte
src/lib/components/panels/*.svelte
src/lib/cards/**/*.svelte
```

### 3.4 Step 4: 删除旧代码

```bash
# 删除
src/lib/stores/book.svelte.ts
src/lib/stores/history.svelte.ts
src/lib/api/book.ts
```

---

## 4. API 设计

### 4.1 前端 API

```typescript
// ViewContext Store
const viewContextStore = createViewContextStore();

// 基本操作
viewContextStore.open(path: string): Promise<void>
viewContextStore.openItem(item: ContentItem): Promise<void>
viewContextStore.navigateTo(index: number): Promise<void>
viewContextStore.next(): Promise<void>
viewContextStore.previous(): Promise<void>

// 嵌套操作
viewContextStore.enterContainer(index: number): Promise<void>
viewContextStore.exitContainer(): Promise<void>

// 状态访问
viewContextStore.currentFrame: ViewFrame | null
viewContextStore.currentItem: ContentItem | null
viewContextStore.canGoBack: boolean
viewContextStore.canNext: boolean
viewContextStore.canPrevious: boolean
```

### 4.2 后端 API (Tauri Commands)

```rust
// 内容加载
#[command]
async fn load_content_item(path: String, inner_path: Option<String>) 
    -> Result<ContentItem, String>

#[command]
async fn expand_container(path: String, inner_path: Option<String>, sort: SortMode) 
    -> Result<Vec<ContentItem>, String>

// 页面数据（复用现有）
#[command]
async fn load_page_data(path: String, inner_path: Option<String>) 
    -> Result<PageData, String>
```

---

## 5. 关键决策点

### 5.1 历史记录粒度

**选项 A**: 始终记录最深层的叶子节点
- 优点：用户点击视频 A，历史显示视频 A
- 缺点：历史列表可能很长

**选项 B**: 记录容器 + 当前项路径
- 优点：类似 NeeView，历史更紧凑
- 缺点：需要二次导航才能到达具体项

**推荐**: 选项 A，配合分组显示
- 历史列表按父容器分组
- 支持展开/折叠

### 5.2 嵌套深度限制

**推荐**: 最大 5 层嵌套
- 防止无限递归
- 覆盖绝大多数实际场景

### 5.3 缓存策略

**推荐**: 分层缓存
- L1: 当前帧的内容
- L2: 最近访问的 3 个帧
- L3: 磁盘缓存（缩略图等）

---

## 6. 风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 大量代码变动 | 高 | 逐文件替换，每步编译测试 |
| 历史记录丢失 | 中 | 首次启动自动迁移旧数据 |
| 性能下降 | 中 | 懒加载，复用现有缓存系统 |
| UI 适配工作量 | 中 | 保持组件接口相似 |

---

## 7. 总结

新的统一 Book-Page 系统通过以下方式解决当前痛点：

1. **统一数据模型**: ContentItem 统一表示所有内容类型
2. **上下文栈**: ViewContext 支持嵌套进入和返回
3. **精确历史**: 路径栈精确记录每次访问位置
4. **直接替换**: 一次性迁移，代码更干净

参考 NeeView 架构，简化并优化。

---

## 8. 下一步

确认设计后，从 Step 1 开始实现：

```bash
# 首先创建类型定义
src/lib/types/content.ts
```

是否开始实现？
