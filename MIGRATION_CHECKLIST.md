# 文件浏览面板迁移检查清单

## 📋 功能对比分析

### ✅ 已迁移的核心功能

#### 导航和浏览
- [x] 目录导航（push/pop）
- [x] 面包屑导航
- [x] 后退/前进
- [x] 返回主页
- [x] 设置主页
- [x] 文件树（侧边栏）
- [x] 层叠式导航（新面板特性）

#### 文件操作
- [x] 打开文件/文件夹
- [x] 删除文件（单个）
- [x] 删除文件（批量）
- [x] 复制文件
- [x] 剪切文件
- [x] 粘贴文件
- [x] 重命名文件
- [x] 在资源管理器中打开
- [x] 用系统默认应用打开

#### 右键菜单
- [x] 基础右键菜单
- [x] 打开选项
- [x] 删除选项
- [x] 复制/剪切/粘贴
- [x] 重命名
- [x] 添加书签
- [x] 复制路径
- [x] 复制文件名

#### 视图和显示
- [x] 列表视图
- [x] 缩略图视图
- [x] 视图切换
- [x] 排序功能（名称、日期、大小、类型）
- [x] 排序顺序切换（升序/降序）

#### 选择和多选
- [x] 单项选择
- [x] 多项选择（勾选模式）
- [x] 全选
- [x] 取消全选

#### 搜索和过滤
- [x] 搜索栏显示/隐藏
- [x] 搜索关键词过滤
- [x] 搜索结果显示

#### 缩略图管理
- [x] 缩略图加载和显示
- [x] 缩略图缓存
- [x] 压缩包缩略图
- [x] 文件夹缩略图

#### 状态管理
- [x] 当前路径
- [x] 文件列表
- [x] 加载状态
- [x] 错误信息
- [x] 选中项
- [x] 历史记录
- [x] 滚动位置恢复

---

## ⚠️ 遗漏/未完全迁移的功能

### 1. **搜索功能 - 部分缺失**
**状态**: ⚠️ 基础搜索已实现，但高级搜索功能缺失

**老面板功能**:
- 搜索关键词过滤（已迁移 ✅）
- 搜索历史记录（❌ 未迁移）
- 搜索设置：
  - `includeSubfolders` - 递归搜索（❌ 未迁移）
  - `showHistoryOnFocus` - 焦点显示历史（❌ 未迁移）
  - `searchInPath` - 在路径中搜索（❌ 未迁移）
- 搜索结果来源标记（local/bookmark/history）（❌ 未迁移）

**需要添加**:
```typescript
// 在 folderPanelStore 中添加
searchHistory: { query: string; timestamp: number }[]
searchSettings: {
  includeSubfolders: boolean;
  showHistoryOnFocus: boolean;
  searchInPath: boolean;
}
```

**文件**: `src/lib/components/panels/folderPanel/stores/folderPanelStore.svelte.ts`

---

### 2. **删除策略 - 缺失**
**状态**: ❌ 完全缺失

**老面板功能**:
- 删除策略选择：
  - `trash` - 移动到回收站（默认）
  - `permanent` - 永久删除
- 删除策略切换（右键菜单）
- 删除策略持久化

**新面板现状**:
- 硬编码为 `moveToTrash`（总是移动到回收站）
- 无法选择永久删除

**需要添加**:
```typescript
// 在 folderPanelStore 中添加
deleteStrategy: 'trash' | 'permanent';

// 在 FolderPanel.svelte 中添加
function handleToggleDeleteStrategy() {
  const next = deleteStrategy === 'trash' ? 'permanent' : 'trash';
  folderPanelActions.setDeleteStrategy(next);
}
```

**影响文件**:
- `src/lib/components/panels/folderPanel/stores/folderPanelStore.svelte.ts`
- `src/lib/components/panels/folderPanel/FolderPanel.svelte`
- `src/lib/components/panels/folderPanel/components/FolderContextMenu.svelte`

---

### 3. **穿透模式 - 已有但未完全实现**
**状态**: ⚠️ Store 中有定义，但功能未完全实现

**老面板功能**:
- 当文件夹只有一个子文件夹时，自动进入该子文件夹
- 穿透模式开关

**新面板现状**:
- Store 中有 `penetrateMode` 字段
- 但在 `FolderStack` 中未实现自动穿透逻辑

**需要添加**:
- 在 `FolderStack.svelte` 中检查穿透模式
- 当加载目录后，如果只有一个子文件夹且穿透模式开启，自动进入

**文件**: `src/lib/components/panels/folderPanel/components/FolderStack.svelte`

---


---

### 5. **书签功能 - 部分缺失**
**状态**: ⚠️ 基础书签已实现，但搜索结果中的书签来源标记缺失

**老面板功能**:
- 添加书签（已迁移 ✅）
- 书签排序（❌ 未迁移）
- 书签搜索（❌ 未迁移）
- 搜索结果中显示书签来源（❌ 未迁移）

**需要添加**:
- 搜索时包含书签
- 搜索结果中标记来源（local/bookmark/history）

**文件**: `src/lib/components/panels/folderPanel/FolderPanel.svelte`

---

### 6. **历史记录 - 部分缺失**
**状态**: ⚠️ 基础历史已实现，但高级功能缺失

**老面板功能**:
- 导航历史（已迁移 ✅）
- 历史记录缓存（已迁移 ✅）
- 历史记录中的缩略图缓存（❌ 未迁移）
- 历史记录中的滚动位置恢复（❌ 未完全实现）
- 历史记录中的选中项恢复（❌ 未完全实现）

**需要添加**:
- 在 `FolderStack` 中实现滚动位置恢复
- 在 `FolderStack` 中实现选中项恢复

**文件**: `src/lib/components/panels/folderPanel/components/FolderStack.svelte`

---

### 7. **键盘快捷键 - 缺失**
**状态**: ❌ 完全缺失

**老面板功能**:
- 方向键导航（↑↓）
- Enter 打开文件
- Home/End 跳转
- Backspace 返回上级
- F5 刷新

**新面板现状**:
- 完全没有实现

**需要添加**:
- 在 `FolderPanel.svelte` 中添加 `onKeydown` 处理
- 支持所有老面板的快捷键

**文件**: `src/lib/components/panels/folderPanel/FolderPanel.svelte`

---

---

### 9. **文件夹树功能 - 部分缺失**
**状态**: ⚠️ 基础树已实现，但高级功能缺失

**老面板功能**:
- 文件树显示/隐藏（已迁移 ✅）
- 文件树宽度调整（已迁移 ✅）
- 文件树懒加载（已迁移 ✅）
- 主视图树（inline tree）- 在主列表中显示树结构（❌ 未迁移）
- 主视图树展开/折叠状态保存（❌ 未迁移）

**需要添加**:
- 主视图树功能（在文件列表中显示树结构）
- 树节点展开/折叠状态管理

**文件**: 
- `src/lib/components/panels/folderPanel/stores/folderPanelStore.svelte.ts`
- `src/lib/components/panels/folderPanel/components/FolderList.svelte`

---

### 10. **迁移栏功能 - 缺失**
**状态**: ⚠️ UI 存在，但功能不完整

**老面板功能**:
- 迁移栏显示/隐藏（已迁移 ✅）
- 迁移管理器（❌ 功能不完整）

**新面板现状**:
- `MigrationBar` 组件存在但功能不完整

**需要检查**:
- 迁移栏的完整功能实现

**文件**: `src/lib/components/panels/folderPanel/components/MigrationBar.svelte`

---

### 11. **性能优化功能 - 缺失**
**状态**: ❌ 部分缺失

**老面板功能**:
- 合集文件夹优化（超过45个子文件夹时的特殊处理）（❌ 未迁移）
- 小目录优化（≤50项时的特殊处理）（❌ 未迁移）
- 批量扫描文件夹缩略图（❌ 未迁移）
- 相邻目录预取（❌ 未迁移）
- 缓存验证（❌ 未迁移）

**新面板现状**:
- 使用基础的缩略图加载
- 缺少老面板的性能优化

**需要添加**:
- 在 `FolderStack` 中实现合集文件夹优化
- 实现批量扫描和预取

**文件**: `src/lib/components/panels/folderPanel/components/FolderStack.svelte`

---

### 12. **视图模式 - 部分缺失**
**状态**: ⚠️ 基础视图已实现，但高级视图缺失

**老面板功能**:
- 列表视图（已迁移 ✅）
- 缩略图视图（已迁移 ✅）
- 内容视图（❌ 未迁移）
- 横幅视图（❌ 未迁移）

**新面板现状**:
- Store 中定义了 4 种视图模式
- 但 `VirtualizedFileList` 可能不支持所有模式

**需要检查**:
- `VirtualizedFileList` 是否支持 content 和 banner 视图

**文件**: `src/lib/components/panels/file/components/VirtualizedFileList.svelte`

---

## 📊 迁移进度总结

| 类别 | 状态 | 完成度 |
|------|------|--------|
| 导航和浏览 | ✅ | 100% |
| 文件操作 | ✅ | 100% |
| 右键菜单 | ✅ | 95% |
| 视图和显示 | ✅ | 90% |
| 选择和多选 | ✅ | 100% |
| 搜索和过滤 | ⚠️ | 40% |
| 缩略图管理 | ✅ | 100% |
| 状态管理 | ✅ | 95% |
| 快速目标文件夹 | ❌ | 0% |
| 键盘快捷键 | ❌ | 0% |
| 路径栏编辑 | ❌ | 0% |
| 主视图树 | ❌ | 0% |
| 性能优化 | ⚠️ | 30% |

**总体完成度**: ~75%

---

## 🎯 优先级建议

### 高优先级（必须迁移）
1. 删除策略选择 - 影响用户数据安全
2. 键盘快捷键 - 影响用户体验
3. 搜索高级功能 - 影响搜索功能完整性

### 中优先级（应该迁移）
4. 快速目标文件夹 - 提升工作效率
5. 路径栏编辑 - 提升导航便利性
6. 历史记录完整功能 - 提升用户体验

### 低优先级（可选迁移）
7. 主视图树 - 高级功能
8. 内容/横幅视图 - 高级视图模式
9. 性能优化 - 大目录优化

---

## 🔧 迁移步骤

### 第一阶段：关键功能
1. [ ] 添加删除策略选择
2. [ ] 实现键盘快捷键
3. [ ] 完善搜索功能

### 第二阶段：便利功能
4. [ ] 实现快速目标文件夹
5. [ ] 添加路径栏编辑
6. [ ] 完善历史记录功能

### 第三阶段：高级功能
7. [ ] 实现主视图树
8. [ ] 添加高级视图模式
9. [ ] 实现性能优化

---

## 📝 注意事项

1. **缩略图系统**: 新面板已使用新的缩略图系统，与老面板兼容
2. **Store 结构**: 新面板使用独立的 `folderPanelStore`，与 `fileBrowserStore` 分离
3. **组件复用**: 新面板复用了 `VirtualizedFileList` 等老面板的组件
4. **API 兼容**: 新面板使用相同的 FileSystemAPI，无需后端改动

---

## 🗑️ 删除老面板的检查清单

在删除老面板前，确保：
- [ ] 所有关键功能已迁移到新面板
- [ ] 用户界面测试完成
- [ ] 性能测试完成
- [ ] 所有快捷键已实现
- [ ] 搜索功能完整
- [ ] 删除策略功能完整
- [ ] 历史记录功能完整

