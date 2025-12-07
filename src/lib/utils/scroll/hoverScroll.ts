export type HoverScrollAxis = 'both' | 'horizontal' | 'vertical';

export interface HoverScrollOptions {
  enabled?: boolean;
  axis?: HoverScrollAxis;
  maxSpeed?: number;
  deadZoneRatio?: number;
}

const DEFAULT_OPTIONS: Required<Pick<HoverScrollOptions, 'enabled' | 'axis' | 'maxSpeed' | 'deadZoneRatio'>> = {
  enabled: true,
  axis: 'both',
  maxSpeed: 1500,
  deadZoneRatio: 0.3,
};

// 【性能优化】常量配置
const RECT_CACHE_DURATION = 50; // rect 缓存时间 (ms)
const MOUSEMOVE_THROTTLE = 16;  // mousemove 节流 (~60fps)

export function hoverScroll(node: HTMLElement, options: HoverScrollOptions = {}) {
  let opts = { ...DEFAULT_OPTIONS, ...options };

  let frameId: number | null = null;
  let lastTimestamp = 0;
  let pointerInside = false;
  let pointerX = 0;
  let pointerY = 0;
  let listenersAttached = false;
  
  // 【性能优化】rect 缓存
  let cachedRect: DOMRect | null = null;
  let rectCacheTime = 0;
  
  // 【性能优化】滚动状态缓存
  let cachedMaxScrollLeft = 0;
  let cachedMaxScrollTop = 0;
  let scrollCacheTime = 0;
  
  // 【性能优化】mousemove 节流
  let lastMouseMoveTime = 0;
  
  // 【性能优化】活动检测 - 无滚动时停止 RAF
  let isScrolling = false;

  function getCachedRect(): DOMRect {
    const now = performance.now();
    if (!cachedRect || now - rectCacheTime > RECT_CACHE_DURATION) {
      cachedRect = node.getBoundingClientRect();
      rectCacheTime = now;
    }
    return cachedRect;
  }
  
  function getCachedScrollBounds(): { maxLeft: number; maxTop: number } {
    const now = performance.now();
    // 滚动边界变化较慢，缓存更久
    if (now - scrollCacheTime > RECT_CACHE_DURATION * 2) {
      cachedMaxScrollLeft = node.scrollWidth - node.clientWidth;
      cachedMaxScrollTop = node.scrollHeight - node.clientHeight;
      scrollCacheTime = now;
    }
    return { maxLeft: cachedMaxScrollLeft, maxTop: cachedMaxScrollTop };
  }

  function cancelLoop() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    lastTimestamp = 0;
    isScrolling = false;
  }

  function scheduleLoop() {
    if (!opts.enabled || frameId !== null || !pointerInside) return;
    frameId = requestAnimationFrame(step);
  }

  function step(timestamp: number) {
    frameId = null;

    if (!opts.enabled || !pointerInside) {
      lastTimestamp = 0;
      isScrolling = false;
      return;
    }

    if (lastTimestamp === 0) {
      lastTimestamp = timestamp;
      scheduleLoop();
      return;
    }

    const dtSec = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    if (dtSec <= 0) {
      scheduleLoop();
      return;
    }

    // 【性能优化】使用缓存的 rect
    const rect = getCachedRect();
    if (!rect.width || !rect.height) {
      scheduleLoop();
      return;
    }

    // 【性能优化】使用缓存的滚动边界
    const { maxLeft: maxScrollLeft, maxTop: maxScrollTop } = getCachedScrollBounds();

    if (maxScrollLeft <= 0 && maxScrollTop <= 0) {
      // 【性能优化】无法滚动时不继续循环
      isScrolling = false;
      return;
    }

    const pxRaw = (pointerX - rect.left) / rect.width;
    const pyRaw = (pointerY - rect.top) / rect.height;
    const px = Math.min(Math.max(pxRaw, 0), 1);
    const py = Math.min(Math.max(pyRaw, 0), 1);

    const edge = Math.min(
      Math.max(opts.deadZoneRatio ?? DEFAULT_OPTIONS.deadZoneRatio, 0.01),
      0.49,
    );
    const maxSpeed = opts.maxSpeed ?? DEFAULT_OPTIONS.maxSpeed;

    const computeEdgeDelta = (p: number, maxScrollable: number): number => {
      if (maxScrollable <= 0) return 0;

      const leftZoneEnd = edge;
      const rightZoneStart = 1 - edge;

      let direction = 0;
      let t = 0;

      if (p < leftZoneEnd) {
        direction = -1;
        t = (leftZoneEnd - p) / edge;
      } else if (p > rightZoneStart) {
        direction = 1;
        t = (p - rightZoneStart) / edge;
      } else {
        return 0;
      }

      if (t <= 0) return 0;
      if (t > 1) t = 1;

      const v = direction * t * maxSpeed;
      return v * dtSec;
    };

    let dx = 0;
    let dy = 0;

    if (opts.axis === 'horizontal' || opts.axis === 'both') {
      dx = computeEdgeDelta(px, maxScrollLeft);
    }
    if (opts.axis === 'vertical' || opts.axis === 'both') {
      dy = computeEdgeDelta(py, maxScrollTop);
    }

    // 【性能优化】只在有实际滚动时更新
    const hasDelta = dx !== 0 || dy !== 0;
    
    if (hasDelta) {
      isScrolling = true;
      
      if (dx !== 0) {
        const nextLeft = Math.min(maxScrollLeft, Math.max(0, node.scrollLeft + dx));
        node.scrollLeft = nextLeft;
      }
      if (dy !== 0) {
        const nextTop = Math.min(maxScrollTop, Math.max(0, node.scrollTop + dy));
        node.scrollTop = nextTop;
      }
      
      scheduleLoop();
    } else {
      // 【性能优化】在死区时停止循环，但保持监听
      // 当鼠标移动到边缘时会重新启动
      isScrolling = false;
      // 不调用 scheduleLoop()，等待下次 mousemove 触发
    }
  }

  function handleMouseMove(event: MouseEvent) {
    // 【性能优化】节流 mousemove
    const now = performance.now();
    if (now - lastMouseMoveTime < MOUSEMOVE_THROTTLE) {
      // 仍然更新坐标，但不触发新的 RAF
      pointerX = event.clientX;
      pointerY = event.clientY;
      return;
    }
    lastMouseMoveTime = now;
    
    pointerInside = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    
    // 【性能优化】只在需要时启动 RAF 循环
    if (!isScrolling) {
      // 快速检查是否在边缘区域
      const rect = getCachedRect();
      if (rect.width && rect.height) {
        const px = (pointerX - rect.left) / rect.width;
        const py = (pointerY - rect.top) / rect.height;
        const edge = opts.deadZoneRatio ?? DEFAULT_OPTIONS.deadZoneRatio;
        
        const inEdgeZone = 
          (opts.axis !== 'vertical' && (px < edge || px > 1 - edge)) ||
          (opts.axis !== 'horizontal' && (py < edge || py > 1 - edge));
        
        if (inEdgeZone) {
          scheduleLoop();
        }
      }
    } else {
      scheduleLoop();
    }
  }

  function handleMouseLeave() {
    pointerInside = false;
    cancelLoop();
  }
  
  // 【性能优化】监听 resize 以失效缓存
  function handleResize() {
    cachedRect = null;
    scrollCacheTime = 0;
  }

  function attachListeners() {
    if (listenersAttached) return;
    node.addEventListener('mousemove', handleMouseMove, { passive: true });
    node.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    listenersAttached = true;
  }

  function detachListeners() {
    if (!listenersAttached) return;
    node.removeEventListener('mousemove', handleMouseMove);
    node.removeEventListener('mouseleave', handleMouseLeave);
    window.removeEventListener('resize', handleResize);
    listenersAttached = false;
    pointerInside = false;
    cancelLoop();
  }

  // 只在启用时添加事件监听器
  if (opts.enabled) {
    attachListeners();
  }

  return {
    update(newOptions?: HoverScrollOptions) {
      opts = { ...DEFAULT_OPTIONS, ...newOptions };
      if (opts.enabled) {
        attachListeners();
      } else {
        detachListeners();
      }
    },
    destroy() {
      detachListeners();
    },
  };
}
