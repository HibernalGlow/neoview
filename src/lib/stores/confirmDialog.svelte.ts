/**
 * 全局确认对话框 Store
 * 提供 Promise-based API 来替代原生 confirm()
 */

type ConfirmDialogVariant = 'default' | 'destructive' | 'warning';

interface ConfirmDialogOptions {
	title?: string;
	description?: string;
	confirmText?: string;
	cancelText?: string;
	variant?: ConfirmDialogVariant;
}

interface ConfirmDialogState {
	open: boolean;
	title: string;
	description: string;
	confirmText: string;
	cancelText: string;
	variant: ConfirmDialogVariant;
	resolver: ((value: boolean) => void) | null;
}

// 创建响应式状态
const dialogState = $state<ConfirmDialogState>({
	open: false,
	title: '确认操作',
	description: '确定要执行此操作吗？',
	confirmText: '确定',
	cancelText: '取消',
	variant: 'default',
	resolver: null
});

/**
 * 显示确认对话框
 * @param options 对话框选项
 * @returns Promise<boolean> 用户确认返回 true，取消返回 false
 */
export function confirm(options: ConfirmDialogOptions | string): Promise<boolean> {
	return new Promise((resolve) => {
		const opts = typeof options === 'string' ? { description: options } : options;
		
		dialogState.title = opts.title ?? '确认操作';
		dialogState.description = opts.description ?? '确定要执行此操作吗？';
		dialogState.confirmText = opts.confirmText ?? '确定';
		dialogState.cancelText = opts.cancelText ?? '取消';
		dialogState.variant = opts.variant ?? 'default';
		dialogState.resolver = resolve;
		dialogState.open = true;
	});
}

/**
 * 确认操作
 */
export function handleConfirm(): void {
	dialogState.resolver?.(true);
	dialogState.open = false;
	dialogState.resolver = null;
}

/**
 * 取消操作
 */
export function handleCancel(): void {
	dialogState.resolver?.(false);
	dialogState.open = false;
	dialogState.resolver = null;
}

/**
 * 处理对话框关闭
 */
export function handleOpenChange(open: boolean): void {
	if (!open) {
		handleCancel();
	}
}

/**
 * 获取对话框状态
 */
export function getDialogState() {
	return {
		get open() { return dialogState.open; },
		set open(v: boolean) { dialogState.open = v; },
		get title() { return dialogState.title; },
		get description() { return dialogState.description; },
		get confirmText() { return dialogState.confirmText; },
		get cancelText() { return dialogState.cancelText; },
		get variant() { return dialogState.variant; }
	};
}

// 导出便捷的确认方法
export const confirmDialog = {
	/**
	 * 显示确认对话框
	 */
	confirm,
	
	/**
	 * 显示删除确认对话框
	 */
	confirmDelete(description: string, title = '确认删除'): Promise<boolean> {
		return confirm({
			title,
			description,
			confirmText: '删除',
			cancelText: '取消',
			variant: 'destructive'
		});
	},
	
	/**
	 * 显示警告确认对话框
	 */
	confirmWarning(description: string, title = '警告'): Promise<boolean> {
		return confirm({
			title,
			description,
			confirmText: '继续',
			cancelText: '取消',
			variant: 'warning'
		});
	},
	
	/**
	 * 显示重置确认对话框
	 */
	confirmReset(description: string, title = '确认重置'): Promise<boolean> {
		return confirm({
			title,
			description,
			confirmText: '重置',
			cancelText: '取消',
			variant: 'warning'
		});
	}
};
