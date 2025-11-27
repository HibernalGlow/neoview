// hoverPan.ts
export type HoverPanAxis = 'both' | 'horizontal' | 'vertical';

export interface HoverPanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface HoverPanPosition {
  x: number;
  y: number;
}

export interface HoverPanOptions {
  enabled?: boolean;
  axis?: HoverPanAxis;
  maxSpeed?: number;        // px/s
  deadZoneRatio?: number;   // 0~0.49，边缘触发宽度比例
  getBounds?: () => HoverPanBounds;
  getPosition?: () => HoverPanPosition;
  setPosition?: (pos: HoverPanPosition) => void;
}

const DEFAULT_OPTIONS: Required<
  Pick<HoverPanOptions, 'enabled' | 'axis' | 'maxSpeed' | 'deadZoneRatio'>
> = {
  enabled: true,
  axis: 'both',
  maxSpeed: 1500,
  deadZoneRatio: 0.3
};

export function hoverPan(node: HTMLElement, options: HoverPanOptions) {
  let opts: HoverPanOptions = { ...DEFAULT_OPTIONS, ...options };

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

    const pxRaw = (pointerX - rect.left) / rect.width;
    const pyRaw = (pointerY - rect.top) / rect.height;
    const px = Math.min(Math.max(pxRaw, 0), 1);
    const py = Math.min(Math.max(pyRaw, 0), 1);

    const edge = Math.min(
      Math.max(opts.deadZoneRatio ?? DEFAULT_OPTIONS.deadZoneRatio, 0.01),
      0.49
    );
    const maxSpeed = opts.maxSpeed ?? DEFAULT_OPTIONS.maxSpeed;

    const computeEdgeSpeed = (p: number): number => {
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

      return direction * t * maxSpeed;
    };

    const bounds = opts.getBounds?.() ?? {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0
    };
    const pos = opts.getPosition?.() ?? { x: 0, y: 0 };

    let nextX = pos.x;
    let nextY = pos.y;

    if (opts.axis === 'horizontal' || opts.axis === 'both') {
      const vx = -computeEdgeSpeed(px);
      const dx = vx * dtSec;
      nextX = Math.min(bounds.maxX, Math.max(bounds.minX, pos.x + dx));
    }

    if (opts.axis === 'vertical' || opts.axis === 'both') {
      const vy = -computeEdgeSpeed(py);
      const dy = vy * dtSec;
      nextY = Math.min(bounds.maxY, Math.max(bounds.minY, pos.y + dy));
    }

    if (opts.setPosition) {
      opts.setPosition({ x: nextX, y: nextY });
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
    update(newOptions?: HoverPanOptions) {
      opts = { ...DEFAULT_OPTIONS, ...newOptions };
      if (!opts.enabled) {
        cancelLoop();
      }
    },
    destroy() {
      cancelLoop();
      node.removeEventListener('mousemove', handleMouseMove);
      node.removeEventListener('mouseleave', handleMouseLeave);
    }
  };
}