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

export function hoverScroll(node: HTMLElement, options: HoverScrollOptions = {}) {
  let opts = { ...DEFAULT_OPTIONS, ...options };

  let frameId: number | null = null;
  let lastTimestamp = 0;
  let pointerInside = false;
  let pointerX = 0;
  let pointerY = 0;
  let listenersAttached = false;

  function cancelLoop() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    lastTimestamp = 0;
  }

  function scheduleLoop() {
    if (!opts.enabled || frameId !== null || !pointerInside) return;
    frameId = requestAnimationFrame(step);
  }

  function step(timestamp: number) {
    frameId = null;

    if (!opts.enabled || !pointerInside) {
      lastTimestamp = 0;
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

    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      scheduleLoop();
      return;
    }

    const maxScrollLeft = node.scrollWidth - node.clientWidth;
    const maxScrollTop = node.scrollHeight - node.clientHeight;

    if (maxScrollLeft <= 0 && maxScrollTop <= 0) {
      scheduleLoop();
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

    if (dx !== 0) {
      const nextLeft = Math.min(maxScrollLeft, Math.max(0, node.scrollLeft + dx));
      node.scrollLeft = nextLeft;
    }
    if (dy !== 0) {
      const nextTop = Math.min(maxScrollTop, Math.max(0, node.scrollTop + dy));
      node.scrollTop = nextTop;
    }

    scheduleLoop();
  }

  function handleMouseMove(event: MouseEvent) {
    pointerInside = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    scheduleLoop();
  }

  function handleMouseLeave() {
    pointerInside = false;
    cancelLoop();
  }

  function attachListeners() {
    if (listenersAttached) return;
    node.addEventListener('mousemove', handleMouseMove);
    node.addEventListener('mouseleave', handleMouseLeave);
    listenersAttached = true;
  }

  function detachListeners() {
    if (!listenersAttached) return;
    node.removeEventListener('mousemove', handleMouseMove);
    node.removeEventListener('mouseleave', handleMouseLeave);
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
