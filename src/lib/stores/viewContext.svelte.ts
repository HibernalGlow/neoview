/**
 * NeoView - ViewContext Store
 * 统一视图上下文管理 (Svelte 5 Runes)
 */

import { SvelteMap } from 'svelte/reactivity';
import type {
  ContentItem,
  ContentRef,
  ViewFrame,
  ViewContextState,
  SortMode,
  ReadOrder,
} from '$lib/types/content';
import {
  isContainer,
  inferContentType,
  createRef,
} from '$lib/types/content';
import * as contentApi from '$lib/api/content';

// ==================== Store 类 ====================

class ViewContextStore {
  // === 状态 ===
  private state = $state<ViewContextState>({
    stack: [],
    loading: false,
    error: '',
    viewerOpen: false,
  });

  // 缩略图缓存
  private thumbnailCache = $state<SvelteMap<string, string>>(new SvelteMap());

  // === 派生状态 ===

  /** 当前帧 */
  get currentFrame(): ViewFrame | null {
    return this.state.stack.length > 0 
      ? this.state.stack[this.state.stack.length - 1] 
      : null;
  }

  /** 当前项 */
  get currentItem(): ContentItem | null {
    const frame = this.currentFrame;
    if (!frame || frame.items.length === 0) return null;
    return frame.items[frame.currentIndex] ?? null;
  }

  /** 当前索引 */
  get currentIndex(): number {
    return this.currentFrame?.currentIndex ?? 0;
  }

  /** 总项数 */
  get totalItems(): number {
    return this.currentFrame?.items.length ?? 0;
  }

  /** 栈深度 */
  get stackDepth(): number {
    return this.state.stack.length;
  }

  /** 是否可返回上级 */
  get canGoBack(): boolean {
    return this.state.stack.length > 1;
  }

  /** 是否可以下一项 */
  get canNext(): boolean {
    const frame = this.currentFrame;
    return frame !== null && frame.currentIndex < frame.items.length - 1;
  }

  /** 是否可以上一项 */
  get canPrevious(): boolean {
    const frame = this.currentFrame;
    return frame !== null && frame.currentIndex > 0;
  }

  /** 是否正在加载 */
  get loading(): boolean {
    return this.state.loading;
  }

  /** 错误信息 */
  get error(): string {
    return this.state.error;
  }

  /** 查看器是否打开 */
  get viewerOpen(): boolean {
    return this.state.viewerOpen;
  }

  /** 获取面包屑路径 */
  get breadcrumbs(): { name: string; ref: ContentRef }[] {
    return this.state.stack.map(frame => ({
      name: frame.container.name,
      ref: createRef(frame.container.path, frame.container.innerPath),
    }));
  }

  // === 核心操作 ===

  /**
   * 打开内容项
   * - 如果是容器：展开并推入栈
   * - 如果是叶子：找到父容器，展开，定位到该项
   */
  async open(path: string, innerPath?: string): Promise<void> {
    try {
      this.state.loading = true;
      this.state.error = '';

      // 加载内容项信息
      const item = await contentApi.loadContentItem(path, innerPath);

      if (isContainer(item)) {
        // 容器：清空栈，展开容器
        await this.openContainer(item);
      } else {
        // 叶子节点：找到父容器并定位
        await this.openLeafItem(item);
      }

      this.state.viewerOpen = true;
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
      console.error('❌ ViewContext open error:', err);
    } finally {
      this.state.loading = false;
    }
  }

  /**
   * 打开内容项（已有 ContentItem）
   */
  async openItem(item: ContentItem): Promise<void> {
    await this.open(item.path, item.innerPath);
  }

  /**
   * 导航到指定索引
   */
  async navigateTo(index: number): Promise<void> {
    const frame = this.currentFrame;
    if (!frame) return;

    const maxIndex = frame.items.length - 1;
    const safeIndex = Math.max(0, Math.min(index, maxIndex));

    frame.currentIndex = safeIndex;

    // 触发历史更新（通过事件或直接调用）
    this.emitNavigationEvent();
  }

  /**
   * 下一项
   */
  async next(): Promise<void> {
    if (!this.canNext) return;
    await this.navigateTo(this.currentIndex + 1);
  }

  /**
   * 上一项
   */
  async previous(): Promise<void> {
    if (!this.canPrevious) return;
    await this.navigateTo(this.currentIndex - 1);
  }

  /**
   * 第一项
   */
  async first(): Promise<void> {
    await this.navigateTo(0);
  }

  /**
   * 最后一项
   */
  async last(): Promise<void> {
    const frame = this.currentFrame;
    if (!frame) return;
    await this.navigateTo(frame.items.length - 1);
  }

  /**
   * 进入当前项（如果是容器）
   */
  async enterCurrent(): Promise<void> {
    const item = this.currentItem;
    if (!item || !isContainer(item)) return;

    await this.enterContainer(item);
  }

  /**
   * 进入指定容器
   */
  async enterContainer(container: ContentItem): Promise<void> {
    if (!isContainer(container)) return;

    try {
      this.state.loading = true;
      const items = await contentApi.expandContainer(
        container.path,
        container.innerPath,
        this.currentFrame?.sortMode ?? 'name'
      );

      const frame: ViewFrame = {
        container,
        items,
        currentIndex: 0,
        sortMode: this.currentFrame?.sortMode ?? 'name',
        readOrder: this.currentFrame?.readOrder ?? 'ltr' as ReadOrder,
      };

      this.state.stack.push(frame);
      this.emitNavigationEvent();
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.state.loading = false;
    }
  }

  /**
   * 返回上级容器
   */
  async goBack(): Promise<void> {
    if (!this.canGoBack) return;

    this.state.stack.pop();
    this.emitNavigationEvent();
  }

  /**
   * 跳转到面包屑中的某一级
   */
  async goToBreadcrumb(index: number): Promise<void> {
    if (index < 0 || index >= this.state.stack.length) return;

    // 移除 index 之后的所有帧
    this.state.stack = this.state.stack.slice(0, index + 1);
    this.emitNavigationEvent();
  }

  /**
   * 关闭查看器
   */
  close(): void {
    this.state.viewerOpen = false;
    this.state.stack = [];
    this.state.error = '';
  }

  /**
   * 设置排序模式
   */
  async setSortMode(mode: SortMode): Promise<void> {
    const frame = this.currentFrame;
    if (!frame) return;

    if (frame.sortMode === mode) return;

    try {
      this.state.loading = true;
      frame.sortMode = mode;

      // 重新加载并排序
      const items = await contentApi.expandContainer(
        frame.container.path,
        frame.container.innerPath,
        mode
      );

      // 尝试保持当前项
      const currentItem = frame.items[frame.currentIndex];
      frame.items = items;

      if (currentItem) {
        const newIndex = items.findIndex((item: ContentItem) =>
          item.path === currentItem.path && item.innerPath === currentItem.innerPath
        );
        frame.currentIndex = newIndex >= 0 ? newIndex : 0;
      }
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.state.loading = false;
    }
  }

  // === 辅助方法 ===

  /**
   * 打开容器（清空栈后推入）
   */
  private async openContainer(container: ContentItem): Promise<void> {
    const items = await contentApi.expandContainer(
      container.path,
      container.innerPath,
      'name'
    );

    const frame: ViewFrame = {
      container,
      items,
      currentIndex: 0,
      sortMode: 'name',
      readOrder: 'ltr' as ReadOrder,
    };

    this.state.stack = [frame];
  }

  /**
   * 打开叶子节点（找到父容器并定位）
   */
  private async openLeafItem(item: ContentItem): Promise<void> {
    // 获取父容器路径
    const parentRef = item.parentRef ?? this.getParentRef(item);

    if (!parentRef) {
      throw new Error('Cannot determine parent container');
    }

    // 加载父容器
    const parentContainer = await contentApi.loadContentItem(parentRef.path, parentRef.innerPath);

    // 展开父容器
    const items = await contentApi.expandContainer(
      parentContainer.path,
      parentContainer.innerPath,
      'name'
    );

    // 找到当前项的索引
    const index = items.findIndex((i: ContentItem) =>
      i.path === item.path && i.innerPath === item.innerPath
    );

    const frame: ViewFrame = {
      container: parentContainer,
      items,
      currentIndex: index >= 0 ? index : 0,
      sortMode: 'name',
      readOrder: 'ltr' as ReadOrder,
    };

    this.state.stack = [frame];
  }

  /**
   * 从路径推断父容器引用
   */
  private getParentRef(item: ContentItem): ContentRef | null {
    if (item.innerPath) {
      // 压缩包内的文件，父容器是压缩包本身
      return { path: item.path };
    }

    // 文件系统文件，父容器是所在文件夹
    const lastSep = Math.max(
      item.path.lastIndexOf('/'),
      item.path.lastIndexOf('\\')
    );

    if (lastSep > 0) {
      return { path: item.path.substring(0, lastSep) };
    }

    return null;
  }

  /**
   * 发送导航事件（用于历史记录更新等）
   */
  private emitNavigationEvent(): void {
    // 使用 CustomEvent 通知其他组件
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('viewcontext:navigate', {
        detail: {
          pathStack: this.buildPathStack(),
          currentIndex: this.currentIndex,
          currentItem: this.currentItem,
          totalItems: this.totalItems,
        }
      }));
    }
  }

  /**
   * 构建路径栈
   */
  buildPathStack(): ContentRef[] {
    const refs: ContentRef[] = [];

    for (const frame of this.state.stack) {
      refs.push(createRef(frame.container.path, frame.container.innerPath));
    }

    // 如果当前项是叶子节点，添加它
    const current = this.currentItem;
    if (current && !isContainer(current)) {
      refs.push(createRef(current.path, current.innerPath));
    }

    return refs;
  }

  /**
   * 从历史记录恢复
   */
  async restoreFromHistory(pathStack: ContentRef[], currentIndex: number): Promise<void> {
    if (pathStack.length === 0) return;

    try {
      this.state.loading = true;
      this.state.error = '';
      this.state.stack = [];

      for (let i = 0; i < pathStack.length; i++) {
        const ref = pathStack[i];
        const isLast = i === pathStack.length - 1;
        const type = inferContentType(ref.path);

        // 判断是否是容器
        const isContainerPath = type === 'archive' || type === 'folder';

        if (isLast && !isContainerPath) {
          // 最后一层是叶子节点，在当前帧中定位
          const frame = this.currentFrame;
          if (frame) {
            const index = frame.items.findIndex((item: ContentItem) =>
              item.path === ref.path && item.innerPath === ref.innerPath
            );
            if (index >= 0) {
              frame.currentIndex = index;
            }
          }
        } else {
          // 容器层，加载并推入栈
          const container = await contentApi.loadContentItem(ref.path, ref.innerPath);
          const items = await contentApi.expandContainer(ref.path, ref.innerPath, 'name');

          this.state.stack.push({
            container,
            items,
            currentIndex: 0,
            sortMode: 'name',
            readOrder: 'ltr' as ReadOrder,
          });
        }
      }

      // 恢复索引
      if (this.currentFrame) {
        this.currentFrame.currentIndex = Math.min(
          currentIndex,
          this.currentFrame.items.length - 1
        );
      }

      this.state.viewerOpen = true;
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.state.loading = false;
    }
  }

  // === 缩略图缓存 ===

  getThumbnail(id: string): string | undefined {
    return this.thumbnailCache.get(id);
  }

  setThumbnail(id: string, url: string): void {
    this.thumbnailCache.set(id, url);
  }
}

// ==================== 导出单例 ====================

export const viewContextStore = new ViewContextStore();

// 导出类型供外部使用
export type { ViewContextStore };
