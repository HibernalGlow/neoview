/**
 * Predictive Loader
 * 预测性加载系统 - 根据滚动方向预测用户下一步可能查看的项目
 */

export interface PredictiveLoadOptions {
  lookAhead: number; // 预测范围（项目数量）
  scrollThreshold: number; // 滚动阈值（像素），超过此值才触发预测
  maxConcurrent: number; // 最大并发加载数
}

export interface ScrollState {
  scrollTop: number;
  scrollLeft: number;
  timestamp: number;
}

export type ScrollDirection = 'up' | 'down' | 'left' | 'right' | 'none';

/**
 * 预测性加载器
 */
export class PredictiveLoader {
  private scrollHistory: ScrollState[] = [];
  private lastScrollTop = 0;
  private lastScrollLeft = 0;
  private lastTimestamp = 0;
  private currentDirection: ScrollDirection = 'none';
  private options: PredictiveLoadOptions;

  constructor(options: Partial<PredictiveLoadOptions> = {}) {
    this.options = {
      lookAhead: options.lookAhead ?? 20, // 默认预测 20 个项目
      scrollThreshold: options.scrollThreshold ?? 50, // 默认 50px 阈值
      maxConcurrent: options.maxConcurrent ?? 10, // 默认最多 10 个并发
    };
  }

  /**
   * 更新滚动位置并返回预测方向
   */
  updateScroll(scrollTop: number, scrollLeft: number): ScrollDirection {
    const now = Date.now();
    const deltaTop = scrollTop - this.lastScrollTop;
    const deltaLeft = scrollLeft - this.lastScrollLeft;
    const deltaTime = now - this.lastTimestamp;

    // 记录滚动历史（保留最近 10 次）
    this.scrollHistory.push({
      scrollTop,
      scrollLeft,
      timestamp: now,
    });
    if (this.scrollHistory.length > 10) {
      this.scrollHistory.shift();
    }

    // 计算滚动速度
    const speedTop = Math.abs(deltaTop) / Math.max(deltaTime, 1);
    const speedLeft = Math.abs(deltaLeft) / Math.max(deltaTime, 1);

    // 判断滚动方向
    let direction: ScrollDirection = 'none';
    
    if (Math.abs(deltaTop) > Math.abs(deltaLeft)) {
      // 垂直滚动
      if (Math.abs(deltaTop) > this.options.scrollThreshold) {
        direction = deltaTop > 0 ? 'down' : 'up';
      }
    } else {
      // 水平滚动
      if (Math.abs(deltaLeft) > this.options.scrollThreshold) {
        direction = deltaLeft > 0 ? 'right' : 'left';
      }
    }

    // 如果速度很快，保持当前方向
    if (speedTop > 2 || speedLeft > 2) {
      if (direction !== 'none') {
        this.currentDirection = direction;
      }
    } else {
      this.currentDirection = direction;
    }

    this.lastScrollTop = scrollTop;
    this.lastScrollLeft = scrollLeft;
    this.lastTimestamp = now;

    return this.currentDirection;
  }

  /**
   * 获取预测范围
   * @param currentIndex 当前可见的第一个项目索引
   * @param totalItems 总项目数
   * @param direction 滚动方向
   */
  getPredictiveRange(
    currentIndex: number,
    totalItems: number,
    direction: ScrollDirection
  ): { start: number; end: number } {
    let start = currentIndex;
    let end = currentIndex;

    switch (direction) {
      case 'down':
      case 'right':
        // 向下/向右滚动，预测后面的项目
        start = currentIndex;
        end = Math.min(
          totalItems - 1,
          currentIndex + this.options.lookAhead
        );
        break;

      case 'up':
      case 'left':
        // 向上/向左滚动，预测前面的项目
        start = Math.max(0, currentIndex - this.options.lookAhead);
        end = currentIndex;
        break;

      case 'none':
      default:
        // 无滚动，预测当前可见范围附近的项目
        const halfLookAhead = Math.floor(this.options.lookAhead / 2);
        start = Math.max(0, currentIndex - halfLookAhead);
        end = Math.min(totalItems - 1, currentIndex + halfLookAhead);
        break;
    }

    return { start, end };
  }

  /**
   * 获取滚动速度（像素/毫秒）
   */
  getScrollVelocity(): { vertical: number; horizontal: number } {
    if (this.scrollHistory.length < 2) {
      return { vertical: 0, horizontal: 0 };
    }

    const recent = this.scrollHistory.slice(-3); // 使用最近 3 次记录
    const first = recent[0];
    const last = recent[recent.length - 1];

    const deltaTime = last.timestamp - first.timestamp;
    if (deltaTime === 0) {
      return { vertical: 0, horizontal: 0 };
    }

    const vertical = (last.scrollTop - first.scrollTop) / deltaTime;
    const horizontal = (last.scrollLeft - first.scrollLeft) / deltaTime;

    return { vertical, horizontal };
  }

  /**
   * 根据滚动速度调整预测范围
   */
  getAdaptiveLookAhead(direction: ScrollDirection): number {
    const velocity = this.getScrollVelocity();
    const speed = Math.max(Math.abs(velocity.vertical), Math.abs(velocity.horizontal));

    // 速度越快，预测范围越大
    if (speed > 1) {
      return Math.min(this.options.lookAhead * 2, 50); // 最多 50 个
    } else if (speed > 0.5) {
      return Math.floor(this.options.lookAhead * 1.5);
    }

    return this.options.lookAhead;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.scrollHistory = [];
    this.currentDirection = 'none';
    this.lastScrollTop = 0;
    this.lastScrollLeft = 0;
    this.lastTimestamp = 0;
  }

  /**
   * 获取当前方向
   */
  getCurrentDirection(): ScrollDirection {
    return this.currentDirection;
  }
}

