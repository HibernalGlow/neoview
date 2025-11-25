export type TailOverflowDirection = 'forward' | 'backward';

export type TailOverflowDialogSelection = 'loop' | 'nextBook' | 'stay' | 'cancel';

export interface TailOverflowDialogRequestDetail {
	restId?: string; // legacy compatibility (not used)
	requestId: string;
	direction: TailOverflowDirection;
}

export interface TailOverflowDialogResponseDetail {
	requestId: string;
	selection: TailOverflowDialogSelection;
}
