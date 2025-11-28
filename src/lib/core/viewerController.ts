/**
 * ViewerController - 视图控制器
 * 
 * 核心功能：
 * 1. 统一的缩放/平移/旋转管理
 * 2. 支持多种视图模式 (normal, panorama, loupe)
 * 3. 动画过渡
 * 4. 手势支持
 * 
 * 参考 NeeView 的 PageFrameTransform 和 ViewTransformControl
 */

import type {
  ViewState,
  ViewerConfig,
  ViewMode,
  FitMode,
  Size,
  Point,
} from './types';
import { defaultViewerConfig } from './types';

// ============================================================================
// 类型定义
// ============================================================================

export interface ViewerControllerEvents {
  onStateChange?: (state: ViewState) => void;
  onModeChange?: (mode: ViewMode, prevMode: ViewMode) => void;
  onFitChange?: (fitMode: FitMode) => void;
}

export interface TransformConstraints {
  minScale: number;
  maxScale: number;
  boundaryPadding: number;
}

// ============================================================================
// 默认状态
// ============================================================================

const defaultViewState: ViewState = {
  mode: 'normal',
  scale: 1,
  rotation: 0,
  offset: { x: 0, y: 0 },
  panoramaOffset: 0,
  loupeCenter: { x: 0, y: 0 },
  loupeScale: 2,
};

// ============================================================================
// ViewerController
// ============================================================================

export class ViewerController {
  private _state: ViewState;
  private _config: ViewerConfig;
  private _events: ViewerControllerEvents = {};

  // 容器和内容尺寸
  private _containerSize: Size = { width: 0, height: 0 };
  private _contentSize: Size = { width: 0, height: 0 };

  // 动画
  private _animationFrame: number | null = null;
  private _animationStartState: ViewState | null = null;
  private _animationTargetState: ViewState | null = null;
  private _animationStartTime: number = 0;

  // 拖拽状态
  private _isDragging: boolean = false;
  private _dragStartPoint: Point = { x: 0, y: 0 };
  private _dragStartOffset: Point = { x: 0, y: 0 };

  constructor(config: Partial<ViewerConfig> = {}) {
    this._config = { ...defaultViewerConfig, ...config };
    this._state = { ...defaultViewState };
  }

  // ============================================================================
  // 配置
  // ============================================================================

  get config(): ViewerConfig {
    return { ...this._config };
  }

  setConfig(config: Partial<ViewerConfig>): void {
    this._config = { ...this._config, ...config };
  }

  setEvents(events: ViewerControllerEvents): void {
    this._events = events;
  }

  // ============================================================================
  // 状态
  // ============================================================================

  get state(): ViewState {
    return { ...this._state };
  }

  get mode(): ViewMode {
    return this._state.mode;
  }

  get scale(): number {
    return this._state.scale;
  }

  get rotation(): number {
    return this._state.rotation;
  }

  get offset(): Point {
    return { ...this._state.offset };
  }

  // ============================================================================
  // 尺寸设置
  // ============================================================================

  setContainerSize(size: Size): void {
    this._containerSize = { ...size };
    this.constrainState();
  }

  setContentSize(size: Size): void {
    this._contentSize = { ...size };
    this.constrainState();
  }

  get containerSize(): Size {
    return { ...this._containerSize };
  }

  get contentSize(): Size {
    return { ...this._contentSize };
  }

  // ============================================================================
  // 视图模式
  // ============================================================================

  /**
   * 设置视图模式
   */
  setMode(mode: ViewMode, animate: boolean = true): void {
    if (this._state.mode === mode) return;

    const prevMode = this._state.mode;

    // 退出当前模式
    this.exitMode(prevMode);

    // 进入新模式
    this._state.mode = mode;
    this.enterMode(mode, animate);

    this._events.onModeChange?.(mode, prevMode);
    this.notifyChange();
  }

  private exitMode(mode: ViewMode): void {
    switch (mode) {
      case 'panorama':
        this._state.panoramaOffset = 0;
        break;
      case 'loupe':
        this._state.loupeCenter = { x: 0, y: 0 };
        this._state.loupeScale = 2;
        break;
    }
  }

  private enterMode(mode: ViewMode, animate: boolean): void {
    switch (mode) {
      case 'normal':
        this.fitToContainer(animate);
        break;
      case 'panorama':
        this._state.scale = this.calculatePanoramaScale();
        this._state.offset = { x: 0, y: 0 };
        this._state.panoramaOffset = 0;
        break;
      case 'loupe':
        this._state.loupeScale = 2;
        this._state.loupeCenter = { x: 0, y: 0 };
        break;
    }
  }

  /**
   * 计算全景模式的缩放比例
   */
  private calculatePanoramaScale(): number {
    if (this._containerSize.width === 0 || this._contentSize.width === 0) {
      return 1;
    }
    return this._containerSize.width / this._contentSize.width;
  }

  // ============================================================================
  // 适应模式
  // ============================================================================

  /**
   * 适应容器
   */
  fitToContainer(animate: boolean = true): void {
    const targetScale = this.calculateFitScale(this._config.fitMode);
    const targetOffset = { x: 0, y: 0 };

    if (animate) {
      this.animateTo({
        ...this._state,
        scale: targetScale,
        offset: targetOffset,
      });
    } else {
      this._state.scale = targetScale;
      this._state.offset = targetOffset;
      this.notifyChange();
    }

    this._events.onFitChange?.(this._config.fitMode);
  }

  /**
   * 设置适应模式
   */
  setFitMode(fitMode: FitMode, animate: boolean = true): void {
    this._config.fitMode = fitMode;
    this.fitToContainer(animate);
  }

  /**
   * 计算适应缩放比例
   */
  private calculateFitScale(fitMode: FitMode): number {
    if (this._containerSize.width === 0 || this._containerSize.height === 0) {
      return 1;
    }
    if (this._contentSize.width === 0 || this._contentSize.height === 0) {
      return 1;
    }

    const scaleX = this._containerSize.width / this._contentSize.width;
    const scaleY = this._containerSize.height / this._contentSize.height;

    switch (fitMode) {
      case 'contain':
        return Math.min(scaleX, scaleY);
      case 'cover':
        return Math.max(scaleX, scaleY);
      case 'width':
        return scaleX;
      case 'height':
        return scaleY;
      case 'none':
        return 1;
    }
  }

  // ============================================================================
  // 缩放
  // ============================================================================

  /**
   * 缩放
   * @param delta 缩放增量 (正数放大，负数缩小)
   * @param center 缩放中心点 (相对于容器中心)
   */
  zoom(delta: number, center?: Point, animate: boolean = false): void {
    const factor = 1 + delta * this._config.scaleStep;
    this.zoomTo(this._state.scale * factor, center, animate);
  }

  /**
   * 缩放到指定比例
   */
  zoomTo(scale: number, center?: Point, animate: boolean = false): void {
    const newScale = Math.max(
      this._config.minScale,
      Math.min(this._config.maxScale, scale)
    );

    let newOffset = this._state.offset;

    if (center) {
      // 以指定点为中心缩放
      const ratio = newScale / this._state.scale;
      newOffset = {
        x: center.x - (center.x - this._state.offset.x) * ratio,
        y: center.y - (center.y - this._state.offset.y) * ratio,
      };
    }

    if (animate) {
      this.animateTo({
        ...this._state,
        scale: newScale,
        offset: newOffset,
      });
    } else {
      this._state.scale = newScale;
      this._state.offset = newOffset;
      this.constrainState();
      this.notifyChange();
    }
  }

  /**
   * 重置缩放
   */
  resetZoom(animate: boolean = true): void {
    this.fitToContainer(animate);
  }

  // ============================================================================
  // 平移
  // ============================================================================

  /**
   * 平移
   */
  pan(delta: Point, animate: boolean = false): void {
    const newOffset = {
      x: this._state.offset.x + delta.x,
      y: this._state.offset.y + delta.y,
    };

    if (animate) {
      this.animateTo({
        ...this._state,
        offset: newOffset,
      });
    } else {
      this._state.offset = newOffset;
      this.constrainState();
      this.notifyChange();
    }
  }

  /**
   * 平移到指定位置
   */
  panTo(offset: Point, animate: boolean = false): void {
    if (animate) {
      this.animateTo({
        ...this._state,
        offset,
      });
    } else {
      this._state.offset = offset;
      this.constrainState();
      this.notifyChange();
    }
  }

  // ============================================================================
  // 旋转
  // ============================================================================

  /**
   * 旋转
   */
  rotate(angle: number, animate: boolean = true): void {
    this.rotateTo(this._state.rotation + angle, animate);
  }

  /**
   * 旋转到指定角度
   */
  rotateTo(angle: number, animate: boolean = true): void {
    const newRotation = ((angle % 360) + 360) % 360;

    if (animate) {
      this.animateTo({
        ...this._state,
        rotation: newRotation,
      });
    } else {
      this._state.rotation = newRotation;
      this.notifyChange();
    }
  }

  /**
   * 重置旋转
   */
  resetRotation(animate: boolean = true): void {
    this.rotateTo(0, animate);
  }

  // ============================================================================
  // 全景模式
  // ============================================================================

  /**
   * 全景模式滚动
   */
  panoramaScroll(delta: number): void {
    if (this._state.mode !== 'panorama') return;

    const scaledHeight = this._contentSize.height * this._state.scale;
    const maxOffset = Math.max(0, scaledHeight - this._containerSize.height);

    this._state.panoramaOffset = Math.max(
      0,
      Math.min(maxOffset, this._state.panoramaOffset + delta)
    );

    this.notifyChange();
  }

  /**
   * 全景模式滚动到指定位置
   */
  panoramaScrollTo(offset: number, animate: boolean = false): void {
    if (this._state.mode !== 'panorama') return;

    const scaledHeight = this._contentSize.height * this._state.scale;
    const maxOffset = Math.max(0, scaledHeight - this._containerSize.height);
    const targetOffset = Math.max(0, Math.min(maxOffset, offset));

    if (animate) {
      this.animateTo({
        ...this._state,
        panoramaOffset: targetOffset,
      });
    } else {
      this._state.panoramaOffset = targetOffset;
      this.notifyChange();
    }
  }

  // ============================================================================
  // 放大镜模式
  // ============================================================================

  /**
   * 放大镜移动
   */
  loupeMove(center: Point): void {
    if (this._state.mode !== 'loupe') return;

    this._state.loupeCenter = center;
    this.notifyChange();
  }

  /**
   * 设置放大镜缩放
   */
  setLoupeScale(scale: number): void {
    this._state.loupeScale = Math.max(1, Math.min(10, scale));
    this.notifyChange();
  }

  // ============================================================================
  // 拖拽
  // ============================================================================

  /**
   * 开始拖拽
   */
  startDrag(point: Point): void {
    this._isDragging = true;
    this._dragStartPoint = point;
    this._dragStartOffset = { ...this._state.offset };
  }

  /**
   * 拖拽中
   */
  drag(point: Point): void {
    if (!this._isDragging) return;

    const delta = {
      x: point.x - this._dragStartPoint.x,
      y: point.y - this._dragStartPoint.y,
    };

    this._state.offset = {
      x: this._dragStartOffset.x + delta.x,
      y: this._dragStartOffset.y + delta.y,
    };

    this.notifyChange();
  }

  /**
   * 结束拖拽
   */
  endDrag(): void {
    this._isDragging = false;
    this.constrainState();
    this.notifyChange();
  }

  get isDragging(): boolean {
    return this._isDragging;
  }

  // ============================================================================
  // 动画
  // ============================================================================

  /**
   * 动画到目标状态
   */
  private animateTo(targetState: ViewState): void {
    this.cancelAnimation();

    this._animationStartState = { ...this._state };
    this._animationTargetState = targetState;
    this._animationStartTime = performance.now();

    this._animationFrame = requestAnimationFrame(() => this.animationTick());
  }

  /**
   * 动画帧
   */
  private animationTick(): void {
    if (!this._animationStartState || !this._animationTargetState) return;

    const elapsed = performance.now() - this._animationStartTime;
    const progress = Math.min(1, elapsed / this._config.animationDuration);
    const eased = this.easeOut(progress);

    // 插值
    this._state.scale = this.lerp(
      this._animationStartState.scale,
      this._animationTargetState.scale,
      eased
    );
    this._state.rotation = this.lerpAngle(
      this._animationStartState.rotation,
      this._animationTargetState.rotation,
      eased
    );
    this._state.offset = {
      x: this.lerp(
        this._animationStartState.offset.x,
        this._animationTargetState.offset.x,
        eased
      ),
      y: this.lerp(
        this._animationStartState.offset.y,
        this._animationTargetState.offset.y,
        eased
      ),
    };
    this._state.panoramaOffset = this.lerp(
      this._animationStartState.panoramaOffset,
      this._animationTargetState.panoramaOffset,
      eased
    );

    this.notifyChange();

    if (progress < 1) {
      this._animationFrame = requestAnimationFrame(() => this.animationTick());
    } else {
      this._animationFrame = null;
      this._animationStartState = null;
      this._animationTargetState = null;
      this.constrainState();
    }
  }

  /**
   * 取消动画
   */
  cancelAnimation(): void {
    if (this._animationFrame !== null) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }
    this._animationStartState = null;
    this._animationTargetState = null;
  }

  /**
   * 线性插值
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * 角度插值
   */
  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
  }

  /**
   * 缓出函数
   */
  private easeOut(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  // ============================================================================
  // 约束
  // ============================================================================

  /**
   * 约束状态在有效范围内
   */
  private constrainState(): void {
    // 约束缩放
    this._state.scale = Math.max(
      this._config.minScale,
      Math.min(this._config.maxScale, this._state.scale)
    );

    // 约束偏移 (可选，根据需求决定是否启用边界限制)
    // this.constrainOffset();
  }

  // ============================================================================
  // 通知
  // ============================================================================

  private notifyChange(): void {
    this._events.onStateChange?.({ ...this._state });
  }

  // ============================================================================
  // 重置
  // ============================================================================

  /**
   * 重置所有状态
   */
  reset(animate: boolean = true): void {
    if (animate) {
      this.animateTo({ ...defaultViewState });
    } else {
      this._state = { ...defaultViewState };
      this.notifyChange();
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.cancelAnimation();
  }
}
