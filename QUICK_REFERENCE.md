# 文件面板迁移快速参考

## 🎯 一句话总结

新面板已完成 75% 的迁移，**需要补充 12 个遗漏功能**才能完全替代老面板。

---

## 📊 遗漏功能速查表

### 🔴 高优先级（必须做）

| # | 功能 | 状态 | 工作量 | 文件 |
|---|------|------|--------|------|
| 1 | 删除策略选择 | ⚠️ | 2-3h | folderPanelStore.ts, FolderPanel.svelte |
| 2 | 键盘快捷键 | ❌ | 2-3h | FolderPanel.svelte |
| 3 | 搜索高级功能 | ⚠️ | 2-3h | folderPanelStore.ts, FolderPanel.svelte |

### 🟡 中优先级（应该做）

| # | 功能 | 状态 | 工作量 | 文件 |
|---|------|------|--------|------|
| 4 | 快速目标文件夹 | ❌ | 3-4h | folderPanelStore.ts, FolderContextMenu.svelte |
| 5 | 路径栏编辑 | ❌ | 1-2h | BreadcrumbBar.svelte |
| 6 | 历史记录完整功能 | ⚠️ | 1-2h | FolderStack.svelte |

### 🟢 低优先级（可选）

| # | 功能 | 状态 | 工作量 | 文件 |
|---|------|------|--------|------|
| 7 | 主视图树 | ❌ | 4-6h | folderPanelStore.ts, FolderList.svelte |
| 8 | 高级视图模式 | ⚠️ | 4-6h | VirtualizedFileList.svelte |
| 9 | 性能优化 | ⚠️ | 5-8h | FolderStack.svelte |
| 10 | 搜索结果标记 | ❌ | 1-2h | FolderPanel.svelte |
| 11 | 穿透模式完整实现 | ⚠️ | 1h | FolderStack.svelte |
| 12 | 迁移栏功能 | ⚠️ | 2-3h | MigrationBar.svelte |

---

## 🚀 快速实现指南

### 1️⃣ 删除策略选择（最重要）

**问题**: 无法选择永久删除

**快速修复**:
```typescript
// 1. 在 folderPanelStore.ts 中添加
deleteStrategy: 'trash' | 'permanent'

// 2. 在 FolderPanel.svelte 中修改删除函数
if ($deleteStrategy === 'trash') {
  await FileSystemAPI.moveToTrash(item.path);
} else {
  await FileSystemAPI.deletePath(item.path);
}

// 3. 在工具栏中添加切换按钮
```

**详细指南**: 见 `MIGRATION_IMPLEMENTATION_GUIDE.md` 第 1 节

---

### 2️⃣ 键盘快捷键（最常用）

**问题**: 无法使用快捷键操作

**快速修复**:
```typescript
// 在 FolderPanel.svelte 中添加
function handleKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowDown': // 向下
    case 'ArrowUp': // 向上
    case 'Enter': // 打开
    case 'Home': // 首项
    case 'End': // 末项
    case 'Backspace': // 返回
    case 'F5': // 刷新
    case 'Delete': // 删除
    // ... 实现逻辑
  }
}

document.addEventListener('keydown', handleKeydown);
```

**详细指南**: 见 `MIGRATION_IMPLEMENTATION_GUIDE.md` 第 2 节

---

### 3️⃣ 搜索高级功能（最实用）

**问题**: 搜索功能不完整

**快速修复**:
```typescript
// 1. 在 folderPanelStore.ts 中添加
searchHistory: { query: string; timestamp: number }[]
searchSettings: {
  includeSubfolders: boolean;
  showHistoryOnFocus: boolean;
  searchInPath: boolean;
}

// 2. 在 FolderPanel.svelte 中修改搜索逻辑
function handleSearch(keyword: string) {
  folderPanelActions.addSearchHistory(keyword);
  folderPanelActions.setSearchKeyword(keyword);
}
```

**详细指南**: 见 `MIGRATION_IMPLEMENTATION_GUIDE.md` 第 3 节

---

## 📋 完整检查清单

### 高优先级（第 1 周）
- [ ] 删除策略选择
  - [ ] Store 中添加 deleteStrategy
  - [ ] 删除函数中使用策略
  - [ ] 工具栏添加按钮
  - [ ] 右键菜单添加选项
  - [ ] 测试删除功能

- [ ] 键盘快捷键
  - [ ] 实现方向键导航
  - [ ] 实现 Enter 打开
  - [ ] 实现 Home/End
  - [ ] 实现 Backspace 返回
  - [ ] 实现 F5 刷新
  - [ ] 实现 Delete 删除
  - [ ] 实现 Ctrl+A 全选
  - [ ] 实现 Ctrl+F 搜索

- [ ] 搜索高级功能
  - [ ] Store 中添加搜索历史
  - [ ] Store 中添加搜索设置
  - [ ] 实现搜索历史显示
  - [ ] 实现递归搜索
  - [ ] 实现路径搜索
  - [ ] 测试搜索功能

### 中优先级（第 2 周）
- [ ] 快速目标文件夹
- [ ] 路径栏编辑
- [ ] 历史记录完整功能

### 低优先级（可选）
- [ ] 主视图树
- [ ] 高级视图模式
- [ ] 性能优化

---

## 🔗 相关资源

| 文件 | 说明 |
|------|------|
| `MIGRATION_CHECKLIST.md` | 详细的功能对比清单 |
| `MIGRATION_IMPLEMENTATION_GUIDE.md` | 完整的实现指南 |
| `MIGRATION_SUMMARY.md` | 详细的迁移总结 |
| `FileBrowser.svelte` | 老面板代码（参考） |
| `FolderPanel.svelte` | 新面板主文件 |
| `folderPanelStore.svelte.ts` | 新面板状态管理 |

---

## 💡 关键提示

1. **优先级**: 先做高优先级，再做中优先级，最后做低优先级
2. **测试**: 每完成一个功能就测试一次
3. **参考**: 老面板代码在 `FileBrowser.svelte` 中，可以参考实现
4. **Store**: 新面板使用独立的 `folderPanelStore`，不要混淆
5. **API**: 使用相同的 `FileSystemAPI`，无需后端改动

---

## ⏱️ 时间估计

| 阶段 | 功能 | 工作量 | 时间 |
|------|------|--------|------|
| 第 1 周 | 高优先级（3 个） | 6-9h | 1 周 |
| 第 2 周 | 中优先级（3 个） | 5-8h | 1 周 |
| 第 3 周 | 测试和优化 | 4-6h | 1 周 |
| **总计** | **12 个功能** | **15-23h** | **3 周** |

---

## 🎯 最小可行方案

如果时间紧张，最少需要完成这 3 个功能才能替代老面板：

1. **删除策略选择** - 影响数据安全
2. **键盘快捷键** - 影响用户体验
3. **搜索高级功能** - 影响搜索完整性

**最小工作量**: 6-9 小时

---

## 📞 问题排查

### 问题：不知道从哪里开始？
**答**: 从 `MIGRATION_IMPLEMENTATION_GUIDE.md` 的第 1 节开始，按顺序实现。

### 问题：如何参考老面板的实现？
**答**: 打开 `FileBrowser.svelte`，搜索对应的函数名（如 `deleteItems`、`handleKeydown`）。

### 问题：新面板的 Store 结构是什么？
**答**: 查看 `folderPanelStore.svelte.ts`，所有状态都在 `FolderPanelState` 接口中定义。

### 问题：如何测试新功能？
**答**: 在浏览器开发者工具中测试，或者编写单元测试。

---

## 📝 实现模板

### 添加新的 Store 字段

```typescript
// 1. 在 FolderPanelState 中添加
export interface FolderPanelState {
  // ... 现有字段 ...
  newField: any;
}

// 2. 在 initialState 中初始化
const initialState: FolderPanelState = {
  // ... 现有字段 ...
  newField: defaultValue
};

// 3. 导出 derived store
export const newField = derived(state, ($state) => $state.newField);

// 4. 添加 action
export const folderPanelActions = {
  // ... 现有 actions ...
  setNewField(value: any) {
    state.update((s) => ({ ...s, newField: value }));
  }
};
```

### 在组件中使用

```svelte
<script lang="ts">
  import { newField, folderPanelActions } from './stores/folderPanelStore.svelte';
</script>

<!-- 读取 -->
<div>{$newField}</div>

<!-- 修改 -->
<button on:click={() => folderPanelActions.setNewField(newValue)}>
  Update
</button>
```

---

## ✅ 完成后的检查

完成所有高优先级功能后，检查以下项目：

- [ ] 所有功能都能正常工作
- [ ] 没有控制台错误
- [ ] 性能没有明显下降
- [ ] 用户反馈积极
- [ ] 可以安全删除老面板

