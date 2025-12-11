/**
 * Toast utility functions
 * These functions dispatch events to the Toast component
 */

// 去重机制：记录最近显示的toast和时间戳
let lastToastKey = '';
let lastToastTime = 0;
const TOAST_DEBOUNCE_MS = 500; // 500ms内相同toast不重复显示

function shouldShowToast(key: string): boolean {
	const now = Date.now();
	if (key === lastToastKey && now - lastToastTime < TOAST_DEBOUNCE_MS) {
		return false;
	}
	lastToastKey = key;
	lastToastTime = now;
	return true;
}

export function showSuccessToast(title: string, description?: string) {
	const key = `success:${title}:${description || ''}`;
	if (!shouldShowToast(key)) return;
	
	window.dispatchEvent(new CustomEvent('show-toast', {
		detail: {
			type: 'success',
			title,
			description
		}
	}));
}

export function showErrorToast(title: string, description?: string) {
	const key = `error:${title}:${description || ''}`;
	if (!shouldShowToast(key)) return;
	
	window.dispatchEvent(new CustomEvent('show-toast', {
		detail: {
			type: 'error',
			title,
			description
		}
	}));
}

export function showInfoToast(title: string, description?: string) {
	const key = `info:${title}:${description || ''}`;
	if (!shouldShowToast(key)) return;
	
	window.dispatchEvent(new CustomEvent('show-toast', {
		detail: {
			type: 'info',
			title,
			description
		}
	}));
}

export function showToast(options: {
	title: string;
	description?: string;
	variant?: 'success' | 'error' | 'info';
	duration?: number;
}) {
	const key = `${options.variant || 'info'}:${options.title}:${options.description || ''}`;
	if (!shouldShowToast(key)) return;
	
	window.dispatchEvent(new CustomEvent('show-toast', {
		detail: {
			type: options.variant || 'info',
			title: options.title,
			description: options.description,
			duration: options.duration
		}
	}));
}