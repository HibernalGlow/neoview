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

    const nx = (pointerX - rect.left) / rect.width - 0.5;
    const ny = (pointerY - rect.top) / rect.height - 0.5;

    const dead = Math.min(Math.max(opts.deadZoneRatio ?? DEFAULT_OPTIONS.deadZoneRatio, 0), 0.49);
    const maxSpeed = opts.maxSpeed ?? DEFAULT_OPTIONS.maxSpeed;

    const computeDelta = (n: number, maxScrollable: number): number => {
      if (maxScrollable <= 0) return 0;
      const abs = Math.abs(n);
      const limit = 0.5;
      if (abs <= dead) return 0;
      const t = Math.min((abs - dead) / (limit - dead), 1);
      const direction = n > 0 ? 1 : -1;
      const v = direction * t * maxSpeed;
      return v * dtSec;
    };

    let dx = 0;
    let dy = 0;

    if (opts.axis === 'horizontal' || opts.axis === 'both') {
      dx = computeDelta(nx, maxScrollLeft);
    }
    if (opts.axis === 'vertical' || opts.axis === 'both') {
      dy = computeDelta(ny, maxScrollTop);
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

  node.addEventListener('mousemove', handleMouseMove);
  node.addEventListener('mouseleave', handleMouseLeave);

  return {
    update(newOptions?: HoverScrollOptions) {
      opts = { ...DEFAULT_OPTIONS, ...newOptions };
      if (!opts.enabled) {
        cancelLoop();
      }
    },
    destroy() {
      cancelLoop();
      node.removeEventListener('mousemove', handleMouseMove);
      node.removeEventListener('mouseleave', handleMouseLeave);
    },
  };
}
