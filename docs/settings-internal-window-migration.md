# 设置窗口迁移方案：从独立窗口到内部面板

## 当前架构

设置功能目前使用独立的 Tauri WebView 窗口实现：
- `settings.html` - 设置窗口入口
- `src/settings.ts` - 设置窗口初始化
- `src/lib/Settings.svelte` - 设置窗口主组件
- `src/lib/components/panels/` - 各个设置面板组件

### 当前问题
1. **跨窗口数据同步复杂** - 需要 Tauri 事件或 localStorage 事件同步
2. **主题/字体/布局设置需要特殊处理** - 设置后需通知主窗口刷新
3. **用户体验割裂** - 弹出独立窗口，切换不便

## 迁移方案

将设置功能集成到主窗口的侧边栏面板中。

### 涉及文件

#### 需要修改的文件

1. **`src/lib/stores/sidebarConfig.svelte.ts`**
   - `settings` 面板已定义，将 `defaultVisible` 改为 `true` 或按需显示

2. **`src/lib/components/layout/LeftSidebar.svelte`** 或 **`RightSidebar.svelte`**
   - 添加设置面板的渲染逻辑
   - 当 `activePanel === 'settings'` 时显示 `<Settings />` 组件

3. **`src/lib/components/layout/TopToolbar.svelte`** 和 **`TitleBar.svelte`**
   - 修改 `openSettings()` 函数：
   ```typescript
   // 旧代码（打开独立窗口）
   async function openSettings() {
     const existingWindow = await WebviewWindow.getByLabel('settings');
     if (existingWindow) {
       await existingWindow.setFocus();
     } else {
       new WebviewWindow('settings', { url: '/settings.html', ... });
     }
   }
   
   // 新代码（显示内部面板）
   import { setActivePanelTab, sidebarConfigStore } from '$lib/stores/sidebarConfig.svelte';
   
   function openSettings() {
     // 确保设置面板可见
     sidebarConfigStore.setPanelVisible('settings', true);
     // 激活设置面板
     setActivePanelTab('settings');
     // 确保侧边栏打开
     sidebarConfigStore.setLeftSidebarOpen(true);
   }
   ```

4. **`src/lib/Settings.svelte`**
   - 移除窗口特定逻辑（如窗口关闭按钮）
   - 改为通用面板组件，支持在侧边栏中使用

#### 可删除的文件

完成迁移后可删除：
- `settings.html`
- `src/settings.ts`
- `src-tauri/tauri.conf.json` 中的 settings 窗口配置

### 迁移步骤

#### 步骤 1：创建内部设置面板组件

在 `src/lib/components/panels/` 创建 `SettingsPanel.svelte`，复用现有设置面板：

```svelte
<script lang="ts">
  import ThemePanel from './ThemePanel.svelte';
  import SidebarManagementPanel from './SidebarManagementPanel.svelte';
  import StartupConfigPanel from './StartupConfigPanel.svelte';
  // ... 其他设置面板
  
  let activeTab = $state('theme');
</script>

<div class="settings-panel">
  <!-- 标签导航 -->
  <div class="tabs">
    <button onclick={() => activeTab = 'theme'}>主题</button>
    <button onclick={() => activeTab = 'sidebar'}>边栏</button>
    <button onclick={() => activeTab = 'startup'}>启动</button>
  </div>
  
  <!-- 面板内容 -->
  {#if activeTab === 'theme'}
    <ThemePanel />
  {:else if activeTab === 'sidebar'}
    <SidebarManagementPanel />
  {:else if activeTab === 'startup'}
    <StartupConfigPanel />
  {/if}
</div>
```

#### 步骤 2：在侧边栏中渲染设置面板

修改 `LeftSidebar.svelte` 或相关组件：

```svelte
{#if $activePanel === 'settings'}
  <SettingsPanel />
{/if}
```

#### 步骤 3：更新设置按钮逻辑

修改 `TopToolbar.svelte` 和 `TitleBar.svelte` 中的 `openSettings` 函数。

#### 步骤 4：清理独立窗口相关代码

删除不再需要的文件和配置。

## 影响分析

### 正面影响

1. **数据同步简化** - 不再需要跨窗口同步
2. **代码简化** - 移除 `settings.ts`、事件监听等
3. **用户体验提升** - 设置集成在主界面，切换更自然
4. **资源节省** - 少一个 WebView 实例

### 负面影响

1. **设置面板占用侧边栏空间** - 需要合理的 UI 设计
2. **复杂设置可能需要更多滚动** - 独立窗口有更大空间
3. **迁移工作量** - 需要重构现有代码

### 需要移除的跨窗口同步代码

完成迁移后可删除：

1. **`src/lib/config/themeConfig.ts`** 中的 Tauri 事件广播
2. **`src/lib/utils/runtimeTheme.ts`** 中的事件监听
3. **`src/lib/utils/fontManager.ts`** 中的事件监听
4. **`src/lib/stores/sidebarConfig.svelte.ts`** 中的 `initSidebarConfigListener`
5. **`src/main.ts`** 中的监听器初始化

## 推荐方案

**短期**：保持当前独立窗口架构，使用 Tauri 事件同步（已实现）

**长期**：迁移到内部面板架构，简化代码和提升体验

---

最后更新：2024-12
