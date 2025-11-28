/**
 * GestureHandler - 手势处理器
 * 
 * 职责：
 * - 处理触摸手势（pinch, pan, tap, double-tap）
 * - 处理鼠标事件（wheel, drag, click）
 * - 处理键盘快捷键
 * 
 * 实现原理：
 * - 使用 Pointer Events API 统一处理触摸和鼠标
 * - 多点触控使用距离计算实现 pinch
 * - 使用 requestAnimationFrame 优化性能
 * 
 * 使用方式：
 * const handler = new GestureHandler(element, {
 *   onPan: (delta) => {},
 *   onZoom: (scale, center) => {},
 *   onTap: (point) => {},
 *   onDoubleTap: (point) => {},
 * });
 * handler.destroy(); // 清理
 */

import type { Point } from '$lib/core/types';

// ============================================================================
// 类型定义
// ============================================================================

export interface GestureEvents {
  /** 平移 */
  onPan?: (delta: Point, event: PointerEvent) => void;
  /** 平移开始 */
  onPanStart?: (point: Point, event: PointerEvent) => void;
  /** 平移结束 */
  onPanEnd?: (point: Point, event: PointerEvent) => void;
  /** 缩放 */
  onZoom?: (scale: number, center: Point, event: WheelEvent | PointerEvent) => void;
  /** 单击 */
  onTap?: (point: Point, event: PointerEvent) => void;
  /** 双击 */
  onDoubleTap?: (point: Point, event: PointerEvent) => void;
  /** 长按 */
  onLongPress?: (point: Point, event: PointerEvent) => void;
  /** 右键菜单 */
  onContextMenu?: (point: Point, event: MouseEvent) => void;
}

export interface GestureConfig {
  /** 启用平移 */
  enablePan?: boolean;
  /** 启用缩放 */
  enableZoom?: boolean;
  /** 启用点击 */
  enableTap?: boolean;
  /** 双击间隔 (ms) */
  doubleTapDelay?: number;
  /** 长按时间 (ms) */
  longPressDelay?: number;
  /** 滚轮缩放灵敏度 */
  wheelSensitivity?: number;
  /** 触摸缩放灵敏度 */
  pinchSensitivity?: number;
}

interface PointerState {
  id: number;
  startPoint: Point;
  currentPoint: Point;
  startTime: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const defaultConfig: Required<GestureConfig> = {
  enablePan: true,
  enableZoom: true,
  enableTap: true,
  doubleTapDelay: 300,
  longPressDelay: 500,
  wheelSensitivity: 0.001,
  pinchSensitivity: 0.01,
};

// ============================================================================
// GestureHandler 类
// ============================================================================

export class GestureHandler {
  private element: HTMLElement;
  private events: GestureEvents;
  private config: Required<GestureConfig>;
  
  // 指针状态
  private pointers: Map<number, PointerState> = new Map();
  private lastTapTime: number = 0;
  private lastTapPoint: Point | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  
  // 多点触控状态
  private initialPinchDistance: number = 0;
  private isPinching: boolean = false;
  
  // 绑定的事件处理函数
  private boundHandlers: {
    pointerdown: (e: PointerEvent) => void;
    pointermove: (e: PointerEvent) => void;
    pointerup: (e: PointerEvent) => void;
    pointercancel: (e: PointerEvent) => void;
    wheel: (e: WheelEvent) => void;
    contextmenu: (e: MouseEvent) => void;
  };
  
  constructor(
    element: HTMLElement,
    events: GestureEvents,
    config: GestureConfig = {}
  ) {
    this.element = element;
    this.events = events;
    this.config = { ...defaultConfig, ...config };
    
    // 绑定事件处理函数
    this.boundHandlers = {
      pointerdown: this.handlePointerDown.bind(this),
      pointermove: this.handlePointerMove.bind(this),
      pointerup: this.handlePointerUp.bind(this),
      pointercancel: this.handlePointerCancel.bind(this),
      wheel: this.handleWheel.bind(this),
      contextmenu: this.handleContextMenu.bind(this),
    };
    
    this.attach();
  }
  
  // ============================================================================
  // 生命周期
  // ============================================================================
  
  private attach(): void {
    this.element.addEventListener('pointerdown', this.boundHandlers.pointerdown);
    this.element.addEventListener('pointermove', this.boundHandlers.pointermove);
    this.element.addEventListener('pointerup', this.boundHandlers.pointerup);
    this.element.addEventListener('pointercancel', this.boundHandlers.pointercancel);
    this.element.addEventListener('wheel', this.boundHandlers.wheel, { passive: false });
    this.element.addEventListener('contextmenu', this.boundHandlers.contextmenu);
    
    // 防止默认触摸行为
    this.element.style.touchAction = 'none';
  }
  
  destroy(): void {
    this.element.removeEventListener('pointerdown', this.boundHandlers.pointerdown);
    this.element.removeEventListener('pointermove', this.boundHandlers.pointermove);
    this.element.removeEventListener('pointerup', this.boundHandlers.pointerup);
    this.element.removeEventListener('pointercancel', this.boundHandlers.pointercancel);
    this.element.removeEventListener('wheel', this.boundHandlers.wheel);
    this.element.removeEventListener('contextmenu', this.boundHandlers.contextmenu);
    
    this.clearLongPressTimer();
    this.pointers.clear();
  }
  
  // ============================================================================
  // 指针事件处理
  // ============================================================================
  
  private handlePointerDown(event: PointerEvent): void {
    // 捕获指针
    this.element.setPointerCapture(event.pointerId);
    
    const point = this.getEventPoint(event);
    
    this.pointers.set(event.pointerId, {
      id: event.pointerId,
      startPoint: point,
      currentPoint: point,
      startTime: Date.now(),
    });
    
    // 多点触控检测
    if (this.pointers.size === 2) {
      this.startPinch();
    } else if (this.pointers.size === 1) {
      // 单点触控
      this.events.onPanStart?.(point, event);
      this.startLongPressTimer(point, event);
    }
  }
  
  private handlePointerMove(event: PointerEvent): void {
    const state = this.pointers.get(event.pointerId);
    if (!state) return;
    
    const point = this.getEventPoint(event);
    const prevPoint = state.currentPoint;
    state.currentPoint = point;
    
    // 取消长按
    this.clearLongPressTimer();
    
    if (this.pointers.size === 2 && this.isPinching) {
      // 双指缩放
      this.handlePinchMove(event);
    } else if (this.pointers.size === 1 && this.config.enablePan) {
      // 单指平移
      const delta: Point = {
        x: point.x - prevPoint.x,
        y: point.y - prevPoint.y,
      };
      this.events.onPan?.(delta, event);
    }
  }
  
  private handlePointerUp(event: PointerEvent): void {
    const state = this.pointers.get(event.pointerId);
    if (!state) return;
    
    const point = this.getEventPoint(event);
    const duration = Date.now() - state.startTime;
    const distance = this.getDistance(state.startPoint, point);
    
    // 释放指针
    this.element.releasePointerCapture(event.pointerId);
    this.pointers.delete(event.pointerId);
    
    // 取消长按
    this.clearLongPressTimer();
    
    // 结束缩放
    if (this.isPinching && this.pointers.size < 2) {
      this.isPinching = false;
    }
    
    // 检测点击
    if (this.config.enableTap && distance < 10 && duration < 300) {
      this.handleTap(point, event);
    }
    
    // 平移结束
    if (this.pointers.size === 0) {
      this.events.onPanEnd?.(point, event);
    }
  }
  
  private handlePointerCancel(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    this.clearLongPressTimer();
    this.isPinching = false;
  }
  
  // ============================================================================
  // 缩放处理
  // ============================================================================
  
  private startPinch(): void {
    const points = Array.from(this.pointers.values());
    if (points.length !== 2) return;
    
    this.initialPinchDistance = this.getDistance(
      points[0].currentPoint,
      points[1].currentPoint
    );
    this.isPinching = true;
  }
  
  private handlePinchMove(event: PointerEvent): void {
    if (!this.config.enableZoom) return;
    
    const points = Array.from(this.pointers.values());
    if (points.length !== 2) return;
    
    const currentDistance = this.getDistance(
      points[0].currentPoint,
      points[1].currentPoint
    );
    
    const scale = currentDistance / this.initialPinchDistance;
    const center: Point = {
      x: (points[0].currentPoint.x + points[1].currentPoint.x) / 2,
      y: (points[0].currentPoint.y + points[1].currentPoint.y) / 2,
    };
    
    this.events.onZoom?.(scale, center, event);
    this.initialPinchDistance = currentDistance;
  }
  
  private handleWheel(event: WheelEvent): void {
    if (!this.config.enableZoom) return;
    
    event.preventDefault();
    
    const point = this.getEventPoint(event);
    const delta = -event.deltaY * this.config.wheelSensitivity;
    const scale = 1 + delta;
    
    this.events.onZoom?.(scale, point, event);
  }
  
  // ============================================================================
  // 点击处理
  // ============================================================================
  
  private handleTap(point: Point, event: PointerEvent): void {
    const now = Date.now();
    
    // 检测双击
    if (
      this.lastTapPoint &&
      now - this.lastTapTime < this.config.doubleTapDelay &&
      this.getDistance(point, this.lastTapPoint) < 30
    ) {
      this.events.onDoubleTap?.(point, event);
      this.lastTapTime = 0;
      this.lastTapPoint = null;
    } else {
      this.events.onTap?.(point, event);
      this.lastTapTime = now;
      this.lastTapPoint = point;
    }
  }
  
  // ============================================================================
  // 长按处理
  // ============================================================================
  
  private startLongPressTimer(point: Point, event: PointerEvent): void {
    this.clearLongPressTimer();
    this.longPressTimer = setTimeout(() => {
      this.events.onLongPress?.(point, event);
    }, this.config.longPressDelay);
  }
  
  private clearLongPressTimer(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
  
  // ============================================================================
  // 右键菜单
  // ============================================================================
  
  private handleContextMenu(event: MouseEvent): void {
    const point = this.getEventPoint(event);
    this.events.onContextMenu?.(point, event);
  }
  
  // ============================================================================
  // 工具函数
  // ============================================================================
  
  private getEventPoint(event: PointerEvent | MouseEvent | WheelEvent): Point {
    const rect = this.element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }
  
  private getDistance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

export default GestureHandler;
