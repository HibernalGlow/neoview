/**
 * [Legacy] 轮盘菜单系统 - 几何计算纯函数
 *
 * 此文件为旧版 layer:sector 槽位模型的几何计算工具。
 * 当前系统已迁移至 ray-menu Web Component（flat items 模型），
 * 几何计算由 ray-menu 内部处理。此文件保留仅供参考，不再被任何模块引用。
 */

/** 旧版轮盘配置（layer:sector 模型） */
interface LegacyRadialMenuConfig {
	sectorCount: number;
	layers: number;
	deadZonePx: number;
	layerStepPx: number;
}

/** 旧版命中测试结果 */
interface LegacyHitTestResult {
	layer: number;
	sector: number;
	key: string;
}

/**
 * 命中测试：根据偏移量计算命中的层和扇区
 *
 * @param dx 相对中心的 X 偏移
 * @param dy 相对中心的 Y 偏移
 * @param config 轮盘配置
 * @returns 命中结果，死区返回 null
 */
export function hitTestRadial(
	dx: number,
	dy: number,
	config: LegacyRadialMenuConfig
): LegacyHitTestResult | null {
	const r = Math.hypot(dx, dy);
	if (r < config.deadZonePx) return null;

	// 角度：0 = 右，逆时针为正（标准 atan2）
	const angle = Math.atan2(dy, dx);

	// 扇区计算：将角度映射到 [0, sectorCount)
	const sectorAngle = (Math.PI * 2) / config.sectorCount;
	// +sectorAngle/2 使扇区0以正右方为中心
	const sector =
		Math.floor((angle + sectorAngle / 2 + Math.PI * 2) / sectorAngle) % config.sectorCount;

	// 层计算：从死区边缘开始，每 layerStepPx 一层
	const layer = Math.min(
		config.layers,
		Math.max(1, Math.ceil((r - config.deadZonePx) / config.layerStepPx))
	);

	return {
		layer,
		sector,
		key: `${layer}:${sector}`
	};
}

/**
 * 获取扇区的起始角度和结束角度
 */
export function getSectorAngles(
	sector: number,
	sectorCount: number
): { start: number; end: number; center: number } {
	const sectorAngle = (Math.PI * 2) / sectorCount;
	const center = sector * sectorAngle;
	return {
		start: center - sectorAngle / 2,
		end: center + sectorAngle / 2,
		center
	};
}

/**
 * 获取某层某扇区中心点的极坐标偏移
 */
export function getSlotOffset(
	layer: number,
	sector: number,
	config: LegacyRadialMenuConfig
): { x: number; y: number } {
	const r = config.deadZonePx + (layer - 0.5) * config.layerStepPx;
	const sectorAngle = (Math.PI * 2) / config.sectorCount;
	const angle = sector * sectorAngle;
	return {
		x: Math.cos(angle) * r,
		y: Math.sin(angle) * r
	};
}

/**
 * 获取轮盘的最大半径
 */
export function getMaxRadius(config: LegacyRadialMenuConfig): number {
	return config.deadZonePx + config.layers * config.layerStepPx;
}
