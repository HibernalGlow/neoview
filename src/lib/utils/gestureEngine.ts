/**
 * NeoView - Mouse Gesture Engine
 * 鼠标手势识别引擎
 */

import type {
	Point,
	MouseGestureState,
	MouseGestureDirection,
	MouseGestureBinding
} from '../types/keyboard';

export class MouseGestureEngine {
	private state: MouseGestureState;
	private onGestureComplete: (pattern: string) => void;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;

	constructor(onGestureComplete: (pattern: string) => void) {
		this.onGestureComplete = onGestureComplete;
		this.state = {
			isRecording: false,
			startPoint: null,
			lastPoint: null,
			pattern: [],
			minDistance: 50 // 最小识别距离（像素）
		};
	}

	/**
	 * 开始录制手势
	 */
	startRecording(point: Point) {
		this.state.isRecording = true;
		this.state.startPoint = point;
		this.state.lastPoint = point;
		this.state.pattern = [];

		// 创建手势轨迹画布
		this.createGestureCanvas();
	}

	/**
	 * 更新手势轨迹
	 */
	updateGesture(point: Point) {
		if (!this.state.isRecording || !this.state.lastPoint) return;

		const dx = point.x - this.state.lastPoint.x;
		const dy = point.y - this.state.lastPoint.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		// 只有移动距离超过阈值才记录
		if (distance >= this.state.minDistance) {
			const direction = this.getDirection(this.state.lastPoint, point);
			
			// 避免连续重复的方向
			if (
				this.state.pattern.length === 0 ||
				this.state.pattern[this.state.pattern.length - 1] !== direction
			) {
				this.state.pattern.push(direction);
			}

			this.state.lastPoint = point;
		}

		// 绘制轨迹
		this.drawGesturePath(point);
	}

	/**
	 * 结束手势录制
	 */
	finishRecording(): string | null {
		if (!this.state.isRecording) return null;

		this.state.isRecording = false;
		const pattern = this.state.pattern.join('');

		// 清除画布
		this.destroyGestureCanvas();

		// 重置状态
		this.state.startPoint = null;
		this.state.lastPoint = null;
		this.state.pattern = [];

		// 触发回调
		if (pattern.length > 0) {
			this.onGestureComplete(pattern);
			return pattern;
		}

		return null;
	}

	/**
	 * 取消手势录制
	 */
	cancelRecording() {
		this.state.isRecording = false;
		this.state.startPoint = null;
		this.state.lastPoint = null;
		this.state.pattern = [];
		this.destroyGestureCanvas();
	}

	/**
	 * 计算两点之间的方向
	 */
	private getDirection(from: Point, to: Point): MouseGestureDirection {
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const angle = Math.atan2(dy, dx) * (180 / Math.PI);

		// 将角度转换为 8 个方向
		// 右: -22.5 ~ 22.5
		// 右下: 22.5 ~ 67.5
		// 下: 67.5 ~ 112.5
		// 左下: 112.5 ~ 157.5
		// 左: 157.5 ~ -157.5
		// 左上: -157.5 ~ -112.5
		// 上: -112.5 ~ -67.5
		// 右上: -67.5 ~ -22.5

		if (angle >= -22.5 && angle < 22.5) return 'R';
		if (angle >= 22.5 && angle < 67.5) return 'DR';
		if (angle >= 67.5 && angle < 112.5) return 'D';
		if (angle >= 112.5 && angle < 157.5) return 'DL';
		if (angle >= 157.5 || angle < -157.5) return 'L';
		if (angle >= -157.5 && angle < -112.5) return 'UL';
		if (angle >= -112.5 && angle < -67.5) return 'U';
		return 'UR';
	}

	/**
	 * 创建手势轨迹画布
	 */
	private createGestureCanvas() {
		if (this.canvas) return;

		this.canvas = document.createElement('canvas');
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
		this.canvas.style.position = 'fixed';
		this.canvas.style.top = '0';
		this.canvas.style.left = '0';
		this.canvas.style.pointerEvents = 'none';
		this.canvas.style.zIndex = '9999';
		document.body.appendChild(this.canvas);

		this.ctx = this.canvas.getContext('2d');
		if (this.ctx) {
			this.ctx.strokeStyle = '#3b82f6';
			this.ctx.lineWidth = 3;
			this.ctx.lineCap = 'round';
			this.ctx.lineJoin = 'round';
		}
	}

	/**
	 * 绘制手势轨迹
	 */
	private drawGesturePath(point: Point) {
		if (!this.ctx || !this.state.lastPoint) return;

		this.ctx.beginPath();
		this.ctx.moveTo(this.state.lastPoint.x, this.state.lastPoint.y);
		this.ctx.lineTo(point.x, point.y);
		this.ctx.stroke();
	}

	/**
	 * 销毁手势画布
	 */
	private destroyGestureCanvas() {
		if (this.canvas) {
			document.body.removeChild(this.canvas);
			this.canvas = null;
			this.ctx = null;
		}
	}

	/**
	 * 匹配手势模式
	 */
	static matchGesture(pattern: string, bindings: MouseGestureBinding[]): string | null {
		const binding = bindings.find((b) => b.pattern === pattern);
		return binding ? binding.command : null;
	}

	/**
	 * 获取当前状态
	 */
	getState(): MouseGestureState {
		return { ...this.state };
	}
}

/**
 * 触摸手势识别引擎
 */
export class TouchGestureEngine {
	private startTouches: Touch[] = [];
	private startTime: number = 0;
	private startDistance: number = 0;
	private startAngle: number = 0;
	private longPressTimer: number | null = null;
	private tapCount: number = 0;
	private tapTimer: number | null = null;

	private readonly SWIPE_THRESHOLD = 50; // 滑动阈值
	private readonly LONG_PRESS_DURATION = 500; // 长按时长
	private readonly DOUBLE_TAP_DELAY = 300; // 双击延迟

	constructor(
		private onGesture: (gesture: string) => void
	) {}

	/**
	 * 处理触摸开始
	 */
	handleTouchStart(event: TouchEvent) {
		this.startTouches = Array.from(event.touches);
		this.startTime = Date.now();

		if (this.startTouches.length === 1) {
			// 单指：可能是点击、长按或滑动
			this.startLongPressDetection();
			this.handleTap();
		} else if (this.startTouches.length === 2) {
			// 双指：捏合或旋转
			this.startDistance = this.getTouchDistance(this.startTouches);
			this.startAngle = this.getTouchAngle(this.startTouches);
		}
	}

	/**
	 * 处理触摸移动
	 */
	handleTouchMove(event: TouchEvent) {
		this.cancelLongPress();
		this.cancelTap();

		const touches = Array.from(event.touches);

		if (touches.length === 1 && this.startTouches.length === 1) {
			// 单指滑动
			const dx = touches[0].clientX - this.startTouches[0].clientX;
			const dy = touches[0].clientY - this.startTouches[0].clientY;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance > this.SWIPE_THRESHOLD) {
				const gesture = this.getSwipeGesture(dx, dy, 1);
				if (gesture) {
					this.onGesture(gesture);
					this.startTouches = touches; // 更新起点
				}
			}
		} else if (touches.length === 2 && this.startTouches.length === 2) {
			// 双指捏合/旋转
			const currentDistance = this.getTouchDistance(touches);
			const currentAngle = this.getTouchAngle(touches);

			const distanceChange = currentDistance - this.startDistance;
			const angleChange = currentAngle - this.startAngle;

			if (Math.abs(distanceChange) > 20) {
				this.onGesture(distanceChange > 0 ? 'pinch-out' : 'pinch-in');
				this.startDistance = currentDistance;
			}

			if (Math.abs(angleChange) > 15) {
				this.onGesture(angleChange > 0 ? 'rotate-clockwise' : 'rotate-counter-clockwise');
				this.startAngle = currentAngle;
			}
		} else if (touches.length === 2 && this.startTouches.length === 2) {
			// 双指滑动
			const dx = (touches[0].clientX + touches[1].clientX) / 2 - 
			           (this.startTouches[0].clientX + this.startTouches[1].clientX) / 2;
			const dy = (touches[0].clientY + touches[1].clientY) / 2 - 
			           (this.startTouches[0].clientY + this.startTouches[1].clientY) / 2;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance > this.SWIPE_THRESHOLD) {
				const gesture = this.getSwipeGesture(dx, dy, 2);
				if (gesture) {
					this.onGesture(gesture);
					this.startTouches = touches;
				}
			}
		} else if (touches.length === 3 && this.startTouches.length === 3) {
			// 三指滑动
			const dx = touches.reduce((sum, t, i) => sum + t.clientX - this.startTouches[i].clientX, 0) / 3;
			const dy = touches.reduce((sum, t, i) => sum + t.clientY - this.startTouches[i].clientY, 0) / 3;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance > this.SWIPE_THRESHOLD) {
				const gesture = this.getSwipeGesture(dx, dy, 3);
				if (gesture) {
					this.onGesture(gesture);
					this.startTouches = touches;
				}
			}
		}
	}

	/**
	 * 处理触摸结束
	 */
	handleTouchEnd() {
		this.cancelLongPress();
		this.startTouches = [];
	}

	/**
	 * 获取滑动手势
	 */
	private getSwipeGesture(dx: number, dy: number, fingers: number): string | null {
		const prefix = fingers === 1 ? '' : fingers === 2 ? 'two-finger-' : 'three-finger-';
		
		if (Math.abs(dx) > Math.abs(dy)) {
			return prefix + (dx > 0 ? 'swipe-right' : 'swipe-left');
		} else {
			return prefix + (dy > 0 ? 'swipe-down' : 'swipe-up');
		}
	}

	/**
	 * 计算两个触点之间的距离
	 */
	private getTouchDistance(touches: Touch[]): number {
		if (touches.length < 2) return 0;
		const dx = touches[1].clientX - touches[0].clientX;
		const dy = touches[1].clientY - touches[0].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	/**
	 * 计算两个触点之间的角度
	 */
	private getTouchAngle(touches: Touch[]): number {
		if (touches.length < 2) return 0;
		const dx = touches[1].clientX - touches[0].clientX;
		const dy = touches[1].clientY - touches[0].clientY;
		return Math.atan2(dy, dx) * (180 / Math.PI);
	}

	/**
	 * 开始长按检测
	 */
	private startLongPressDetection() {
		this.longPressTimer = window.setTimeout(() => {
			this.onGesture('long-press');
			this.longPressTimer = null;
		}, this.LONG_PRESS_DURATION);
	}

	/**
	 * 取消长按
	 */
	private cancelLongPress() {
		if (this.longPressTimer) {
			clearTimeout(this.longPressTimer);
			this.longPressTimer = null;
		}
	}

	/**
	 * 处理点击
	 */
	private handleTap() {
		this.tapCount++;

		if (this.tapTimer) {
			clearTimeout(this.tapTimer);
		}

		this.tapTimer = window.setTimeout(() => {
			if (this.tapCount === 1) {
				this.onGesture('tap');
			} else if (this.tapCount === 2) {
				this.onGesture('double-tap');
			}
			this.tapCount = 0;
			this.tapTimer = null;
		}, this.DOUBLE_TAP_DELAY);
	}

	/**
	 * 取消点击
	 */
	private cancelTap() {
		if (this.tapTimer) {
			clearTimeout(this.tapTimer);
			this.tapTimer = null;
			this.tapCount = 0;
		}
	}

	/**
	 * 清理
	 */
	destroy() {
		this.cancelLongPress();
		this.cancelTap();
	}
}
