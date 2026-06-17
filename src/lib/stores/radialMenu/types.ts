/**
 * Radial menu types.
 */

export interface RadialMenuItem {
	id: string;
	action: string | null;
	label: string;
	icon?: string;
	disabled?: boolean;
	children?: RadialMenuItem[];
}

export type RadialVariant = 'slice' | 'bubble';

export interface RadialMenuConfig {
	id: string;
	name: string;
	enabled: boolean;
	layerCount: 1 | 2 | 3;
	items: RadialMenuItem[];
	radius: number;
	innerRadius: number;
	variant: RadialVariant;
	startAngle: number;
	sweepAngle: number;
}

export type RadialState = 'idle' | 'open' | 'committed' | 'cancelled';

export type RadialMode = 'pointer' | 'keyboard';
