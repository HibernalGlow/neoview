<!--
  SidebarControlLayer - 边栏浮动控制层
  从 SidebarFloatingControl 移植，集成到 StackView 层系统
  z-index: 85
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    topToolbarLockState,
    bottomBarLockState,
    leftSidebarLockState,
    rightSidebarLockState,
    topToolbarPinned,
    bottomThumbnailBarPinned,
    leftSidebarPinned,
    rightSidebarPinned,
    topToolbarOpen,
    bottomBarOpen,
    leftSidebarOpen,
    rightSidebarOpen,
    type SidebarLockState
  } from '$lib/stores/ui.svelte';
  import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
  import {
    PanelTop,
    PanelBottom,
    PanelLeft,
    PanelRight,
    Lock,
    GripVertical,
    RotateCcw
  } from '@lucide/svelte';
  import { LayerZIndex } from '../types/layer';

  // 控制器状态
  let enabled = $state(true);
  let position = $state<{ x: number; y: number }>({ x: 100, y: 100 });

  // 拖拽状态
  let isDragging = false;
  let dragStartMouseX = 0;
  let dragStartMouseY = 0;
  let dragStartPosX = 0;
  let dragStartPosY = 0;

  // 边栏锁定状态（三态：null = 自动，true = 锁定展开，false = 锁定隐藏）
  let topLock = $state<SidebarLockState>(null);
  let bottomLock = $state<SidebarLockState>(null);
  let leftLock = $state<SidebarLockState>(null);
  let rightLock = $state<SidebarLockState>(null);

  // 边栏 pinned 状态
  let topPinned = $state(false);
  let bottomPinned = $state(false);
  let leftPinned = $state(false);
  let rightPinned = $state(false);

  // 边栏 open 状态
  let topOpen = $state(false);
  let bottomOpen = $state(false);
  let leftOpen = $state(false);
  let rightOpen = $state(false);

  // 订阅 stores
  const unsubTopLock = topToolbarLockState.subscribe((v) => (topLock = v));
  const unsubBottomLock = bottomBarLockState.subscribe((v) => (bottomLock = v));
  const unsubLeftLock = leftSidebarLockState.subscribe((v) => (leftLock = v));
  const unsubRightLock = rightSidebarLockState.subscribe((v) => (rightLock = v));
  const unsubTopPinned = topToolbarPinned.subscribe((v) => (topPinned = v));
  const unsubBottomPinned = bottomThumbnailBarPinned.subscribe((v) => (bottomPinned = v));
  const unsubLeftPinned = leftSidebarPinned.subscribe((v) => (leftPinned = v));
  const unsubRightPinned = rightSidebarPinned.subscribe((v) => (rightPinned = v));
  const unsubTopOpen = topToolbarOpen.subscribe((v) => (topOpen = v));
  const unsubBottomOpen = bottomBarOpen.subscribe((v) => (bottomOpen = v));
  const unsubLeftOpen = leftSidebarOpen.subscribe((v) => (leftOpen = v));
  const unsubRightOpen = rightSidebarOpen.subscribe((v) => (rightOpen = v));

  function syncFromSettings() {
    const s = settingsManager.getSettings();
    const ctrl = s.view?.sidebarControl;
    enabled = ctrl?.enabled ?? true;
    position = ctrl?.position ?? { x: 100, y: 100 };
  }

  syncFromSettings();

  const settingsListener = (s: NeoViewSettings) => {
    const ctrl = s.view?.sidebarControl;
    enabled = ctrl?.enabled ?? true;
    position = ctrl?.position ?? { x: 100, y: 100 };
  };

  settingsManager.addListener(settingsListener);

  onDestroy(() => {
    unsubTopLock();
    unsubBottomLock();
    unsubLeftLock();
    unsubRightLock();
    unsubTopPinned();
    unsubBottomPinned();
    unsubLeftPinned();
    unsubRightPinned();
    unsubTopOpen();
    unsubBottomOpen();
    unsubLeftOpen();
    unsubRightOpen();
    settingsManager.removeListener(settingsListener);
  });

  function savePosition() {
    const current = settingsManager.getSettings();
    const prev = current.view?.sidebarControl ?? { enabled: true, position: { x: 100, y: 100 } };
    settingsManager.updateNestedSettings('view', {
      sidebarControl: { ...prev, position }
    });
  }

  function resetPosition() {
    position = { x: 100, y: 100 };
    savePosition();
  }

  function handleDragStart(event: MouseEvent) {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    isDragging = true;
    dragStartMouseX = event.clientX;
    dragStartMouseY = event.clientY;
    dragStartPosX = position.x;
    dragStartPosY = position.y;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartMouseX;
      const dy = e.clientY - dragStartMouseY;
      position = {
        x: Math.max(0, Math.min(window.innerWidth - 200, dragStartPosX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 50, dragStartPosY + dy))
      };
    };

    const handleMouseUp = () => {
      isDragging = false;
      savePosition();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleTopClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (topLock === false) {
      topToolbarLockState.set(null);
    }
    topToolbarOpen.update((v) => !v);
  }

  function handleTopContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (topLock === null) {
      topToolbarLockState.set(true);
      topToolbarPinned.set(true);
    } else if (topLock === true) {
      topToolbarLockState.set(false);
      topToolbarPinned.set(false);
    } else {
      topToolbarLockState.set(null);
    }
  }

  function handleBottomClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (bottomLock === false) {
      bottomBarLockState.set(null);
    }
    bottomBarOpen.update((v) => !v);
  }

  function handleBottomContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (bottomLock === null) {
      bottomBarLockState.set(true);
      bottomThumbnailBarPinned.set(true);
    } else if (bottomLock === true) {
      bottomBarLockState.set(false);
      bottomThumbnailBarPinned.set(false);
    } else {
      bottomBarLockState.set(null);
    }
  }

  function handleLeftClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (leftLock === false) {
      leftSidebarLockState.set(null);
    }
    leftSidebarOpen.update((v) => !v);
  }

  function handleLeftContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (leftLock === null) {
      leftSidebarLockState.set(true);
      leftSidebarPinned.set(true);
      leftSidebarOpen.set(true);
    } else if (leftLock === true) {
      leftSidebarLockState.set(false);
      leftSidebarPinned.set(false);
      leftSidebarOpen.set(false);
    } else {
      leftSidebarLockState.set(null);
    }
  }

  function handleRightClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (rightLock === false) {
      rightSidebarLockState.set(null);
    }
    rightSidebarOpen.update((v) => !v);
  }

  function handleRightContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (rightLock === null) {
      rightSidebarLockState.set(true);
      rightSidebarPinned.set(true);
      rightSidebarOpen.set(true);
    } else if (rightLock === true) {
      rightSidebarLockState.set(false);
      rightSidebarPinned.set(false);
      rightSidebarOpen.set(false);
    } else {
      rightSidebarLockState.set(null);
    }
  }

  function getButtonClass(lockState: SidebarLockState, isOpen?: boolean): string {
    if (lockState === true) return 'bg-primary text-primary-foreground';
    if (lockState === false) return 'bg-destructive/80 text-destructive-foreground';
    if (isOpen) return 'bg-secondary text-secondary-foreground';
    return 'bg-muted/60 text-muted-foreground hover:bg-muted';
  }

  function getStateText(lockState: SidebarLockState, isOpen: boolean): string {
    if (lockState === true) return '锁定展开';
    if (lockState === false) return '锁定隐藏';
    return isOpen ? '展开' : '隐藏';
  }
</script>

{#if enabled}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pointer-events-auto absolute"
    data-layer="SidebarControlLayer"
    data-layer-id="sidebar-control"
    style:z-index={LayerZIndex.SIDEBAR_CONTROL}
    style:left="{position.x}px"
    style:top="{position.y}px"
    onclick={(e) => e.stopPropagation()}
    onmousedown={(e) => e.stopPropagation()}
  >
    <div class="border-border/60 bg-background/80 flex items-center gap-0.5 rounded-lg border p-1 shadow-lg backdrop-blur-sm">
      <!-- 拖拽手柄 -->
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground cursor-move p-1 transition-colors"
        onmousedown={handleDragStart}
        aria-label="拖动控制器"
      >
        <GripVertical class="h-4 w-4" />
      </button>

      <!-- 上边栏 -->
      <button
        type="button"
        class="relative rounded p-1.5 transition-colors {getButtonClass(topLock, topOpen)}"
        onclick={handleTopClick}
        oncontextmenu={handleTopContextMenu}
        title={getStateText(topLock, topOpen) + '，单击切换，右键锁定'}
      >
        <PanelTop class="h-4 w-4" />
        {#if topLock !== null}
          <Lock class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5" />
        {/if}
      </button>

      <!-- 下边栏 -->
      <button
        type="button"
        class="relative rounded p-1.5 transition-colors {getButtonClass(bottomLock, bottomOpen)}"
        onclick={handleBottomClick}
        oncontextmenu={handleBottomContextMenu}
        title={getStateText(bottomLock, bottomOpen) + '，单击切换，右键锁定'}
      >
        <PanelBottom class="h-4 w-4" />
        {#if bottomLock !== null}
          <Lock class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5" />
        {/if}
      </button>

      <!-- 左边栏 -->
      <button
        type="button"
        class="relative rounded p-1.5 transition-colors {getButtonClass(leftLock, leftOpen)}"
        onclick={handleLeftClick}
        oncontextmenu={handleLeftContextMenu}
        title={getStateText(leftLock, leftOpen) + '，单击切换，右键锁定'}
      >
        <PanelLeft class="h-4 w-4" />
        {#if leftLock !== null}
          <Lock class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5" />
        {/if}
      </button>

      <!-- 右边栏 -->
      <button
        type="button"
        class="relative rounded p-1.5 transition-colors {getButtonClass(rightLock, rightOpen)}"
        onclick={handleRightClick}
        oncontextmenu={handleRightContextMenu}
        title={getStateText(rightLock, rightOpen) + '，单击切换，右键锁定'}
      >
        <PanelRight class="h-4 w-4" />
        {#if rightLock !== null}
          <Lock class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5" />
        {/if}
      </button>

      <!-- 分隔线 -->
      <div class="bg-border/60 mx-0.5 h-4 w-px"></div>

      <!-- 重置位置 -->
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1.5 transition-colors"
        onclick={resetPosition}
        title="重置控制器位置"
      >
        <RotateCcw class="h-4 w-4" />
      </button>
    </div>
  </div>
{/if}
