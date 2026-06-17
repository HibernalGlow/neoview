/**
 * 轮盘菜单系统 - 类型定义
 */

/** 轮盘扇区数 */
export type SectorCount = 4 | 8 | 12;

/** 轮盘层数 */
export type LayerCount = 1 | 2 | 3;

/** 轮盘槽位 */
export interface RadialSlot {
	/** 绑定的 action id */
	action: string | null;
	/** 显示标签 */
	label?: string;
	/** 图标名称 */
	icon?: string;
	/** 是否启用 */
	enabled?: boolean;
}

/** 轮盘菜单配置 */
export interface RadialMenuConfig {
	/** 唯一 ID */
	id: string;
	/** 显示名称 */
	name: string;
	/** 是否启用 */
	enabled: boolean;
	/** 扇区数 */
	sectorCount: SectorCount;
	/** 层数 */
	layers: LayerCount;
	/** 死区半径（px） */
	deadZonePx: number;
	/** 层间距（px） */
	layerStepPx: number;
	/** 键盘步进距离（px） */
	keyboardStepPx: number;
	/** 空 slot 时是否向内层查找 */
	fallbackToInner: boolean;
	/** 槽位映射，key = `${layer}:${sector}` */
	slots: Record<string, RadialSlot>;
}

/** 命中测试结果 */
export interface HitTestResult {
	/** 层（1-based） */
	layer: number;
	/** 扇区（0-based） */
	sector: number;
	/** 槽位 key */
	key: string;
}

/** 轮盘状态机状态 */
export type RadialState = 'idle' | 'pendingHold' | 'open' | 'committed' | 'cancelled';

/** 轮盘打开模式 */
export type RadialMode = 'pointer' | 'keyboard';
