/**
 * 滚动预测模块
 * 根据滚动方向和速度预测用户下一步可能查看的内容
 */

export type ScrollDirection = 'up' | 'down' | 'none';

export interface ScrollInfo {
    position: number;
    direction: ScrollDirection;
    velocity: number;  // 像素/毫秒
    timestamp: number;
}

export interface PredictRange {
    start: number;
    end: number;
    confidence: number;  // 0-1，预测的置信度
}

export interface ScrollPredictorConfig {
    predictionMultiplier: number;  // 预测范围倍数
    minVelocity: number;           // 最小速度阈值（px/ms）
    smoothingFactor: number;       // 平滑系数（0-1）
}

/**
 * 滚动预测器
 * 追踪滚动行为并预测用户下一步会查看的范围
 */
export class ScrollPredictor {
    private lastPosition = 0;
    private lastTimestamp = 0;
    private direction: ScrollDirection = 'none';
    private velocity = 0;
    private smoothedVelocity = 0;

    private config: ScrollPredictorConfig;

    constructor(config: Partial<ScrollPredictorConfig> = {}) {
        this.config = {
            predictionMultiplier: config.predictionMultiplier ?? 2,
            minVelocity: config.minVelocity ?? 0.1,
            smoothingFactor: config.smoothingFactor ?? 0.3,
        };
    }

    /**
     * 更新滚动信息
     * @param position 当前滚动位置
     * @param viewportHeight 视口高度
     * @returns 更新后的滚动信息
     */
    update(position: number, viewportHeight: number): ScrollInfo {
        const now = Date.now();

        // 首次更新
        if (this.lastTimestamp === 0) {
            this.lastPosition = position;
            this.lastTimestamp = now;
            return {
                position,
                direction: 'none',
                velocity: 0,
                timestamp: now,
            };
        }

        // 计算变化
        const deltaPosition = position - this.lastPosition;
        const deltaTime = now - this.lastTimestamp;

        if (deltaTime === 0) {
            return {
                position,
                direction: this.direction,
                velocity: this.smoothedVelocity,
                timestamp: now,
            };
        }

        // 计算瞬时速度（px/ms）
        const instantVelocity = deltaPosition / deltaTime;

        // 平滑速度（指数移动平均）
        this.smoothedVelocity =
            this.config.smoothingFactor * instantVelocity +
            (1 - this.config.smoothingFactor) * this.smoothedVelocity;

        // 更新方向
        if (Math.abs(this.smoothedVelocity) > this.config.minVelocity) {
            this.direction = this.smoothedVelocity > 0 ? 'down' : 'up';
        } else {
            this.direction = 'none';
        }

        // 更新状态
        this.lastPosition = position;
        this.lastTimestamp = now;
        this.velocity = this.smoothedVelocity;

        return {
            position,
            direction: this.direction,
            velocity: this.smoothedVelocity,
            timestamp: now,
        };
    }

    /**
     * 预测下一个可见范围
     * @param currentStart 当前可见范围开始
     * @param currentEnd 当前可见范围结束
     * @param viewportHeight 视口高度
     * @returns 预测的范围
     */
    predict(
        currentStart: number,
        currentEnd: number,
        viewportHeight: number
    ): PredictRange | null {
        // 如果没有明显方向，不预测
        if (this.direction === 'none') {
            return null;
        }

        // 计算预测距离（基于速度）
        const predictionDistance = viewportHeight * this.config.predictionMultiplier;

        // 计算置信度（基于速度的稳定性）
        const confidence = Math.min(1, Math.abs(this.smoothedVelocity) / 2);

        if (this.direction === 'down') {
            // 向下滚动，预测下方内容
            return {
                start: currentEnd,
                end: currentEnd + predictionDistance,
                confidence,
            };
        } else {
            // 向上滚动，预测上方内容
            return {
                start: Math.max(0, currentStart - predictionDistance),
                end: currentStart,
                confidence,
            };
        }
    }

    /**
     * 重置预测器
     */
    reset(): void {
        this.lastPosition = 0;
        this.lastTimestamp = 0;
        this.direction = 'none';
        this.velocity = 0;
        this.smoothedVelocity = 0;
    }

    /**
     * 获取当前状态
     */
    getState() {
        return {
            direction: this.direction,
            velocity: this.smoothedVelocity,
            isScrolling: this.direction !== 'none',
        };
    }
}
